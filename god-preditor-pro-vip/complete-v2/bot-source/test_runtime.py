import unittest, tempfile, pathlib, json, types, sys
try:import engine
except ImportError:
 e=types.ModuleType('engine');e.analyze_all=lambda *a:[];e.analyze_report=lambda *a:{};e.validate_window=lambda *a,**k:{};sys.modules['engine']=e
import runtime

class Source:
 def __init__(self,rows,now):self.rows=rows;self.time=now
 def now(self):return self.time
 def poll(self):return self.rows
 def close(self):pass
class Telegram:
 def __init__(self,fail=None):self.calls=[];self.fail=fail
 def call(self,method,payload=None,photo=None):
  self.calls.append((method,payload,photo))
  if self.fail:raise self.fail
  return {'message_id':len(self.calls)}

class RuntimeTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.now=1700000000000
  self.config={'DATABASE_PATH':str(pathlib.Path(self.tmp.name)/'journal.sqlite3'),'TELEGRAM_CHAT_IDS':'-1001111111,-1002222222','TELEGRAM_BOT_TOKEN':'test'}
  self.rows=[{'id':'a','coefficient':1.2,'timestamp':self.now-5000,'feed_order':10,'completed':True,'estimated':False}]
  self.source=Source(self.rows,self.now);self.tg=Telegram();self.bot=runtime.Bot(self.config,self.source,self.tg,photo=b'photo')
  self.orig_analyze=runtime.analyze_all;self.orig_report=runtime.analyze_report;runtime.analyze_report=lambda *a:{}
 def tearDown(self):
  self.bot.close();self.tmp.cleanup();runtime.analyze_all=self.orig_analyze;runtime.analyze_report=self.orig_report
 def proposal(self,**kw):return {'channel':'vip:200','target':200,'estimatedAt':self.now+90000,'windowMs':180000,'confidence':12,'scoreKind':'model_probability','modelVersion':'v1',**kw}
 def plan(self,p=None):runtime.analyze_all=lambda *a:[p or self.proposal()];self.bot.calculate(self.rows,self.now)
 def test_auto_two_groups_without_buttons(self):
  self.plan();self.bot.flush(self.now)
  self.assertEqual([x[0] for x in self.tg.calls],['sendPhoto','sendMessage','sendPhoto','sendMessage'])
  for method,data,_ in self.tg.calls:
   if method=='sendMessage':self.assertTrue(all('url' in b for row in data['reply_markup']['inline_keyboard'] for b in row))
 def test_restart_never_duplicates_sent_forecast(self):
  self.plan();self.bot.flush(self.now);self.bot.flush(self.now)
  self.assertEqual(len(self.tg.calls),4)
 def test_ambiguous_post_not_blindly_retried(self):
  self.plan();self.tg.fail=runtime.DeliveryError('network',ambiguous=True);self.bot.flush(self.now);self.bot.flush(self.now)
  self.assertEqual(len(self.tg.calls),2)
 def test_429_global_pause_persists(self):
  self.plan();self.tg.fail=runtime.DeliveryError(429,60);self.bot.flush(self.now);self.bot.flush(self.now+1000)
  self.assertEqual(len(self.tg.calls),1);self.assertEqual(self.bot.journal.get('telegram_paused_until'),self.now+60000)
 def test_late_future_forecast_not_sent(self):
  self.plan();self.bot.flush(self.now+100000);self.assertFalse(self.tg.calls)
 def test_source_live_window_preserves_original_start(self):
  self.plan(self.proposal(estimatedAt=self.now-10000,liveWindow=True));self.bot.flush(self.now)
  self.assertEqual(len(self.tg.calls),4)
  s=json.loads(self.bot.journal.db.execute('select metadata from signals').fetchone()[0]);self.assertEqual(s['start'],self.now-10000)
 def test_no_retiming_expired_current_window(self):
  self.plan(self.proposal(estimatedAt=self.now-170000,liveWindow=True));self.bot.flush(self.now);self.assertFalse(self.tg.calls)
 def test_verify_waits_end_and_keeps_unknown(self):
  self.plan();self.bot.flush(self.now);original=runtime.validate_window
  try:
   calls=[];runtime.validate_window=lambda *a,**kw:(calls.append(1) or {'status':'unknown','actual':None})
   self.bot.verify(self.rows,self.now+100000);self.assertFalse(calls)
   self.bot.verify(self.rows,self.now+300000);self.assertEqual(len(calls),1)
   self.assertEqual(self.bot.journal.unresolved()[0]['status'],'unknown')
  finally:runtime.validate_window=original
 def test_unknown_revision_before_send_is_single_result(self):
  self.plan();self.bot.flush(self.now);s=json.loads(self.bot.journal.db.execute('select metadata from signals').fetchone()[0])
  self.bot.journal.record_outcome(s,{'status':'unknown'},self.now+300000,self.bot.chats)
  self.bot.journal.record_outcome(s,{'status':'hit','actual':210},self.now+310000,self.bot.chats)
  self.bot.flush(self.now+310000)
  self.assertEqual(len(self.tg.calls),6)
 def test_different_channel_windows_and_targets(self):
  runtime.analyze_all=lambda *a:[self.proposal(),self.proposal(channel='vip:500',target=500,estimatedAt=self.now+120000)]
  self.bot.calculate(self.rows,self.now)
  self.assertEqual(self.bot.journal.db.execute('select count(*) from signals').fetchone()[0],2)
 def test_no_shared_time_override(self):
  runtime.analyze_all=lambda *a:[self.proposal(),self.proposal(channel='vip:500',target=500,estimatedAt=self.now+120000)]
  self.bot.calculate(self.rows,self.now)
  self.assertEqual([r[0] for r in self.bot.journal.db.execute('select distinct start from signals order by start')],[self.now+90000,self.now+120000])
 def test_stale_history_suppresses_creation(self):
  runtime.analyze_all=lambda *a:[self.proposal()];self.bot.calculate([{**self.rows[0],'timestamp':self.now-200000}],self.now)
  self.assertEqual(self.bot.journal.db.execute('select count(*) from signals').fetchone()[0],0)
 def test_numeric_html_escaped_and_score_not_accuracy(self):
  s={**self.proposal(),'id':'<test>','start':self.now,'end':self.now+180000,'scoreKind':'heuristic'}
  text=runtime.render_forecast(s);self.assertIn('12/100',text);self.assertIn('&lt;test&gt;',text);self.assertNotIn('12%',text)
 def test_rounds_reject_estimated_future_unfinished_keep_distinctids(self):
  rows=[{**self.rows[0],'id':str(i)} for i in range(2)]+[{**self.rows[0],'id':'future','timestamp':self.now+1},{**self.rows[0],'id':'est','estimated':True},{**self.rows[0],'id':'unfinished','completed':False}]
  self.bot.journal.store_rounds(rows,self.now);self.assertEqual(len(self.bot.journal.history()),2)
 def test_sending_crash_becomes_ambiguous(self):
  self.plan();item=self.bot.journal.queued(self.now)[0];self.bot.journal.delivery(item,'sending')
  other=runtime.Journal(self.config['DATABASE_PATH'])
  try:self.assertEqual(other.db.execute("select state from deliveries where signal_id=? and chat=? and step=?",(item['signal_id'],item['chat'],item['step'])).fetchone()[0],'ambiguous')
  finally:other.close()

