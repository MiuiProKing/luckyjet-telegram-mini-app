"""Durable GOD PREDITOR Telegram runtime. Importing this module never sends messages."""
import argparse, base64, hashlib, json, logging, math, os, re, sqlite3, sys, threading, time
from contextlib import contextmanager
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import escape
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo
import requests
from engine import analyze_all, analyze_report, validate_window

VERSION = 'god-complete-20261120'
CONTACTS = {'inline_keyboard': [[{'text':'Instagram разработчика','url':'https://www.instagram.com/vyacheslavvya?utm_source=qr'}, {'text':'Telegram разработчика','url':'https://t.me/V0xFF3'}]]}
PHOTO_ID='1kOtDjG_wReBMOMDDO1yHVW3K9k1JxLBq'
PHOTO_SHA256='643e9d623a30888f4e24e033341b474c2e2c28c0e97ddb64744317d544a5811f'

def ms(): return int(time.time()*1000)
def numeric(v):
    if isinstance(v,bool): return None
    try: return float(v) if math.isfinite(float(v)) else None
    except (TypeError,ValueError,OverflowError): return None

def stamp(value):
    if isinstance(value,str):
        try:return int(datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()*1000)
        except (ValueError,OverflowError):return None
    v=numeric(value)
    return int(v if v and v>1e11 else v*1000) if v is not None else None

def chats(config):
    raw=str(config.get('TELEGRAM_CHAT_IDS') or config.get('TELEGRAM_CHAT_ID') or '')
    result=[]
    for part in re.split(r'[,;\s]+',raw):
        if part and part not in result:
            if not re.fullmatch(r'-?\d{5,20}|@[A-Za-z][A-Za-z0-9_]{4,31}',part):raise ValueError('Неверный формат группы Telegram')
            result.append(part)
    if not result:raise ValueError('Не указаны группы Telegram')
    return result

def secure_url(value):
    u=urlsplit(str(value))
    if u.scheme!='https' or not u.hostname or u.username or u.password or u.query or u.fragment:raise ValueError('Неверный HTTPS адрес')
    return str(value).rstrip('/')

def safe_log(message,config=None):
    message=str(message)
    for key,value in (config or {}).items():
        if ('TOKEN' in key or 'KEY' in key or 'PASSWORD' in key) and isinstance(value,str) and value:message=message.replace(value,'[СКРЫТО]')
    message=re.sub(r'\b\d{6,12}:[A-Za-z0-9_-]{25,}','[СКРЫТО]',message)
    print(datetime.now(timezone.utc).isoformat(timespec='seconds')+' | '+message[:600],flush=True)

class SourceError(RuntimeError):pass
class DeliveryError(RuntimeError):
    def __init__(self,code,retry_after=0,ambiguous=False):
        self.code,self.retry_after,self.ambiguous=code,retry_after,ambiguous
        super().__init__('Telegram HTTP '+str(code))

