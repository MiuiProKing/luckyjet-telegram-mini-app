import json,sqlite3,time,unittest,uuid
from pathlib import Path
from unittest.mock import patch
import beeai_server as b

GOOD={'ok':True,'history':[{'id':'anchor'}],'collector':{'source_connected':True,'fresh':True,'error':'','gap':False,'session_rounds':200,'warmup_required':200}}
class ForecastTests(unittest.TestCase):
 def setUp(self):
  self.root=Path(__file__).resolve().parent/'.test';self.root.mkdir(exist_ok=True);self.tag=uuid.uuid4().hex;self.source=self.root/(self.tag+'-source.sqlite3')
  self.source_db=sqlite3.connect(self.source)
  self.source_db.execute('CREATE TABLE rounds(seq INTEGER PRIMARY KEY,id TEXT,coefficient REAL,live_received_at REAL,origin TEXT)')
  self.source_db.execute("INSERT INTO rounds VALUES(1,'anchor',1.2,99,'live')");self.source_db.commit()
  self.ai=b.BeeAI(self.root/(self.tag+'-ai.sqlite3'),self.source,clock=lambda:100)
 def tearDown(self):
  self.ai.db.close();self.source_db.close()
  for file in self.root.glob(self.tag+'*'):file.unlink()
 def forecast(self):
  with self.ai.db:self.ai.db.execute("INSERT INTO predictions(anchor_id,anchor_seq,created_at,model,target,horizon,status,explanation,context_sha256) VALUES('anchor',1,100,'test',10,3,'pending','test','hash')")
 def add(self,seq,value,at):
  with self.source_db:self.source_db.execute('INSERT INTO rounds VALUES(?,?,?,?,?)',(seq,'round'+str(seq),value,at,'live'))
 def status(self):return dict(self.ai.db.execute('SELECT * FROM predictions').fetchone())
 def test_future_hit_once(self):
  self.forecast();self.add(2,1.2,105);self.add(3,12,110);self.ai.settle(GOOD);self.ai.settle(GOOD)
  self.assertEqual(self.status()['status'],'hit');self.assertEqual(self.status()['result_id'],'round3');self.assertEqual(self.ai.report()['stats'][0]['hits'],1)
 def test_past_completion_not_hit(self):
  self.forecast();self.add(2,100,99);self.ai.settle(GOOD);self.assertEqual(self.status()['status'],'unknown')
 def test_miss_kept(self):
  self.forecast()
  for seq in (2,3,4):self.add(seq,1.5,100+seq)
  self.ai.settle(GOOD);self.assertEqual(self.status()['status'],'miss');self.add(5,100,110);self.ai.settle(GOOD);self.assertEqual(self.status()['status'],'miss')
 def test_disconnect_unknown(self):
  self.forecast();self.ai.settle({'ok':False});self.assertEqual(self.status()['status'],'unknown')
 def test_gap_unknown(self):
  self.forecast();self.add(2,100,400);self.ai.settle(GOOD);self.assertEqual(self.status()['status'],'unknown')
 def test_pending_window(self):
  self.forecast();self.add(2,1.2,105);self.ai.settle(GOOD);self.assertEqual(self.status()['status'],'pending');self.assertEqual(self.status()['observed'],1)
 def test_duplicate_anchor(self):
  self.forecast()
  with self.assertRaises(sqlite3.IntegrityError):self.forecast()
 def test_warmup_gate(self):
  data=json.loads(json.dumps(GOOD));data['collector']['session_rounds']=199;self.assertFalse(b.ready(data));self.assertTrue(b.ready(GOOD))
 def test_invalid_model_response(self):
  for target,horizon in ((float('nan'),1),(1000,1),(10,4),(10,True)):
   with self.assertRaises(ValueError):b.validate({'decision':'estimate','target':target,'horizon':horizon,'explanation':'text'},[10])
 def test_abstention(self):self.assertIsNone(b.validate({'decision':'observe','target':10,'horizon':3,'explanation':'Нет подтверждения'},[10])['target'])
 def test_public_response_no_key(self):self.assertNotIn('api_key',json.dumps(self.ai.report()))
 def test_no_arbitrary_settings(self):
  with self.assertRaises(ValueError):self.ai.update({'api_key':'secret'})
if __name__=='__main__':unittest.main()
