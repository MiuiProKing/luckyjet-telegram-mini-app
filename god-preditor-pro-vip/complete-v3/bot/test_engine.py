import unittest,json,subprocess,random,math
from pathlib import Path
import engine
NOW=1795208400000
SITE=Path(__file__).resolve().parents[1]/'site'/'engine.mjs'
if not SITE.exists():
 SITE=Path(__file__).resolve().parents[1]/'engine.mjs'
def rows(values,step=12000):
 return [dict(id=str(i),coefficient=x,timestamp=NOW-i*step,completed=True) for i,x in enumerate(values)]

def fixture_set():
 r=random.Random(1337)
 low=rows([1.1]*15+[2.2]*45)
 cluster=rows([30,50,100]+[2.2]*27+[1.2,3.3]*40)
 zone=rows([6,7,8]+[2.2,3.3]*40)
 fallback=rows([1.1,2.2,3.1]*70)
 golden=rows([2.2]*250)
 for i in [18,37,58,77,98,117,138,157,178,197,218,238]:golden[i]['coefficient']=12
 f=[low,cluster,zone,fallback,golden]
 for _ in range(20):
  f.append(rows([max(1,round(math.exp(r.random()*5),2)) if r.random()<.16 else round(1+r.random()*3,2) for i in range(r.randrange(20,700))]))
 return f