class Journal:
    def __init__(self,path):
        self.db=sqlite3.connect(path,timeout=15,check_same_thread=False)
        self.db.row_factory=sqlite3.Row
        self.lock=threading.RLock()
        with self.lock:
            self.db.executescript('''PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS rounds(id TEXT PRIMARY KEY,at INTEGER NOT NULL,feed INTEGER NOT NULL,payload TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS rounds_at ON rounds(at);
            CREATE INDEX IF NOT EXISTS rounds_feed ON rounds(feed);
            CREATE TABLE IF NOT EXISTS signals(id TEXT PRIMARY KEY,channel TEXT NOT NULL,start INTEGER NOT NULL,end INTEGER NOT NULL,issued INTEGER NOT NULL,metadata TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',actual REAL,result_at INTEGER);
            CREATE INDEX IF NOT EXISTS signal_channel ON signals(channel,end);
            CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,signal_id TEXT NOT NULL,at INTEGER NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS deliveries(signal_id TEXT NOT NULL,chat TEXT NOT NULL,phase TEXT NOT NULL,step TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'ready',attempts INTEGER NOT NULL DEFAULT 0,available INTEGER NOT NULL DEFAULT 0,message_id INTEGER,error TEXT,PRIMARY KEY(signal_id,chat,phase,step));
            ''')
            # A POST interrupted by restart might already have reached Telegram. Never duplicate it blindly.
            self.db.execute("UPDATE deliveries SET state='ambiguous',error='process_interrupted' WHERE state='sending'")
            self.db.commit()
    def get(self,key,default=None):
        with self.lock:
            row=self.db.execute('SELECT value FROM meta WHERE key=?',(key,)).fetchone()
            return json.loads(row[0]) if row else default
    def set(self,key,value):
        with self.lock:self.db.execute('INSERT OR REPLACE INTO meta VALUES(?,?)',(key,json.dumps(value)));self.db.commit()
    def store_rounds(self,rows,now):
        good=[]
        for r in rows:
            at=stamp(r.get('round_timestamp',r.get('played_at',r.get('timestamp'))));coef=numeric(r.get('coefficient'));feed=numeric(r.get('feed_order',r.get('source_seq')))
            if not r.get('id') or at is None or at>now or coef is None or coef<1 or feed is None or r.get('estimated') is True or r.get('completed') is False:continue
            item={**r,'timestamp':at,'coefficient':coef,'feed_order':int(feed)}
            good.append((str(r['id']),at,int(feed),json.dumps(item,separators=(',',':'))))
        with self.lock:
            self.db.executemany('INSERT OR IGNORE INTO rounds VALUES(?,?,?,?)',good);self.db.commit()
        return len(good)
    def history(self,after=None):
        with self.lock:
            query='SELECT payload FROM rounds';args=()
            if after is not None:query+=' WHERE at>=?';args=(after,)
            query+=' ORDER BY at,id'
            return [json.loads(r[0]) for r in self.db.execute(query,args)]
    def add_signal(self,s,chat_ids):
        at=s['issuedAt'];payload=json.dumps(s,separators=(',',':'),ensure_ascii=False)
        with self.lock:
            try:
                self.db.execute('INSERT INTO signals(id,channel,start,end,issued,metadata) VALUES(?,?,?,?,?,?)',(s['id'],s['channel'],s['start'],s['end'],at,payload))
            except sqlite3.IntegrityError:return False
            self.db.execute('INSERT INTO events(signal_id,at,kind,payload) VALUES(?,?,?,?)',(s['id'],at,'created',payload))
            for chat in chat_ids:
                for step in ('photo','text'):self.db.execute("INSERT INTO deliveries(signal_id,chat,phase,step) VALUES(?,?,'forecast',?)",(s['id'],chat,step))
            self.db.commit();return True
    def active(self,channel,now):
        with self.lock:return self.db.execute("SELECT 1 FROM signals WHERE channel=? AND end>=?",(channel,now)).fetchone() is not None
    def last_basis(self,channel):
        with self.lock:
            row=self.db.execute('SELECT metadata FROM signals WHERE channel=? ORDER BY issued DESC LIMIT 1',(channel,)).fetchone()
            return json.loads(row[0]).get('basisId') if row else None
    def unresolved(self):
        with self.lock:return [dict(r) for r in self.db.execute("SELECT * FROM signals WHERE status IN ('pending','unknown') ORDER BY start")]
    def record_outcome(self,s,result,now,chat_ids):
        with self.lock:
            old=self.db.execute('SELECT status FROM signals WHERE id=?',(s['id'],)).fetchone()[0]
            status=result['status']
            if status==old:return False
            self.db.execute('UPDATE signals SET status=?,actual=?,result_at=? WHERE id=?',(status,result.get('actual'),result.get('resultAt'),s['id']))
            self.db.execute('INSERT INTO events(signal_id,at,kind,payload) VALUES(?,?,?,?)',(s['id'],now,status,json.dumps(result,ensure_ascii=False)))
            for chat in chat_ids:
                phase='result' if old=='pending' else 'revision'
                if old=='unknown':
                    unsent=self.db.execute("SELECT 1 FROM deliveries WHERE signal_id=? AND chat=? AND phase='result' AND state='ready'",(s['id'],chat)).fetchone()
                    if unsent:phase='result'
                delivered=self.db.execute("SELECT state FROM deliveries WHERE signal_id=? AND chat=? AND phase='forecast' AND step='text'",(s['id'],chat)).fetchone()
                if delivered and delivered[0]=='sent':self.db.execute("INSERT OR IGNORE INTO deliveries(signal_id,chat,phase,step) VALUES(?,?,?,'text')",(s['id'],chat,phase))
            self.db.commit();return True
    def queued(self,now):
        with self.lock:
            rows=self.db.execute("SELECT d.*,s.metadata,s.status,s.actual,s.result_at FROM deliveries d JOIN signals s ON s.id=d.signal_id WHERE d.state='ready' AND d.available<=? ORDER BY CASE d.phase WHEN 'forecast' THEN 0 ELSE 1 END,s.start,d.chat,CASE d.step WHEN 'photo' THEN 0 ELSE 1 END LIMIT 60",(now,)).fetchall()
            return [dict(r) for r in rows]
    def delivery(self,item,state,**fields):
        allowed={'available','message_id','error'}
        fields={k:v for k,v in fields.items() if k in allowed}
        query='UPDATE deliveries SET state=?,attempts=attempts+?'+''.join(','+k+'=?' for k in fields)+' WHERE signal_id=? AND chat=? AND phase=? AND step=?'
        with self.lock:self.db.execute(query,(state,int(state=='sending'),*fields.values(),item['signal_id'],item['chat'],item['phase'],item['step']));self.db.commit()
    def step_sent(self,item,step):
        with self.lock:
            row=self.db.execute('SELECT state FROM deliveries WHERE signal_id=? AND chat=? AND phase=? AND step=?',(item['signal_id'],item['chat'],item['phase'],step)).fetchone()
            return row and row[0]=='sent'
    def close(self):
        with self.lock:self.db.close()

