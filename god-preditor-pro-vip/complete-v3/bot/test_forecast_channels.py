import unittest,math,json,subprocess
from pathlib import Path
import forecast_channels as fc

class CanonicalChannelTests(unittest.TestCase):
    def test_round_formula_matches_reviewed_source(self):
        values=[0,100,18.88,9.45,.956,.095,1e-8,69,70,50]
        code="function O(a,t=69){return a<=0?null:a>=100?1:Math.ceil(Math.log(1-t/100)/Math.log(1-a/100))};console.log(JSON.stringify("+json.dumps(values)+".map(x=>O(x))))"
        actual=json.loads(subprocess.check_output(['node','-e',code]))
        self.assertEqual([fc.minimum_rounds(x)for x in values],actual)

    def test_deep_constant_is_explicit_assumption(self):
        analytics={'total':10000,'first':'2026-11-01T00:00:00Z','last':'2026-11-02T00:00:00Z','global':{'p2':48,'p5':19,'p10':10,'p100':1,'n10000':4}}
        table=fc.deep_wait_table(analytics)
        k=next(x for x in table if x['target']==1000)
        self.assertEqual(k['perRoundPct'],.095)
        self.assertEqual(k['assumption'],'fixed_original_0.095_percent')
        empirical=next(x for x in table if x['target']==10000)
        self.assertAlmostEqual(empirical['perRoundPct'],.04)
        self.assertIsNone(empirical['assumption'])
        self.assertTrue(all(0<=c['probabilityPct']<=100 for r in table for c in r['chances']))

    def test_no_exposure_is_zero(self):
        self.assertEqual(fc.full_history_per_hour({}),0)
        self.assertEqual(fc.full_history_per_hour({'first':'2026-11-01','last':'2026-11-01','total':10}),0)
        self.assertIsNone(fc.minimum_rounds(float('nan')))

if __name__=='__main__':unittest.main()

NOW=1795208400000
JS=Path(__file__).resolve().parents[1]/'shared'/'scheduler.mjs'
def fixture_rows(now=NOW,count=800):
    return [dict(id='round-'+str(i),coefficient=25 if i%200==199 else 12 if i%31==30 else 3.2 if i%7==6 else 1.1,timestamp=now-1000-i*12000,completed=True,estimated=False) for i in range(count)]
