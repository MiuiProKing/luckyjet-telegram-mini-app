"""Local SQLite collector + web UI. No Telegram, authentication keys, bets or paid endpoints."""
import argparse
import json
import math
import sqlite3
import threading
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlparse, parse_qs
from urllib.request import Request, urlopen
from inference import features, predict

ROOT=Path(__file__).resolve().parents[1]
PUBLIC=ROOT/'bog-hishchnik-alert'
SOURCE='https://xrniwkvfrtchtxjrwwgd.supabase.co/functions/v1/v0xff3-live'

class Collector:
    def __init__(self,database,artifact,clock=time.time):
        self.lock=threading.RLock();self.clock=clock;self.artifact=artifact
        self.db=sqlite3.connect(database,check_same_thread=False)
        self.db.row_factory=sqlite3.Row
        self.db.executescript('''PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS rounds(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,
        coefficient REAL NOT NULL CHECK(coefficient>=1),timestamp REAL,estimated INTEGER NOT NULL,received_at REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS predictions(id TEXT PRIMARY KEY,anchor TEXT NOT NULL,target REAL NOT NULL,horizon INTEGER NOT NULL,
        model TEXT NOT NULL,version TEXT NOT NULL,probability REAL NOT NULL,baseline REAL NOT NULL,created_at REAL NOT NULL,
        status TEXT NOT NULL,observed_ids TEXT NOT NULL DEFAULT '[]',values_json TEXT NOT NULL DEFAULT '[]',outcome INTEGER,reason TEXT);
        CREATE TRIGGER IF NOT EXISTS frozen_prediction BEFORE UPDATE OF anchor,target,horizon,model,version,probability,baseline,created_at ON predictions
        BEGIN SELECT RAISE(ABORT,'Prediction parameters are immutable'); END;
        CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);''')
        self.db.execute("UPDATE predictions SET status='unknown',reason='Collector restarted; coverage unknown' WHERE status='pending'")
        self.db.commit();self.anchor=None;self.last_poll=0;self.last_new=0;self.error='Ожидание источника';self.conflicts=0;self.gap=True;self.retries=0
        saved=self.db.execute("SELECT value FROM settings WHERE key='pause2x'").fetchone()
        self.pause=json.loads(saved[0]) if saved else {'streak':0,'paused':False}

    def save_pause(self):
        self.db.execute("INSERT OR REPLACE INTO settings VALUES('pause2x',?)",(json.dumps(self.pause),))

    @staticmethod
    def valid(row):
        if not isinstance(row,dict) or not isinstance(row.get('id'),str) or not row['id'] or len(row['id'])>200 or isinstance(row.get('coefficient'),bool) or row.get('completed') is False or row.get('status') in ['running','pending','active']:
            return None
        try: value=float(row.get('coefficient',row.get('topCoefficient')))
        except (ValueError,TypeError):return None
        if not math.isfinite(value) or value<1:return None
        stamp=row.get('timestamp'); estimated=bool(row.get('estimated',False))
        try:
            stamp=float(stamp)
            if not math.isfinite(stamp) or stamp<1e11:stamp=None;estimated=True
        except (ValueError,TypeError):stamp=None;estimated=True
        return dict(id=row['id'],coefficient=value,timestamp=stamp,estimated=estimated)

    def ingest(self,raw):
        with self.lock:
            rows=[];seen=set()
            for item in raw:
                row=self.valid(item)
                if row and row['id'] not in seen:rows.append(row);seen.add(row['id'])
            if not rows:raise ValueError('Нет завершённых валидных результатов')
            now=self.clock();ids=[r['id'] for r in rows]
            continuous=self.anchor is not None and self.anchor in ids and now-self.last_poll<=15 and not self.error
            boundary=ids.index(self.anchor) if self.anchor in ids else 0
            arrivals=rows[:boundary][::-1] if continuous else []
            self.gap=not continuous
            with self.db:
                if not continuous:self.db.execute("UPDATE predictions SET status='unknown',reason='Delivery gap; cannot score' WHERE status='pending'")
                added=set()
                for row in reversed(rows):
                    old=self.db.execute('SELECT coefficient FROM rounds WHERE id=?',(row['id'],)).fetchone()
                    if old:
                        if old[0]!=row['coefficient']:self.conflicts+=1;self.gap=True
                        continue
                    self.db.execute('INSERT INTO rounds(id,coefficient,timestamp,estimated,received_at) VALUES(?,?,?,?,?)',(row['id'],row['coefficient'],row['timestamp'],int(row['estimated']),now))
                    added.add(row['id'])
                if self.gap and continuous:self.db.execute("UPDATE predictions SET status='unknown',reason='ID conflict' WHERE status='pending'")
                if added and (self.anchor is None or rows[0]['id'] in added):self.last_new=now
                if continuous and not self.gap:
                    for row in arrivals:
                        if row['id'] in added:self.observe(row)
                self.anchor=rows[0]['id'];self.last_poll=now;self.error='';self.retries=0
                # Current response is a delivery sequence, not a certified game sequence.
                # Write shadow forecasts before any future responses can be processed.
                past=self.db.execute('SELECT coefficient FROM rounds ORDER BY seq DESC LIMIT 200').fetchall()
                if not self.gap and now-self.last_new<180 and len(past)>=200:
                    x=features([r[0] for r in past][::-1])
                    for key in ['2x_1','2x_3','10x_1','20x_1','50x_1']:
                        task=self.artifact['tasks'][key]
                        if task['target']==2 and self.pause['paused']:continue
                        if self.db.execute("SELECT 1 FROM predictions WHERE target=? AND horizon=? AND status='pending'",(task['target'],task['horizon'])).fetchone():continue
                        identifier=f"{self.artifact['version']}:{self.anchor}:{key}"
                        model=task['selected']; p=predict(task['models'][model],x)
                        self.db.execute('INSERT OR IGNORE INTO predictions(id,anchor,target,horizon,model,version,probability,baseline,created_at,status) VALUES(?,?,?,?,?,?,?,?,?,?)',(identifier,self.anchor,task['target'],task['horizon'],model,self.artifact['version'],p,task['baseline'],now,'pending'))
            return len(added)

    def observe(self,row):
        for record in self.db.execute("SELECT * FROM predictions WHERE status='pending'").fetchall():
            ids=json.loads(record['observed_ids']);values=json.loads(record['values_json'])
            if row['id']==record['anchor'] or row['id'] in ids:continue
            ids.append(row['id']);values.append(row['coefficient']);status='pending';outcome=None
            if len(values)>=record['horizon']:
                outcome=int(any(v>=record['target'] for v in values));status='observed'
                # Pause follows the primary 2x / 3-round mode, not overlapping auxiliary horizons.
                if record['target']==2 and record['horizon']==3:
                    self.pause['streak']=0 if outcome else self.pause['streak']+1
                    self.pause['paused']=self.pause['streak']>=2;self.save_pause()
            self.db.execute('UPDATE predictions SET observed_ids=?,values_json=?,status=?,outcome=? WHERE id=?',(json.dumps(ids),json.dumps(values),status,outcome,record['id']))

    def failure(self,message):
        with self.lock,self.db:
            self.error=message;self.gap=True;self.retries+=1
            self.db.execute("UPDATE predictions SET status='unknown',reason='Source error' WHERE status='pending'")

    def history(self,limit,offset):
        with self.lock:
            data=[dict(r) for r in self.db.execute('SELECT id,coefficient,timestamp,estimated FROM rounds ORDER BY seq DESC LIMIT ? OFFSET ?',(limit,offset))]
            return dict(ok=True,total=self.db.execute('SELECT count(*) FROM rounds').fetchone()[0],history=data,collector=self.report())

    def report(self):
        with self.lock:
            report={'source':SOURCE,'sqlite':True,'fresh':bool(self.last_new and self.clock()-self.last_new<180 and not self.error),'last_poll':self.last_poll,'last_new':self.last_new,'error':self.error,'gap':self.gap,'id_conflicts':self.conflicts,'paused_2x':self.pause['paused'],'promoted_models':0,'confirmed_signals':0,'game_order_verified':False}
            for title,where in [('MAIN','target=2'),('BIG','target>=10')]:
                groups=[]
                for target,horizon in self.db.execute('SELECT DISTINCT target,horizon FROM predictions WHERE '+where):
                    rows=self.db.execute('SELECT * FROM predictions WHERE target=? AND horizon=?',(target,horizon)).fetchall()
                    good=[r for r in rows if r['status']=='observed'];wins=sum(r['outcome'] for r in good)
                    groups.append(dict(target=target,horizon=horizon,observations=len(good),hits=wins,misses=len(good)-wins,unknown=sum(r['status']=='unknown' for r in rows),pending=sum(r['status']=='pending' for r in rows),brier=sum((r['outcome']-r['probability'])**2 for r in good)/len(good) if good else None,unverified=True))
                report[title]=groups
            return report