class SupabaseSource:
    def __init__(self,config,journal,session=None):
        self.config,self.journal=config,journal
        self.url=secure_url(config['SUPABASE_URL']);self.table=config.get('SUPABASE_HISTORY_TABLE') or 'god_bayes_rounds_v1'
        if not re.fullmatch(r'[a-z][a-z0-9_]*',self.table):raise ValueError('Неверная таблица истории')
        self.headers={'apikey':config['SUPABASE_KEY'],'Accept':'application/json'}
        self.session=session or requests.Session();self.offset=0;self.last_poll=0;self.latency=None;self.error=None
        self.stop=threading.Event();self.worker=None
    def now(self):return ms()+self.offset
    def page(self,params,session=None):
        before=ms()
        try:
            r=(session or self.session).get(self.url+'/rest/v1/'+self.table,params=params,headers=self.headers,timeout=(5,25),allow_redirects=False)
            if r.status_code!=200:raise SourceError('История Supabase: HTTP '+str(r.status_code))
            body=r.json()
            if not isinstance(body,list):raise SourceError('Неверный формат истории')
            date=r.headers.get('Date')
            if date:
                server=parsedate_to_datetime(date).timestamp()*1000
                if abs(server-ms())<86400000:self.offset=int(server-(before+ms())/2)
            return body
        except (requests.RequestException,ValueError):raise SourceError('Не удалось получить историю Supabase') from None
    def params(self):return {'select':'id,coefficient,round_timestamp,estimated,completed,feed_order','estimated':'eq.false','completed':'eq.true','order':'feed_order.desc','limit':1000}
    def poll(self):
        before=time.monotonic();params=self.params()
        page=self.page(params)
        with self.journal.lock:
            old_max=self.journal.db.execute('SELECT max(feed) FROM rounds').fetchone()[0]
            if old_max is not None and page and min(int(r['feed_order']) for r in page)>old_max:
                ranges=self.journal.get('gap_ranges',[])
                ranges.append({'before':min(int(r['feed_order']) for r in page),'after':old_max})
                self.journal.set('gap_ranges',ranges)
        self.journal.store_rounds(page,self.now());self.last_poll=self.now();self.latency=round((time.monotonic()-before)*1000);self.error=None
        if not self.worker or not self.worker.is_alive():
            if not self.journal.get('archive_done',False) or self.journal.get('gap_ranges',[]):
                self.worker=threading.Thread(target=self.archive,args=(page,),daemon=True);self.worker.start()
        return self.journal.history(self.now()-int(self.config.get('HISTORY_DAYS',90))*86400000)
    def archive(self,head):
        session=requests.Session()
        try:
            # Backfill disconnect gaps even after the old archive has completed.
            ranges=self.journal.get('gap_ranges',[])
            while ranges and not self.stop.is_set():
                gap=dict(ranges[0]);previous_before=gap['before'];params=self.params();params['and']='(feed_order.lt.'+str(gap['before'])+',feed_order.gt.'+str(gap['after'])+')'
                page=self.page(params,session)
                if page:
                    self.journal.store_rounds(page,self.now());cursor=min(int(r['feed_order']) for r in page)
                    if cursor>=gap['before']:raise SourceError('Курсор пропуска не продвигается')
                    gap['before']=cursor
                with self.journal.lock:
                    ranges=self.journal.get('gap_ranges',[])
                    if ranges and ranges[0]['before']==previous_before and ranges[0]['after']==gap['after']:
                        if not page or len(page)<1000:ranges.pop(0)
                        else:ranges[0]=gap
                        self.journal.set('gap_ranges',ranges)
            if self.journal.get('archive_done',False):return
            cursor=self.journal.get('archive_cursor')
            if cursor is None and head:cursor=min(int(r['feed_order']) for r in head)
            cutoff=self.now()-int(self.config.get('HISTORY_DAYS',90))*86400000
            while cursor is not None and not self.stop.is_set():
                params=self.params();params['feed_order']='lt.'+str(cursor)
                page=self.page(params,session)
                if not page:self.journal.set('archive_done',True);break
                self.journal.store_rounds(page,self.now())
                new_cursor=min(int(r['feed_order']) for r in page)
                if new_cursor>=cursor:raise SourceError('Курсор архива не продвигается')
                cursor=new_cursor;self.journal.set('archive_cursor',cursor)
                known=[stamp(r.get('round_timestamp')) for r in page];known=[x for x in known if x is not None]
                if len(page)<1000 or (known and max(known)<cutoff):self.journal.set('archive_done',True);break
                self.stop.wait(.15)
        except Exception as e:self.error='Архив: '+type(e).__name__
        finally:session.close()
    def close(self):
        self.stop.set()
        if self.worker:self.worker.join(timeout=35)
        self.session.close()