if __name__=='__main__':unittest.main()

class RealEngineIntegrationTests(unittest.TestCase):
 def test_original_ingestion_live_window_is_published_unchanged(self):
  import engine
  now=1700000000000
  rows=[]
  for i in range(1000):
   at=now-(999-i)*20000
   rows.append({'id':str(i),'coefficient':10 if i%5==0 else 1.1,'timestamp':at,'round_timestamp':runtime.datetime.fromtimestamp(at/1000,runtime.timezone.utc).isoformat(),'estimated':False,'completed':True,'feed_order':i})
  proposals=engine.analyze_all(rows,now)
  live=next(p for p in proposals if p['channel']=='premium_live')
  self.assertTrue(live['liveWindow']);self.assertEqual(live['estimatedAt'],now+3600)
  with tempfile.TemporaryDirectory() as folder:
   config={'DATABASE_PATH':str(pathlib.Path(folder)/'db'),'TELEGRAM_CHAT_IDS':'-1001111111'}
   tg=Telegram();bot=runtime.Bot(config,Source(rows,now),tg,photo=b'photo')
   try:
    bot.calculate(rows,now);bot.flush(now)
    record=bot.journal.db.execute("select metadata from signals where channel='premium_live'").fetchone()
    self.assertIsNotNone(record);s=json.loads(record[0]);self.assertEqual(s['start'],now+3600)
    text=runtime.render_forecast(s);self.assertIn('МОДЕЛЬНАЯ ОЦЕНКА',text);self.assertIn('%',text)
   finally:bot.close()

class SourceRecoveryTests(unittest.TestCase):
 def test_archive_completed_still_recovers_large_disconnect_gap(self):
  now=runtime.ms()
  def row(i):return {'id':str(i),'coefficient':1.5,'round_timestamp':runtime.datetime.fromtimestamp((now-i*10)/1000,runtime.timezone.utc).isoformat(),'feed_order':i,'estimated':False,'completed':True}
  class FakeSource(runtime.SupabaseSource):
   def page(self,params,session=None):
    if 'and' in params:return [row(i) for i in range(1000,1,-1)]
    return [row(i) for i in range(2000,1000,-1)]
  with tempfile.TemporaryDirectory() as folder:
   journal=runtime.Journal(str(pathlib.Path(folder)/'db'));journal.store_rounds([row(1)],now);journal.set('archive_done',True)
   source=FakeSource({'SUPABASE_URL':'https://example.supabase.co','SUPABASE_KEY':'fake'},journal)
   try:
    source.poll();source.worker.join(timeout=2)
    self.assertEqual(journal.db.execute('select count(*) from rounds').fetchone()[0],2000)
    self.assertEqual(journal.get('gap_ranges'),[])
    self.assertEqual(source.params()['completed'],'eq.true')
   finally:source.close();journal.close()