def retry_delay(error,attempt):
    if isinstance(error,HTTPError):
        if error.code==403:return 120
        if error.code==429:
            value=error.headers.get('Retry-After') if error.headers else None
            try:delay=float(value)
            except (ValueError,TypeError):
                try:delay=parsedate_to_datetime(value).timestamp()-time.time()
                except (ValueError,TypeError):delay=30
            return min(300,max(5,delay))
    return min(60,2**min(attempt,6))

def run_collector(collector,stop):
    while not stop.is_set():
        started=time.monotonic();delay=1
        try:
            limit=1000 if collector.anchor is None else 100
            request=Request(SOURCE+f'?limit={limit}&offset=0&t='+str(int(time.time()*1000)),headers={'Accept':'application/json','Cache-Control':'no-cache'})
            with urlopen(request,timeout=10) as response:data=json.load(response)
            if data.get('ok') is not True or not isinstance(data.get('history'),list):raise ValueError('Неверный формат истории')
            if collector.anchor is not None and collector.anchor not in [r.get('id') for r in data['history']]:
                request=Request(SOURCE+'?limit=1000&offset=0&t='+str(int(time.time()*1000)),headers={'Accept':'application/json'})
                with urlopen(request,timeout=10) as response:data=json.load(response)
            collector.ingest(data['history'])
            delay=max(0,1-(time.monotonic()-started))
        except Exception as error:
            collector.failure(str(error));delay=retry_delay(error,collector.retries)
        stop.wait(delay)