class Telegram:
    def __init__(self,token,session=None):
        if not re.fullmatch(r'\d{6,12}:[A-Za-z0-9_-]{25,}',str(token)):raise ValueError('Неверный токен Telegram')
        self.url='https://api.telegram.org/bot'+token+'/';self.session=session or requests.Session()
    def call(self,method,payload=None,photo=None):
        data=dict(payload or {})
        for k,v in data.items():
            if isinstance(v,(dict,list)):data[k]=json.dumps(v,ensure_ascii=False)
        try:
            r=self.session.post(self.url+method,data=data,files={'photo':('luckyjet-logo.png',photo,'image/png')} if photo else None,timeout=(5,25),allow_redirects=False)
            try:body=r.json()
            except ValueError:raise DeliveryError(r.status_code,ambiguous=True) from None
        except requests.RequestException:raise DeliveryError('network',ambiguous=True) from None
        if not body.get('ok'):
            code=body.get('error_code',r.status_code)
            raise DeliveryError(code,int(body.get('parameters',{}).get('retry_after',0)),ambiguous=code>=500)
        return body['result']

def photo_bytes(config):
    cache=Path(config.get('PHOTO_CACHE_PATH') or 'god-drive-photo.png')
    if cache.is_file():
        value=cache.read_bytes()
        if hashlib.sha256(value).hexdigest()==PHOTO_SHA256:return value
    try:
        r=requests.get('https://drive.google.com/uc',params={'export':'download','id':PHOTO_ID},timeout=(5,25))
        if r.status_code==200 and hashlib.sha256(r.content).hexdigest()==PHOTO_SHA256:
            cache.parent.mkdir(parents=True,exist_ok=True);cache.write_bytes(r.content);return r.content
    except requests.RequestException:pass
    embedded=globals().get('EMBEDDED_DRIVE_PHOTO')
    if embedded:
        value=base64.b64decode(embedded)
        if hashlib.sha256(value).hexdigest()==PHOTO_SHA256:return value
    local=Path(__file__).with_name('uploaded-drive-photo.png')
    if local.is_file() and hashlib.sha256(local.read_bytes()).hexdigest()==PHOTO_SHA256:return local.read_bytes()
    raise ValueError('Не загружена исходная фотография Google Drive')