def fixture_analytics(now=NOW):
    return dict(total=200000,first=now-60*86400000,last=now-1000,firstCoefficient=1.2,global_=None,**{'global':dict(p2=47.22,p5=18.88,p10=9.45,p100=.956,n10000=12,n50000=1)},thresholdStats=[dict(target=t,count=max(5,200000//t),lastHitAt=now-(i+1)*30000,medianGapMs=600000+i*300000,madGapMs=60000)for i,t in enumerate([10,20,40,50,100,200,500])])
def coverage(start,end,hit_at=None,target=1.1):
    return [dict(id='c'+str(i),timestamp=at,coefficient=target if at==hit_at else 1.1,completed=True)for i,at in enumerate(range(int(start-10000),int(end+20001),10000))]
def project(p):
    d=p['diagnostics'];keys=['fresh','sampleSize','fullHistory','progress','waitingChanceTable','warnings','thresholds','sourceRates','timedRates','rateSource','timedDurations','channelStatistics','channelStatisticsScope','premium','timed']
    return dict(signals=p['signals'],outcomes=p['outcomes'],state=p['state'],diagnostics={k:d[k]for k in keys if k in d})
def comparable(x):
    if isinstance(x,dict):return {str(k):comparable(v)for k,v in x.items()if k not in ('reason','basis','pattern')}
    if isinstance(x,list):return [comparable(v)for v in x]
    return x

class FullSchedulerTests(unittest.TestCase):
    def assertTree(self,a,b,path=''):
        if isinstance(a,(int,float))and not isinstance(a,bool)and isinstance(b,(int,float))and not isinstance(b,bool):
            if abs(a)>1e10 or abs(b)>1e10:self.assertLessEqual(abs(a-b),.001,path)
            else:self.assertTrue(math.isclose(a,b,rel_tol=2e-9,abs_tol=2e-9),(path,a,b))
        elif isinstance(a,dict)and isinstance(b,dict):
            self.assertEqual(set(a),set(b),path)
            for k in a:self.assertTree(a[k],b[k],path+'.'+k)
        elif isinstance(a,list)and isinstance(b,list):
            self.assertEqual(len(a),len(b),path)
            for i,(x,y)in enumerate(zip(a,b)):self.assertTree(x,y,path+f'[{i}]')
        else:self.assertEqual(a,b,path)
    def js(self,operation,values):
        code="import{planSnapshot,evaluateCanonicalSignal,stableSignalId}from '"+JS.as_uri()+"';let s='';for await(const c of process.stdin)s+=c;const v=JSON.parse(s);"
        if operation=='plan':
            code+="const keys="+json.dumps(['fresh','sampleSize','fullHistory','progress','waitingChanceTable','warnings','thresholds','sourceRates','timedRates','rateSource','timedDurations','channelStatistics','channelStatisticsScope','premium','timed'])+";function proj(p){return{signals:p.signals,outcomes:p.outcomes,state:p.state,diagnostics:Object.fromEntries(keys.filter(k=>k in p.diagnostics).map(k=>[k,p.diagnostics[k]]))}};console.log(JSON.stringify(v.map(x=>proj(planSnapshot(x)))));"
        elif operation=='evaluate':code+="console.log(JSON.stringify(v.map(x=>evaluateCanonicalSignal(x[0],x[1],x[2]))));"
        else:code+="console.log(JSON.stringify(v.map(x=>stableSignalId(...x))));"
        return json.loads(subprocess.check_output(['node','--input-type=module','-e',code],input=json.dumps(values,ensure_ascii=False).encode()))
    def test_stable_ids_utf8_match_javascript(self):
        v=[['rounds_5',NOW,'å-id'],['basic',NOW,'коэффициент'],['duration_61',NOW+.5,'round-99']]
        self.assertEqual([fc.stable_signal_id(*x)for x in v],self.js('id',v))
    def test_creation_and_frozen_ingest_match_js(self):
        r,a=fixture_rows(),fixture_analytics();first=dict(now=NOW,rounds=r,analytics=a);p=fc.plan_snapshot(first)
        channels={s['channel']for s in p['signals']}
        for ch in ['premium_live','basic','duration_3','duration_6','duration_7','duration_10','duration_30','duration_61','rounds_5','rounds_10','rounds_100','vip_500']:self.assertIn(ch,channels)
        second=dict(now=NOW+1000,rounds=[dict(id='NEWGOLD',coefficient=100,timestamp=NOW+500),*r],analytics=a,signals=p['signals'],state=p['state'])
        p2=fc.plan_snapshot(second);win=next(s for s in p['signals']if s['channel']=='premium_live')
        self.assertEqual(win['start'],NOW+3600);self.assertEqual(p2['state']['premium']['ingest']['proposal']['level'],win['target'])
        self.assertFalse(any(s['channel']=='premium_live'for s in p2['signals']))
        py=[comparable(project(fc.plan_snapshot(x)))for x in [first,second]];js=[comparable(x)for x in self.js('plan',[first,second])]
        self.assertTree(py,js)
    def test_outcome_boundaries_rounds_gaps_and_evidence_match_js(self):
        t=dict(id='t',channel='premium_live',target=10,start=NOW,end=NOW+30000,boundaryPolicy='open_start')
        r=dict(id='r',target=5,start=NOW,windowKind='rounds',roundsRequired=3,end=None)
        v=[[t,coverage(NOW,NOW+30000,hit_at=NOW,target=100),NOW+50001],[t,coverage(NOW,NOW+30000,hit_at=NOW+30000,target=10),NOW+30000],[t,coverage(NOW,NOW+30000,hit_at=NOW+30000,target=10),NOW+30001],
           [dict(t,end=NOW+180000),[dict(id='before',timestamp=NOW-1,coefficient=1.1),dict(id='inside',timestamp=NOW+170000,coefficient=1.1),dict(id='after',timestamp=NOW+180001,coefficient=1.1)],NOW+180002],
           [r,[dict(id='anchor',timestamp=NOW,coefficient=1),dict(id='hit',timestamp=NOW+170000,coefficient=100)],NOW+170001],
           [dict(r,evidence=dict(status='miss',actual=1.1,resultAt=NOW+30000,count=2)),[],NOW+40000],
           [dict(t,evidence=dict(status='hit',actual=12,resultAt=NOW+30001)),[],NOW+40000]]
        self.assertTree([fc.evaluate_canonical_signal(*x)for x in v],self.js('evaluate',v))
    def test_persisted_cooldown_and_revision_match_js(self):
        first=fc.plan_snapshot(dict(now=NOW,rounds=fixture_rows(),analytics=fixture_analytics()));s=next(s for s in first['signals']if s['channel']=='premium_live');at=s['end']+1
        signal=dict(s,evidence=dict(status='hit',actual=s['target']+1,resultAt=s['start']+10000,roundId='h'))
        v=dict(now=at,rounds=coverage(s['start'],s['end'])+fixture_rows(),analytics=fixture_analytics(at),signals=[signal],state=first['state'])
        p=fc.plan_snapshot(v);self.assertEqual(p['state']['premium']['cooldownUntil'],at+40000);self.assertFalse(any(x['channel']=='premium_live'for x in p['signals']))
        self.assertTree(comparable(project(p)),comparable(self.js('plan',[v])[0]))
    def test_future_stats_rejected_and_cutoff_counts_frozen(self):
        a=fixture_analytics();a['last']=NOW+100000
        p=fc.plan_snapshot(dict(now=NOW,rounds=fixture_rows(),analytics=a));self.assertIsNone(p['diagnostics']['fullHistory']);self.assertFalse(any(s['channel'].startswith(('duration_','rounds_'))for s in p['signals']))
        a=fixture_analytics();x=fc.plan_snapshot(dict(now=NOW,rounds=fixture_rows(),analytics=a));y=fc.plan_snapshot(dict(now=NOW+1000,rounds=[dict(id='new-500',timestamp=NOW+500,coefficient=600),*fixture_rows()],analytics=a))
        one=next(t for t in x['diagnostics']['thresholds']if t['target']==500);two=next(t for t in y['diagnostics']['thresholds']if t['target']==500)
        self.assertEqual(one['probability'],two['probability']);self.assertEqual(two['probabilityAsOf'],a['last']);self.assertEqual(two['lastHitAt'],NOW+500)