def make_handler(collector):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(PUBLIC),**kwargs)
        def send_json(self,data):
            body=json.dumps(data,ensure_ascii=False).encode();self.send_response(200);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        def do_GET(self):
            parsed=urlparse(self.path)
            if parsed.path=='/runtime-config.js':
                body=b"window.BOG_RUNTIME={api:'/api/live',sqlite:true};";self.send_response(200);self.send_header('Content-Type','text/javascript');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
            elif parsed.path=='/api/live':
                query=parse_qs(parsed.query)
                try:limit=min(2000,max(1,int(query.get('limit',[100])[0])));offset=max(0,int(query.get('offset',[0])[0]))
                except (ValueError,TypeError):self.send_error(400);return
                if collector.error:self.send_error(503,'Collector waiting for source');return
                self.send_json(collector.history(limit,offset))
            elif parsed.path=='/api/report':self.send_json(collector.report())
            elif parsed.path=='/api/resume':
                self.send_error(405,'Use POST for resume')
            else:super().do_GET()
        def do_POST(self):
            origin=self.headers.get('Origin','');host=self.headers.get('Host','')
            if self.path!='/api/resume' or origin not in ['http://'+host,'']:
                self.send_error(403);return
            with collector.lock,collector.db:collector.pause={'streak':0,'paused':False};collector.save_pause()
            self.send_json({'ok':True})
        def log_message(self,format,*args):pass
    return Handler

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8790);parser.add_argument('--database',type=Path,default=ROOT/'.data/live.sqlite3');args=parser.parse_args()
    args.database.parent.mkdir(parents=True,exist_ok=True)
    artifact=json.loads((PUBLIC/'ml-models.json').read_text(encoding='utf-8'));collector=Collector(str(args.database),artifact)
    stop=threading.Event();thread=threading.Thread(target=run_collector,args=(collector,stop),daemon=True);thread.start()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),make_handler(collector))
    print(f'Lucky Jet без Telegram: http://127.0.0.1:{args.port}/ · SQLite {args.database}',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:stop.set();server.server_close();thread.join(12);collector.db.close()

if __name__=='__main__':main()