def kyiv(at):return datetime.fromtimestamp(at/1000,ZoneInfo('Europe/Kyiv')).strftime('%d.%m %H:%M:%S')
def formatted(value):return f'{float(value):.2f}'.rstrip('0').rstrip('.')
def render_forecast(s):
    target=escape(formatted(s['target']));score=numeric(s.get('confidence'));kind=s.get('scoreKind','heuristic')
    if kind in ('model_probability','model_estimate','probability','independence_model_probability'):
        confidence=f'📊 МОДЕЛЬНАЯ ОЦЕНКА: <b>{score:.1f}%</b>' if score is not None else '📊 МОДЕЛЬНАЯ ОЦЕНКА: —'
    else:confidence=f'📊 БАЛЛ АНАЛИЗА: <b>{score:.0f}/100</b>' if score is not None else '📊 БАЛЛ АНАЛИЗА: —'
    safety=s.get('insurance')
    extra='\n🛡 СТРАХОВОЧНАЯ ЦЕЛЬ: <b>'+escape(formatted(safety))+'×</b>' if numeric(safety) else ''
    return ('💀👾⚡🔥 <b>GOD PREDITOR</b>\n🟢 <b>HACKER ULTRA VIP</b>\n━━━━━━━━━━━━━━━━━━━━\n'
      +'🎯 <b>ПРОГНОЗ GOD PREDITOR</b>\n🎮 ИГРА: <b>LUCKY JET</b>\n'
      +f'🎯 ЦЕЛЬ: <b>{target}×</b>{extra}\n{confidence}\n'
      +f'⏰ НАЧАЛО: <b>{kyiv(s["start"])}</b>\n⌛ ЗАКРЫТИЕ: <b>{kyiv(s["end"])}</b>\n🌐 ВРЕМЯ: КИЕВ\n'
      +'🟡 <b>ОЖИДАНИЕ ПРОВЕРКИ</b>\n\n'
      +'Оценка по истории; точность будущего окна не подтверждена.\n'
      +f'🆔 <code>{escape(s["id"])}</code>\n👨‍💻 @V0xFF3')

def render_result(s,status,actual,result_at,revision=False):
    title={'hit':'🟢 <b>ЦЕЛЬ ДОСТИГНУТА</b>','miss':'🔴 <b>ЦЕЛЬ НЕ ДОСТИГНУТА</b>','unknown':'⚪ <b>РЕЗУЛЬТАТ НЕ ОПРЕДЕЛЁН</b>'}[status]
    value=formatted(actual)+'×' if numeric(actual) is not None else 'нет подтверждённых данных'
    return ('🎯 <b>ПРОГНОЗ GOD PREDITOR</b>\n'+('🔄 <b>УТОЧНЕНИЕ ПО ПОЛНОЙ ИСТОРИИ</b>\n' if revision else '')
       +title+f'\n🎯 ЦЕЛЬ: <b>{formatted(s["target"])}×</b>\n'
       +f'⏰ ОКНО: <b>{kyiv(s["start"])} → {kyiv(s["end"])}</b>\n'
       +f'📈 МАКСИМУМ В ОКНЕ: <b>{value}</b>\n'
       +('Проверка неполная: в истории есть пропуски.\n' if status=='unknown' else '')
       +f'🆔 <code>{escape(s["id"])}</code>\n👨‍💻 @V0xFF3')

