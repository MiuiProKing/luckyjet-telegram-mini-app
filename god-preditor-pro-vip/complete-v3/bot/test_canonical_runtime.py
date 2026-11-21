import json
import pathlib
import tempfile
import unittest

import canonical_runtime as cr

NOW = 1795230000000


def signal(**kw):
    return dict(id='canonical-1', channel='premium_live', target=20, start=NOW,
                end=NOW+180000, issuedAt=NOW, confidence=37, scoreKind='independence_model_probability',
                status='pending', windowKind='time', modelVersion='v3', **kw)


class Source:
    def __init__(self):
        self.time = NOW
        self.body = dict(serverNow=NOW, sourceFresh=True, sourceCutoff=NOW-2000,
                         signals=[signal()], events=[], eventCursor=0, rounds=[], analytics={'total':211000})
        self.calls = []
    def now(self):return self.time
    def poll(self, cursor=0):self.calls.append(cursor);return self.body
    def close(self):pass


class Telegram:
    def __init__(self):self.calls=[];self.failure=None
    def call(self, method, payload=None, photo=None):
        self.calls.append((method, payload, photo))
        if self.failure:raise self.failure
        return {'message_id':len(self.calls),'photo':[{'file_id':'telegram-cached-photo'}]}


class CanonicalRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.source=Source();self.telegram=Telegram()
        config={'DATABASE_PATH':str(pathlib.Path(self.tmp.name)/'v3.sqlite3'),
                'TELEGRAM_CHAT_IDS':'-100123456','POLL_SECONDS':5}
        self.bot=cr.CanonicalBot(config,source=self.source,telegram=self.telegram,photo=b'exact-photo')
    def tearDown(self):self.bot.close();self.tmp.cleanup()
    def sync(self, signals=None, **kw):
        body={**self.source.body,**kw}
        if signals is not None:body['signals']=signals
        self.bot.sync(body,self.source.time)
    def complete_forecast(self):
        self.bot.flush(self.source.time)
        self.source.time+=1300;self.bot.flush(self.source.time)
    def test_site_canonical_id_and_times_are_not_recomputed(self):
        self.sync();self.complete_forecast()
        row=self.bot.journal.db.execute('SELECT metadata FROM signals').fetchone()
        saved=json.loads(row[0]);self.assertEqual(saved['id'],'canonical-1');self.assertEqual(saved['start'],NOW)
        self.assertEqual([x[0]for x in self.telegram.calls],['sendPhoto','sendMessage'])
        self.assertIn('canonical-1',self.telegram.calls[-1][1]['text'])
    def test_no_local_forecast_fallback_when_api_fails(self):
        def bad(*a):raise cr.SourceError('offline')
        self.source.poll=bad;self.bot.tick()
        self.assertEqual(self.bot.journal.db.execute('SELECT count(*) FROM signals').fetchone()[0],0)
        self.assertEqual(self.telegram.calls,[])
    def test_default_delivery_filter_does_not_remove_other_models(self):
        records=[signal(),{**signal(),'id':'six-minute','channel':'duration_6'},
                 {**signal(),'id':'round-model','channel':'rounds_5','windowKind':'rounds','roundsRequired':6,'roundsRemaining':6,'end':None},
                 {**signal(),'id':'vip-model','channel':'vip_500','start':NOW+100000,'target':500}]
        self.sync(records)
        self.assertEqual(self.bot.journal.db.execute('SELECT count(*) FROM signals').fetchone()[0],4)
        announced=[x[0]for x in self.bot.journal.db.execute('SELECT DISTINCT signal_id FROM deliveries')]
        self.assertEqual(set(announced),{'canonical-1','vip-model'})
    def test_explicit_all_channel_delivery(self):
        self.bot.channels=None
        self.sync([{**signal(),'id':'duration','channel':'duration_6'}])
        self.assertEqual(self.bot.journal.db.execute('SELECT count(*)FROM deliveries').fetchone()[0],2)
    def test_restart_does_not_duplicate(self):
        self.sync();self.complete_forecast();self.sync();self.source.time+=2000;self.bot.flush(self.source.time)
        self.assertEqual(len(self.telegram.calls),2)
    def test_old_active_startup_window_not_reannounced(self):
        self.sync([{**signal(),'issuedAt':NOW-300000,'start':NOW-300000,'end':NOW+300000}])
        self.assertEqual(self.bot.journal.db.execute('SELECT count(*)FROM deliveries').fetchone()[0],0)
    def test_no_forecast_when_source_is_stale(self):
        self.sync(sourceFresh=False);self.bot.flush(NOW);self.assertEqual(self.telegram.calls,[])
        self.sync(sourceFresh=True);self.complete_forecast();self.assertEqual(len(self.telegram.calls),2)
    def test_outcome_comes_before_next_forecast(self):
        self.sync();self.complete_forecast();self.source.time=NOW+181000
        self.sync([{**signal(),'status':'hit','actual':25,'resultAt':NOW+170000},
                   {**signal(),'id':'canonical-2','start':self.source.time,'end':self.source.time+180000,'issuedAt':self.source.time}])
        self.bot.flush(self.source.time)
        self.assertEqual(self.telegram.calls[-1][0],'sendMessage')
        self.assertIn('ЦЕЛЬ ДОСТИГНУТА',self.telegram.calls[-1][1]['text'])
    def test_429_pause_is_persistent(self):
        self.sync();self.telegram.failure=cr.DeliveryError(429,30);self.bot.flush(NOW)
        self.bot.flush(NOW+10000);self.assertEqual(len(self.telegram.calls),1)
        self.assertEqual(self.bot.journal.get('telegram_paused_until'),NOW+30000)
    def test_ambiguous_post_not_retried(self):
        self.sync();self.telegram.failure=cr.DeliveryError('network',ambiguous=True)
        self.bot.flush(NOW);self.bot.flush(NOW+5000);self.assertEqual(len(self.telegram.calls),1)
    def test_per_chat_rate_limit_survives_restart(self):
        self.sync();self.bot.journal.set('chat_send_times:-100123456',[NOW-5000+i for i in range(19)])
        self.bot.flush(NOW);self.assertEqual(self.telegram.calls,[])
    def test_expired_current_window_not_retimed(self):
        self.sync([{**signal(),'start':NOW-160000,'end':NOW+20000}]);self.bot.flush(NOW)
        self.assertEqual(self.telegram.calls,[])
    def test_round_window_has_no_fake_close_time(self):
        s=cr.canonical_signal({**signal(),'channel':'rounds_100','windowKind':'rounds','end':None,
                              'roundsRequired':122,'roundsRemaining':120,'estimatedEnd':NOW+3600000},NOW)
        text=cr.render_forecast(s);self.assertIn('122 следующих раундов',text)
        self.assertIn('ОРИЕНТИРОВОЧНО',text);self.assertNotIn('⌛ ЗАКРЫТИЕ',text)
    def test_old_event_does_not_rewind_remaining_rounds(self):
        self.bot.channels=None
        old={**signal(),'channel':'rounds_5','windowKind':'rounds','end':None,'roundsRequired':6,'roundsRemaining':6}
        current={**old,'roundsRemaining':1,'roundsObserved':5}
        self.sync([current],events=[{'seq':1,'signalId':'canonical-1','kind':'created','payload':{'signal':old}}],eventCursor=1)
        state=self.bot.journal.progress('canonical-1',{})
        self.assertEqual(state['roundsRemaining'],1)
        self.assertEqual(self.bot.journal.db.execute('SELECT count(*)FROM deliveries').fetchone()[0],0)
    def test_immutable_parameters_cannot_silently_change(self):
        self.sync()
        with self.assertRaises(ValueError):self.sync([{**signal(),'target':500}])
    def test_event_cursor_recovery_applies_unknown_revision(self):
        self.sync();self.complete_forecast();self.source.time=NOW+200000
        self.sync([{**signal(),'status':'unknown'}],eventCursor=3)
        self.bot.flush(self.source.time)
        self.source.time+=2000
        outcome={'status':'hit','actual':22,'resultAt':NOW+100000}
        self.sync([],events=[{'seq':4,'signalId':'canonical-1','kind':'hit','payload':{'outcome':outcome}}],eventCursor=4)
        self.bot.flush(self.source.time)
        self.assertIn('УТОЧНЕНИЕ',self.telegram.calls[-1][1]['text'])
        self.assertEqual(self.bot.journal.get('canonical_event_cursor'),4)
    def test_file_id_cache_avoids_repeat_image_upload(self):
        self.sync();self.complete_forecast();self.source.time+=2000
        self.sync([{**signal(),'id':'next'}]);self.bot.flush(self.source.time)
        self.assertEqual(self.telegram.calls[-1][0],'sendPhoto')
        self.assertIsNone(self.telegram.calls[-1][2]);self.assertEqual(self.telegram.calls[-1][1]['photo'],'telegram-cached-photo')


class FakeResponse:
    status_code=200
    def json(self):return {'serverNow':NOW,'sourceFresh':True,'signals':[],'events':[],'eventCursor':0}


class SourceContractTests(unittest.TestCase):
    def test_only_cursor_and_zone_are_sent_no_local_model_input(self):
        class Session:
            def post(self,*a,**kw):self.args=a;self.kw=kw;return FakeResponse()
            def close(self):pass
        session=Session();s=cr.CanonicalSource({'SUPABASE_URL':'https://example.supabase.co','SUPABASE_KEY':'public','EDGE_TOKEN':'anon'},session)
        s.poll(42)
        self.assertEqual(session.kw['json'],{'action':'snapshot','zone':'Europe/Kyiv','afterEventId':42})
        self.assertFalse(session.kw['allow_redirects']);self.assertNotIn('TELEGRAM_BOT_TOKEN',session.kw['headers'])
    def test_99_999_is_not_displayed_as_guaranteed_100(self):
        for chance in (99.95486124486715,99.999,99.991):
            self.assertNotIn('100.0%',cr.probability_line({'confidence':chance,'scoreKind':'probability'}))


if __name__=='__main__':unittest.main()
