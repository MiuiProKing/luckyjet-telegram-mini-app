import json
import math
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import urlopen
from http.server import ThreadingHTTPServer

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'local-server'))
from inference import features,predict
from server import Collector,make_handler,retry_delay

class LocalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.artifact=json.loads((ROOT/'bog-hishchnik-alert/ml-models.json').read_text(encoding='utf-8'))
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=ROOT);self.now=1900000000
        self.collector=Collector(str(Path(self.temp.name)/'test.sqlite3'),self.artifact,lambda:self.now)
        self.rows=[{'id':f'r{i}','coefficient':1.1,'timestamp':self.now*1000-i*10000,'estimated':True} for i in range(250)]
    def tearDown(self):
        self.collector.db.close();self.temp.cleanup()
    def tick(self,values):
        self.now+=1
        batch=[{'id':f'n{self.now}-{i}','coefficient':v,'timestamp':self.now*1000,'estimated':True} for i,v in enumerate(values)]
        self.rows=batch+self.rows;return self.collector.ingest(self.rows[:1000])
    def test_python_inference_parity_1008(self):
        rows=json.loads((ROOT/'tests/fixtures/ml-parity.json').read_text())
        for row in rows:
            x=features(row['history'])
            self.assertTrue(all(abs(a-b)<1e-6 for a,b in zip(x,row['features'])))
            self.assertAlmostEqual(predict(self.artifact['tasks'][row['task']]['models'][row['model']],x),row['probability'],places=6)
    def test_unique_rounds_closed_only_and_immutable_coefficients(self):
        self.assertEqual(self.collector.ingest(self.rows),250)
        self.assertEqual(self.collector.ingest(self.rows),0)
        bad=[{'id':'bad','coefficient':math.nan},{'id':'active','coefficient':5,'completed':False}]
        self.collector.ingest(bad+self.rows)
        self.assertEqual(self.collector.history(1000,0)['total'],250)
        self.collector.ingest([{**self.rows[0],'coefficient':20}]+self.rows[1:])
        self.assertEqual(self.collector.conflicts,1)
        self.assertEqual(self.collector.history(1,0)['history'][0]['coefficient'],1.1)
    def test_forecast_saved_before_next_unique_results_and_stats(self):
        self.collector.ingest(self.rows);self.collector.ingest(self.rows)
        pending=self.collector.db.execute("SELECT * FROM predictions WHERE target=2 AND horizon=3").fetchone()
        self.assertEqual(pending['status'],'pending');self.assertEqual(json.loads(pending['values_json']),[])
        with self.assertRaises(sqlite3.IntegrityError):self.collector.db.execute('UPDATE predictions SET probability=.99 WHERE id=?',(pending['id'],))
        self.tick([1.1,1.2,3.5])
        result=self.collector.db.execute('SELECT * FROM predictions WHERE id=?',(pending['id'],)).fetchone()
        self.assertEqual(result['outcome'],1);self.assertEqual(result['status'],'observed')
        report=self.collector.report();self.assertEqual(report['confirmed_signals'],0)
        primary=next(g for g in report['MAIN'] if g['horizon']==3);self.assertEqual(primary['hits'],1)
        self.collector.ingest(self.rows);self.assertEqual(next(g for g in self.collector.report()['MAIN'] if g['horizon']==3)['observations'],1)
    def test_gap_restart_and_stale_do_not_create_confirmed_results(self):
        self.collector.ingest(self.rows);self.collector.ingest(self.rows)
        self.now+=20;self.tick([4])
        self.assertGreater(self.collector.db.execute("SELECT count(*) FROM predictions WHERE status='unknown'").fetchone()[0],0)
        self.now+=200;self.collector.ingest(self.rows);self.collector.ingest(self.rows)
        self.assertFalse(self.collector.report()['fresh'])
        self.assertEqual(self.collector.db.execute("SELECT count(*) FROM predictions WHERE status='pending'").fetchone()[0],0)
    def test_pause_after_two_primary_losses_persists(self):
        self.collector.ingest(self.rows);self.collector.ingest(self.rows)
        self.tick([1.1]*3);self.tick([1.1]*3)
        self.assertTrue(self.collector.report()['paused_2x'])
        self.assertEqual(self.collector.db.execute("SELECT count(*) FROM predictions WHERE target=2 AND status='pending'").fetchone()[0],0)
        primary=next(g for g in self.collector.report()['MAIN'] if g['horizon']==3);self.assertEqual(primary['misses'],2)
    def test_http_page_runtime_sqlite_api_and_reports(self):
        self.collector.ingest(self.rows)
        server=ThreadingHTTPServer(('127.0.0.1',0),make_handler(self.collector))
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        base=f'http://127.0.0.1:{server.server_port}'
        try:
            with urlopen(base+'/api/live?limit=10') as response:data=json.load(response)
            self.assertEqual(len(data['history']),10);self.assertTrue(data['collector']['sqlite'])
            with urlopen(base+'/runtime-config.js') as response:self.assertIn(b"api:'/api/live'",response.read())
            with urlopen(base+'/') as response:self.assertIn(b'id="mlLab"',response.read())
            self.collector.failure('HTTP 429')
            with self.assertRaises(HTTPError):urlopen(base+'/api/live')
        finally:server.shutdown();server.server_close();thread.join()
    def test_backoff(self):
        self.assertEqual(retry_delay(HTTPError('url',403,'',{},None),1),120)
        self.assertEqual(retry_delay(HTTPError('url',429,'',{'Retry-After':'45'},None),1),45)
        self.assertEqual(retry_delay(ValueError(),100),60)

if __name__=='__main__':unittest.main()