class Bot:
    def __init__(self,config,source=None,telegram=None,photo=None,clock=None):
        self.config=config;self.chats=chats(config)
        db=Path(config.get('DATABASE_PATH') or 'god_complete.sqlite3');db.parent.mkdir(parents=True,exist_ok=True)
        self.journal=Journal(str(db));self.source=source or SupabaseSource(config,self.journal)
        self.telegram=telegram or Telegram(config['TELEGRAM_BOT_TOKEN']);self.photo=photo if photo is not None else photo_bytes(config)
        self.clock=clock or self.source.now;self.last_basis=None
        self.paused_until=self.journal.get('telegram_paused_until',0)
    def calculate(self,rows,now):
        latest=max((stamp(r.get('timestamp',r.get('round_timestamp'))) or 0 for r in rows),default=0)
        if not latest or now-latest>180000:return
        basis=str(max(rows,key=lambda r:stamp(r.get('timestamp',r.get('round_timestamp'))) or 0).get('id',''))
        if basis==self.last_basis:return
        self.last_basis=basis
        report=analyze_report(rows,now)
        self.journal.set('last_analysis',{'at':now,'basis':basis,'report':report})
        for proposal in analyze_all(rows,now,report):
            at=numeric(proposal.get('estimatedAt'));width=numeric(proposal.get('windowMs'));target=numeric(proposal.get('target'));channel=str(proposal.get('channel',''))
            if not at or not width or not target or target<1 or not channel:continue
            live_window=proposal.get('liveWindow') is True
            if live_window:
                if at-now>5000 or at+width-now<60000:continue
            elif at-now<40000:continue
            if self.journal.active(channel,now):continue
            # If an overdue event keeps returning the same source basis, do not repeat it in later slots.
            event_basis=proposal.get('basisId',proposal.get('basisEvent',basis))
            if self.journal.last_basis(channel)==event_basis:continue
            s={**proposal,'start':int(at),'end':int(at+width),'issuedAt':now,'basisId':event_basis,'sampleSize':len(rows),'dataCutoff':latest}
            s['id']=hashlib.sha256((channel+'|'+str(s['start'])+'|'+str(event_basis)+'|'+str(s.get('modelVersion',VERSION))).encode()).hexdigest()[:24]
            self.journal.add_signal(s,self.chats)
    def verify(self,rows,now):
        for row in self.journal.unresolved():
            if now<=row['end']:continue
            s=json.loads(row['metadata'])
            outcome=validate_window(rows,s['target'],s['start'],s['end'],now_ms=now,avg_round_seconds=s.get('avgRoundSeconds'))
            if outcome.get('status') in ('hit','miss','unknown'):self.journal.record_outcome(s,outcome,now,self.chats)
    def flush(self,now):
        if now<self.paused_until:return
        sent_count=0
        for item in self.journal.queued(now):
            s=json.loads(item['metadata']);forecast=item['phase']=='forecast'
            deadline=s['end']-30000 if s.get('liveWindow') is True else s['start']-5000
            if forecast and now>=deadline:
                self.journal.delivery(item,'expired',error='forecast_deadline_passed');continue
            if forecast and item['step']=='text' and not self.journal.step_sent(item,'photo'):continue
            self.journal.delivery(item,'sending')
            try:
                if item['step']=='photo':result=self.telegram.call('sendPhoto',{'chat_id':item['chat'],'caption':'💀 GOD PREDITOR | HACKER ULTRA VIP'},photo=self.photo)
                else:
                    text=render_forecast(s) if forecast else render_result(s,item['status'],item['actual'],item['result_at'],item['phase']=='revision')
                    result=self.telegram.call('sendMessage',{'chat_id':item['chat'],'text':text,'parse_mode':'HTML','reply_markup':CONTACTS,'disable_web_page_preview':True})
                self.journal.delivery(item,'sent',message_id=result['message_id'])
            except DeliveryError as error:
                if error.code==429:
                    self.paused_until=now+max(1,error.retry_after)*1000
                    self.journal.set('telegram_paused_until',self.paused_until)
                    self.journal.delivery(item,'ready',available=self.paused_until,error='rate_limit');break
                self.journal.delivery(item,'ambiguous' if error.ambiguous else 'failed',error=str(error.code))
            sent_count+=1
            if sent_count>=8:break
            now=self.clock()
    def tick(self):
        now=self.clock()
        try:
            rows=self.source.poll();now=self.clock();self.verify(rows,now);self.calculate(rows,now)
        except Exception as error:safe_log('Источник/анализ: '+type(error).__name__,self.config)
        self.flush(self.clock())
    def check(self):
        rows=self.source.poll();now=self.clock();me=self.telegram.call('getMe');group_reports=[]
        for i,chat in enumerate(self.chats,1):
            member=self.telegram.call('getChatMember',{'chat_id':chat,'user_id':me['id']});role=member.get('status')
            allowed=role in ('creator','administrator','member') or (role=='restricted' and member.get('can_send_messages'))
            group_reports.append({'группа':i,'роль':role,'доступ':bool(allowed)})
        latest=max((stamp(r.get('timestamp',r.get('round_timestamp'))) or 0 for r in rows),default=0)
        return {'supabase':bool(rows),'раундов_в_кеше':len(rows),'задержка_сек':round((now-latest)/1000,1) if latest else None,'архив_загружается':not self.journal.get('archive_done',False),'фото_байт':len(self.photo),'telegram_токен':True,'группы':group_reports,'сообщения_отправлены':False}
    def close(self):self.source.close();self.journal.close()