class EngineTests(unittest.TestCase):
 def test_five_rules(self):
  got=[engine.analyze_basic(f,now_ms=NOW)['pattern'] for f in fixture_set()[:5]]
  self.assertEqual(got,['low_streak','large_cluster','favorable_5_9','multi_signal','gold_cycle'])
 def test_normalize_no_future_estimated_incomplete(self):
  r=rows([1,2,3]);r += [dict(id='f',coefficient=500,timestamp=NOW+1),dict(id='e',coefficient=500,timestamp=NOW,estimated=True),dict(id='i',coefficient=500,timestamp=NOW,completed=False)]
  self.assertEqual(len(engine.normalize_rounds(r,NOW)),3)
 def test_distinct_ids_equal_coefficients_remain(self):
  r=rows([1,1,1]);self.assertEqual(len(engine.normalize_rounds(r+r,NOW)),3)
 def test_js_round(self):self.assertEqual(engine.js_round(2.5),3)
 def test_fixed_binary(self):self.assertEqual(engine.fixed(2.675),2.67)
 def test_hold(self):
  f=fixture_set()[0];p=engine.analyze_basic(f,now_ms=NOW)
  self.assertIs(engine.analyze_basic(f,p,NOW+2000),p)
 def test_exact_basic_numeric_python_js(self):
  fixtures=fixture_set(); code="import {analyzeBasic} from '"+SITE.as_uri()+"';let s='';for await(const c of process.stdin)s+=c;console.log(JSON.stringify(JSON.parse(s).map(r=>analyzeBasic(r,null,"+str(NOW)+"))));"
  raw=subprocess.check_output(['node','--input-type=module','-e',code],input=json.dumps(fixtures).encode())
  js=json.loads(raw)
  for i,(r,j) in enumerate(zip(fixtures,js)):
   p=engine.analyze_basic(r,now_ms=NOW)
   for key in ['estimatedCoef','confidence','reliability','estimatedAt','windowMs','generatedAt']:
    self.assertEqual(p[key],j[key],(i,key,p,j))
   if j['bigOpportunity']:
    for key in ['expectedAt','windowMs','estimatedCoef','confidence']:
     self.assertAlmostEqual(p['bigOpportunity'][key],j['bigOpportunity'][key],places=7,msg=str((i,key)))
 def test_python_js_bayes_and_threshold(self):
  fixtures=fixture_set()[3:]; code="import {normalizeRounds,bayesThreshold,analyzeThreshold} from '"+SITE.as_uri()+"';let s='';for await(const c of process.stdin)s+=c;console.log(JSON.stringify(JSON.parse(s).map(r=>({bayes:bayesThreshold(normalizeRounds(r,"+str(NOW)+"),20),threshold:analyzeThreshold(r,20,"+str(NOW)+")}))));"
  js=json.loads(subprocess.check_output(['node','--input-type=module','-e',code],input=json.dumps(fixtures).encode()))
  for i,(r,j) in enumerate(zip(fixtures,js)):
   p=engine.bayes_threshold(engine.normalize_rounds(r,NOW),20)
   for key in ['probability','perRoundProbability']:
    self.assertAlmostEqual(p[key],j['bayes'][key],places=11,msg=str((i,key)))
   for key in ['interval95','perRoundInterval95']:
    for a,b in zip(p[key],j['bayes'][key]):self.assertAlmostEqual(a,b,places=9,msg=str((i,key)))
   q=engine.analyze_threshold(r,20,NOW)
   for key in ['estimatedAt','status','events','medianGapMs','madGapMs']:
    self.assertEqual(q[key],j['threshold'][key],(i,key))
 def test_per_target_independent_time(self):
  r=rows([1.1]*1200,12000)
  # Nested thresholds have their own event cohorts and distinct median intervals.
  for i in range(20,1200,80):r[i]['coefficient']=20
  for i in range(40,1200,160):r[i]['coefficient']=200
  for i in range(60,1200,240):r[i]['coefficient']=500
  got=[engine.analyze_threshold(r,t,NOW) for t in (20,200,500)]
  self.assertTrue(all(x['estimatedAt'] is not None for x in got),got)
  self.assertEqual(len({x['estimatedAt'] for x in got}),3)
 def test_overdue_not_moved_to_future(self):
  r=rows([1.1]*1000,12000)
  for i in range(300,1000,100):r[i]['coefficient']=500
  got=engine.analyze_threshold(r,500,NOW)
  self.assertEqual(got['status'],'overdue');self.assertIsNone(got['estimatedAt'])
 def test_no_future_leak(self):
  r=fixture_set()[3];p=engine.analyze_basic(r,now_ms=NOW)
  self.assertEqual(p,engine.analyze_basic(r+[dict(id='future',coefficient=99999,timestamp=NOW+1000)],now_ms=NOW))
 def test_result_only_after_closure(self):
  r=rows([50,2,2]);result=engine.validate_window(r,40,NOW-30000,NOW+1000,NOW)
  self.assertEqual(result['status'],'pending');self.assertTrue(result['reached'])
 def test_hit(self):
  result=engine.validate_window(rows([2,50,2]),40,NOW-30000,NOW-1000,NOW)
  self.assertEqual(result['status'],'hit');self.assertEqual(result['actual'],50)
 def test_miss(self):
  result=engine.validate_window(rows([2]*30),40,NOW-240000,NOW-30000,NOW)
  self.assertEqual(result['status'],'miss')
 def test_unknown_gap(self):
  r=rows([2]*6,120000)
  result=engine.validate_window(r,40,NOW-400000,NOW-100000,NOW,avg_round_seconds=15)
  self.assertEqual(result['status'],'unknown')
 def test_all_legacy_browser_python_parity(self):
  f=fixture_set()[:8];legacy_js=SITE.parent/'legacy-ai.mjs'
  code="import {legacyLocalDiagnostics} from '"+legacy_js.as_uri()+"';let s='';for await(const c of process.stdin)s+=c;console.log(JSON.stringify(JSON.parse(s).map(r=>legacyLocalDiagnostics(r,"+str(NOW)+"))));"
  js=json.loads(subprocess.check_output(['node','--input-type=module','-e',code],input=json.dumps(f).encode()))
  def check(a,b,path):
   if a is None or isinstance(a,(str,bool)):self.assertEqual(a,b,path);return
   if isinstance(a,(int,float)):self.assertAlmostEqual(a,b,delta=max(1e-9,abs(a)*2e-12),msg=path);return
   if isinstance(a,list):
    self.assertEqual(len(a),len(b),path)
    for i,(x,y) in enumerate(zip(a,b)):check(x,y,path+f'[{i}]')
   elif isinstance(a,dict):
    for k,v in a.items():
     if k not in ('pattern','basis','reason'):check(v,b[k],path+'.'+k)
  for i,(r,j) in enumerate(zip(f,js)):
   p=engine.legacy_diagnostics(r,NOW)['results']
   for name in p:
    if name=='ts_full_prediction' or name=='ts_generate_prediction_exact':
     for key in ['estimatedCoef','confidence','reliability','estimatedAt','windowMs','generatedAt']:check(p[name].get(key),j[name].get(key),str((i,name,key)))
    else:check(p[name],j[name],str((i,name)))
 def test_all_uploaded_engines_active(self):
  report=engine.analyze_report(rows([1.2,15,20,50,100,200,500,1000,5000,50000]*60),NOW)
  legacy=report['legacyDiagnostics']
  self.assertTrue(legacy['available']);self.assertFalse(legacy['errors'],legacy['errors'])
  self.assertEqual(set(legacy['results']),{'premium_research_analysis','ts_full_prediction','ai_analyze','three_archive_analysis','ts_generate_prediction_exact'})
  self.assertTrue(legacy['diagnosticOnly'])
 def test_beta_quantiles_known(self):
  self.assertAlmostEqual(engine.beta_quantile(.5,.5,.5),.5,places=12)
  self.assertAlmostEqual(engine.beta_quantile(.95,1,1),.95,places=12)
 def test_gamma_quantile_known(self):
  self.assertAlmostEqual(engine.gamma_quantile(.95,1),-math.log(.05),places=11)
 def test_no_spurious_elapsed_chance_boost(self):
  r=fixture_set()[3]
  a=engine.analyze_threshold(r,20,NOW);b=engine.analyze_threshold(r,20,NOW+60000)
  self.assertEqual(a['probability'],b['probability'])
 def test_all_contains_timed(self):
  r=rows([1.2,1.1,1.15]+[2.2,15,20,5,100]*120)
  out=engine.analyze_all(r,NOW);live=[x for x in out if x['channel']=='premium_live']
  self.assertEqual(len(live),1);self.assertTrue(live[0]['liveWindow']);self.assertEqual(live[0]['estimatedAt'],NOW+3600)

if __name__=='__main__':unittest.main()