def main():
    parser=argparse.ArgumentParser(description='GOD PREDITOR • авто-прогнозы без кнопок')
    parser.add_argument('--check',action='store_true',help='Проверить подключения, не отправляя сообщений')
    parser.add_argument('--once',action='store_true',help='Один рабочий цикл с реальной отправкой')
    args=parser.parse_args()
    config=dict(globals().get('CONFIG',{}))
    if not config:
        path=Path(os.getenv('GOD_CONFIG','private-config.json'));config=json.loads(path.read_text())
    for key in list(config):
        if key in os.environ:config[key]=os.environ[key]
    config['DATABASE_PATH']=os.getenv('DATABASE_PATH') or str(Path(__file__).with_name('god_complete.sqlite3'))
    config['PHOTO_CACHE_PATH']=os.getenv('PHOTO_CACHE_PATH') or str(Path(__file__).with_name('god-drive-photo.png'))
    # An OS-level exclusive lock prevents two instances from publishing the same configured bot.
    lock=open(config['DATABASE_PATH']+'.lock','a+')
    try:
        import fcntl
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise RuntimeError('Этот экземпляр бота уже запущен') from None
        bot=Bot(config)
        try:
            if args.check:
                print(json.dumps(bot.check(),ensure_ascii=False,indent=2));return 0
            safe_log('GOD PREDITOR запущен. Автоматический анализ; группы: '+str(len(bot.chats)),config)
            while True:
                started=time.monotonic();bot.tick()
                if args.once:break
                time.sleep(max(.5,float(config.get('POLL_SECONDS',15))-(time.monotonic()-started)))
        finally:bot.close()
    except KeyboardInterrupt:return 0
    except Exception as error:safe_log('Запуск: '+type(error).__name__+': '+str(error),config);return 2
    finally:lock.close()
    return 0

if __name__=='__main__':raise SystemExit(main())
