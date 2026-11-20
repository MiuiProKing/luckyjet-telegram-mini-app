"""GOD PREDITOR: reviewed client formulas and independent statistical estimates.
Scores copied from a public rule engine are heuristic scores, not measured accuracy.
No source-site credentials, bot secrets, network requests or betting actions live here.
"""
from __future__ import annotations
import datetime as dt
import math
import time
from decimal import Decimal, ROUND_HALF_UP
from collections import defaultdict

VERSION = 'complete-public-20261120-v1'
TARGETS = (10, 20, 40, 50, 100, 200, 500)
MIN = 60000

def _num(x):
    try:
        if x is None or isinstance(x, bool): return None
        n = float(x)
        return n if math.isfinite(n) else None
    except (ValueError, TypeError, OverflowError): return None

def parse_time(x):
    n = _num(x)
    if n is not None:
        return n * 1000 if 0 < n < 100000000000 else n
    if isinstance(x, str):
        try:
            z = dt.datetime.fromisoformat(x.replace('Z', '+00:00'))
            if not z.tzinfo: z = z.replace(tzinfo=dt.timezone.utc)
            return z.timestamp() * 1000
        except ValueError: pass
    return None

def normalize_rounds(rows, now_ms=None, limit=None):
    """Newest first, exact completed records only; IDs are never coefficient keys."""
    now_ms = time.time()*1000 if now_ms is None else now_ms
    out, ids = [], set()
    for r in rows or []:
        if not isinstance(r, dict) or r.get('estimated') is True or r.get('completed') is False: continue
        x = _num(r.get('coefficient', r.get('x')))
        stamp = parse_time(r.get('timestamp', r.get('round_timestamp', r.get('played_at'))))
        if x is None or x < 1 or stamp is None or stamp <= 0 or stamp > now_ms: continue
        ident = r.get('id')
        # Same timestamp does not prove duplicate if separate provider IDs exist.
        key = ('id',str(ident)) if ident is not None else ('fallback',stamp,x)
        if key in ids: continue
        ids.add(key)
        out.append(dict(r, id=str(ident) if ident is not None else f'{stamp}:{x}', coefficient=x, timestamp=stamp))
    out.sort(key=lambda r:(r['timestamp'],str(r['id'])),reverse=True)
    return out[:limit] if limit is not None else out

def mean(xs): return sum(xs)/len(xs) if xs else 0

def median(xs):
    if not xs:return 0
    s=sorted(xs); n=len(s); m=n//2
    return s[m] if n%2 else (s[m-1]+s[m])/2

def std(xs): return math.sqrt(mean([(x-mean(xs))**2 for x in xs])) if len(xs)>=2 else 0

def mad(xs): return median([abs(x-median(xs)) for x in xs]) if len(xs)>=2 else 0

def geo(xs): return math.exp(mean([math.log(max(x,1.001)) for x in xs])) if xs else 0

def ema(xs,a):
    if not xs:return 0
    v=xs[-1]
    for x in reversed(xs[:-1]):v=a*x+(1-a)*v
    return v

def clamp(x,a,b):return max(a,min(b,x))

def js_round(x):return math.floor(x+0.5)

def fixed(x,n=2):
    # JS toFixed rounds the represented binary value, not its shortest decimal string.
    return float(Decimal.from_float(float(x)).quantize(Decimal(1).scaleb(-n),rounding=ROUND_HALF_UP))

def gap_analysis(rows,target):
    hits=sorted((r for r in rows if r['coefficient']>=target),key=lambda r:r['timestamp'])
    gaps=[b['timestamp']-a['timestamp'] for a,b in zip(hits,hits[1:])]
    return dict(count=len(hits),last=hits[-1]['timestamp'] if hits else None,
                avgGap=mean(gaps),medGap=median(gaps),stdGap=std(gaps),madGap=mad(gaps))

def _bucket(rows,kind):
    buckets=defaultdict(list)
    for r in rows:
        date=dt.datetime.fromtimestamp(r['timestamp']/1000,dt.timezone.utc)
        buckets[getattr(date,kind)].append(r['coefficient'])
    return {k:dict(count=len(v),avg=geo(v),max=max(v)) for k,v in buckets.items()}

def legacy_big_candidates(rows,now_ms):
    """All 3 original rules preserved as diagnostics, including the old elapsed-CDF rule."""
    s=sorted(rows,key=lambda r:r['timestamp']); a=gap_analysis(s,100); out=[]
    if a['count']>=5 and a['last'] and a['medGap']>0:
        expected=a['last']+a['medGap'];drift=expected-now_ms
        tol=clamp(a['madGap']*1.4826 or a['medGap']*.35,2*MIN,12*MIN)
        elapsed=now_ms-a['last']
        if a['madGap']>0 and a['madGap']<a['medGap']*.5 and (abs(drift)<=tol*.7 or elapsed>=a['medGap']*.9):
            conf=clamp(55+min(10,a['count'])+clamp(1-abs(drift)/max(tol,1),0,1)*12,55,82)
            out.append(dict(expectedAt=expected if drift>0 else now_ms+max(2*MIN,tol*.4),windowMs=clamp(tol,3*MIN,10*MIN),estimatedCoef=100,confidence=js_round(conf),rule='cycle100',historicalExpectedAt=expected,reason=f"Cycle 100x≈{a['medGap']/MIN:.1f}min"))
    recent=s[-80:]; big20=sum(r['coefficient']>=20 for r in recent);big50=sum(r['coefficient']>=50 for r in recent)
    if big50>=3 and big20>=6:
        out.append(dict(expectedAt=now_ms+3*MIN,windowMs=6*MIN,estimatedCoef=120,confidence=js_round(clamp(55+big50*5+big20,55,82)),rule='hot_cluster',reason=f'Cluster chaud : {big20}×≥20x + {big50}×≥50x sur 80 tours'))
    if a['count']>=4 and a['last'] and len(s)>=80:
        span=s[-1]['timestamp']-s[0]['timestamp']; rate=a['count']/span if span>0 else 0
        if rate>0:
            elapsed_cdf=-math.expm1(-rate*(now_ms-a['last']))
            if elapsed_cdf>=.75:
                eta=clamp(1/rate,90000,8*MIN)
                out.append(dict(expectedAt=now_ms+eta,windowMs=clamp(eta*.8,3*MIN,7*MIN),estimatedCoef=100,confidence=js_round(clamp(50+elapsed_cdf*30,50,80)),rule='elapsed_poisson_diagnostic',elapsedCDF=elapsed_cdf,reason='Original elapsed-wait CDF; not probability of a future event'))
    return out

def legacy_big_opportunity(rows,now_ms):
    candidates=legacy_big_candidates(rows,now_ms)
    if not candidates:return None
    candidates.sort(key=lambda r:r['confidence'],reverse=True)
    top=dict(candidates[0])
    if len(candidates)<2 and top['confidence']<75:return None
    if len(candidates)>=2:top['confidence']=min(92,top['confidence']+5)
    return top

def analyze_basic(rows,previous=None,now_ms=None,profile='compiled'):
    now_ms=time.time()*1000 if now_ms is None else now_ms
    rows=normalize_rounds(rows,now_ms)
    if len(rows)<20 or now_ms-rows[0]['timestamp']>180000:return None
    if previous and now_ms<max(previous['estimatedAt']+previous['windowMs'],previous['generatedAt']+MIN):return previous
    a=[r['coefficient'] for r in rows]; mid=median(a); geometric=geo(a)
    v=mean(a[:50]); e20=ema(a[:20],.25);e50=ema(a[:50],.12);sigma=std(a[:50]);robust=mad(a[:50])
    gold=gap_analysis(rows,10);date=dt.datetime.fromtimestamp(now_ms/1000,dt.timezone.utc)
    hourly=_bucket(rows,'hour').get(date.hour);minute=_bucket(rows,'minute').get((date.minute+2)%60)
    recent=[r for r in rows[:30] if r['coefficient']>=20]
    big=legacy_big_opportunity(rows,now_ms)
    def make(target,score,eta,width,pattern,basis,confidence=None):
        return dict(estimatedCoef=fixed(target),confidence=confidence or ('Élevé' if score>=82 else 'Moyen' if score>=66 else 'Faible'),reliability=score,estimatedAt=eta,windowMs=width,pattern=pattern,basis=basis,generatedAt=now_ms,bigOpportunity=big)
    if gold['medGap']>0 and gold['last']:
        drift=gold['last']+gold['medGap']-now_ms;tol=clamp(gold['madGap']*1.4826 or gold['medGap']*.55,MIN,4*MIN)
        if gold['count']>=8 and gold['madGap']>0 and gold['madGap']<gold['medGap']*.6 and abs(drift)<=tol*.6:
            divisor=2 if len(recent)>=3 else 3 if recent else 4
            target=clamp(max(a[:80])/divisor,2,20)
            score=js_round(clamp(clamp(60-abs(drift)/tol*15,40,62)+(3 if hourly and hourly['avg']>geometric else 0)+clamp(gold['count']/20,0,4),40,68))
            eta=now_ms+(clamp(drift,45000,2*MIN) if drift>0 else 90000) if profile=='compiled' else now_ms+(max(drift,90000) if drift>0 else 2*MIN)
            return make(target,score,eta,clamp(gold['medGap']*.25,90000,3*MIN),'gold_cycle',f"Медианный цикл ≥10×: {gold['medGap']/MIN:.1f} мин; MAD {gold['madGap']/MIN:.2f} мин")
    if len(a)>=15 and all(x<2 for x in a[:15]):
        score=js_round(clamp(70+min(15,(now_ms-rows[14]['timestamp'])/MIN),65,92))
        return make(clamp(geometric*2.5+mid,2.5,15),score,now_ms+90000,2*MIN,'low_streak','15 последних раундов ниже 2×; эвристическое правило', 'Élevé' if score>=82 else 'Moyen')
    if len(recent)>=3:
        divisor=3 if len(recent)>=5 else 4 if len(recent)>=4 else 5
        score=min(78,60+len(recent)*3)
        return make(clamp(geo([r['coefficient'] for r in recent])/divisor,2,12),score,now_ms+(90000 if profile=='compiled' else 2*MIN),2.5*MIN,'large_cluster',f'{len(recent)} результатов ≥20× среди 30 раундов', 'Élevé' if score>=72 else 'Moyen')
    zone=[x for x in a[:60] if 5<=x<10];low=mean([int(x<2) for x in a[:60]])
    if len(zone)>=3:
        fragile=low>.55 or sigma>v*1.4;g=geo(zone)
        score=js_round(clamp(64+len(zone)*4+(-6 if fragile else 6),58,90))
        return make(clamp(g*.45,2,4.5) if fragile else clamp(g*.7,3,7),score,now_ms+(90000 if profile=='compiled' else 2*MIN),2.5*MIN,'mixed_5_9' if fragile else 'favorable_5_9',f'{len(zone)} результатов 5–9×; ниже 2×: {low*100:.0f}%', 'Élevé' if score>=82 else 'Moyen' if score>=68 else 'Faible')
    hour_ratio=hourly['avg']/max(geometric,.1) if hourly and hourly['count']>=5 else 1
    minute_ratio=minute['avg']/max(geometric,.1) if minute and minute['count']>=5 else 1
    weighted=e20*.5+e50*.3+v*.2; target=clamp(weighted*hour_ratio*.6+(minute['max'] if minute else 0)*.1+1.6,1.8,12)
    fragile=low>.6 or sigma>v*1.6
    target=min(target,3.2) if fragile else min(target,5) if low>.45 else target
    score=js_round(clamp(52+clamp(len(rows)/25,0,28)+clamp(abs(hour_ratio-1)*42,0,22)+clamp(abs(minute_ratio-1)*32,0,16)+(5 if robust>0 and robust<v*.6 else 0)+(-8 if fragile else 0),50,92))
    eta=now_ms+MIN+((60-date.second)*1000)%MIN if profile=='compiled' else now_ms+2*MIN+((60-date.second)*1000)%45000
    return make(target,score,eta,2.5*MIN,'multi_signal',f'EMA20 {e20:.2f}×; MAD {robust:.2f}; σ50 {sigma:.2f}; {len(rows)} раундов')

# Numerical special functions avoid SciPy dependency on simple bot hosting.
def _beta_cf(a,b,x):
    qab=a+b;qap=a+1;qam=a-1;c=1.;d=1-qab*x/qap
    if abs(d)<1e-300:d=1e-300
    d=1/d;h=d
    for m in range(1,401):
        m2=2*m;aa=m*(b-m)*x/((qam+m2)*(a+m2));d=1+aa*d;c=1+aa/c
        if abs(d)<1e-300:d=1e-300
        if abs(c)<1e-300:c=1e-300
        d=1/d;h*=d*c;aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2));d=1+aa*d;c=1+aa/c
        if abs(d)<1e-300:d=1e-300
        if abs(c)<1e-300:c=1e-300
        d=1/d;delta=d*c;h*=delta
        if abs(delta-1)<3e-14:break
    return h

def beta_cdf(x,a,b):
    if x<=0:return 0.
    if x>=1:return 1.
    bt=math.exp(math.lgamma(a+b)-math.lgamma(a)-math.lgamma(b)+a*math.log(x)+b*math.log1p(-x))
    return bt*_beta_cf(a,b,x)/a if x<(a+1)/(a+b+2) else 1-bt*_beta_cf(b,a,1-x)/b

def beta_quantile(q,a,b):
    lo,hi=0.,1.
    for _ in range(75):
        mid=(lo+hi)/2
        if beta_cdf(mid,a,b)<q:lo=mid
        else:hi=mid
    return (lo+hi)/2

def gamma_cdf(x,a):
    if x<=0:return 0.
    gln=math.lgamma(a)
    if x<a+1:
        ap=a;term=1/a;s=term
        for _ in range(10000):
            ap+=1;term*=x/ap;s+=term
            if abs(term)<abs(s)*3e-14:break
        return s*math.exp(-x+a*math.log(x)-gln)
    b=x+1-a;c=1e300;d=1/b;h=d
    for i in range(1,10001):
        an=-i*(i-a);b+=2;d=an*d+b;c=b+an/c
        if abs(d)<1e-300:d=1e-300
        if abs(c)<1e-300:c=1e-300
        d=1/d;delta=d*c;h*=delta
        if abs(delta-1)<3e-14:break
    return 1-math.exp(-x+a*math.log(x)-gln)*h

def gamma_quantile(q,a):
    lo=0.;hi=max(1.,a)
    while gamma_cdf(hi,a)<q:hi*=2
    for _ in range(75):
        mid=(lo+hi)/2
        if gamma_cdf(mid,a)<q:lo=mid
        else:hi=mid
    return (lo+hi)/2

def bayes_threshold(rows,target,window_ms=180000):
    n=len(rows);hits=sum(r['coefficient']>=target for r in rows)
    if not n:return None
    a=hits+.5;b=n-hits+.5;prob=a/(a+b)
    # Exact posterior predictive probability of >=1 hit in subsequent k rounds.
    rounds={}
    for k in (1,3,5):
        miss=math.prod((b+i)/(a+b+i) for i in range(k));rounds[k]=1-miss
    lo=beta_quantile(.025,a,b);hi=beta_quantile(.975,a,b)
    span=(rows[0]['timestamp']-rows[-1]['timestamp'])/MIN if n>1 else 0
    if span<=0:return dict(target=target,sampleSize=n,hits=hits,perRoundProbability=prob,perRoundInterval95=[lo,hi],nextRounds=rounds,probability=None,interval95=None)
    # Count events in (first,last]; first is the observation boundary.
    events=hits-int(rows[-1]['coefficient']>=target);shape=events+.5;rate=span;w=window_ms/MIN
    future=-math.expm1(-shape*math.log1p(w/rate))
    interval=[-math.expm1(-gamma_quantile(q,shape)/rate*w) for q in (.025,.975)]
    return dict(target=target,sampleSize=n,hits=hits,events=events,exposureMinutes=span,probability=future,interval95=interval,perRoundProbability=prob,perRoundInterval95=[lo,hi],nextRounds=rounds,calibrated=False)

def analyze_threshold(rows,target,now_ms=None,window_ms=180000,min_events=5,lead_ms=40000):
    now_ms=time.time()*1000 if now_ms is None else now_ms
    rows=normalize_rounds(rows,now_ms);gap=gap_analysis(rows,target);stats=bayes_threshold(rows,target,window_ms)
    out=dict(channel=f'vip_{target}',target=target,estimatedCoef=target,estimatedAt=None,windowMs=window_ms,generatedAt=now_ms,status='waiting',confidence=(stats['probability']*100 if stats and stats['probability'] is not None else None),scoreKind='model_probability',reason='',modelVersion=VERSION,modelKind='median_gap_hypothesis',originalVipServerFormula=False,calibrated=False,events=gap['count'],lastHitAt=gap['last'],medianGapMs=gap['medGap'],madGapMs=gap['madGap'],dataCutoff=rows[0]['timestamp'] if rows else None,sampleSize=len(rows),probability=stats['probability'] if stats else None,interval95=stats['interval95'] if stats else None)
    if len(rows)<200:out['reason']='Нужно не менее 200 завершённых раундов';return out
    if now_ms-rows[0]['timestamp']>180000:out['reason']='История устарела; расчёт приостановлен';return out
    if gap['count']<min_events or gap['medGap']<=0:out['reason']=f'Для ≥{target}× недостаточно исторических событий ({gap["count"]}/{min_events})';return out
    expected=gap['last']+gap['medGap'];out['historicalExpectedAt']=expected
    if expected<=now_ms:out['status']='overdue';out['reason']='Медианная историческая отметка уже прошла; новая точная дата не доказана';return out
    if expected-now_ms<lead_ms:out['reason']='До исторической отметки недостаточно времени для уведомления';return out
    out.update(estimatedAt=expected,status='candidate',start=expected,end=expected+window_ms,reason=f'Оценка по {gap["count"]} событиям ≥{target}×; медианный интервал {gap["medGap"]/MIN:.1f} мин',basisEvent=f'{target}:{gap["last"]}')
    return out

def validate_window(rows,target,start,end,now_ms=None,avg_round_seconds=None):
    now_ms=time.time()*1000 if now_ms is None else now_ms
    s=sorted(normalize_rounds(rows,now_ms),key=lambda r:r['timestamp']);inside=[r for r in s if start<=r['timestamp']<=end]
    best=max(inside,key=lambda r:r['coefficient'],default=None)
    base=dict(reached=bool(best and best['coefficient']>=target),actual=best['coefficient'] if best else None,resultAt=best['timestamp'] if best else None,roundId=best['id'] if best else None)
    if now_ms<=end:return dict(base,status='pending',reason='Окно ещё не закрыто')
    if base['reached']:return dict(base,status='hit',reason='Цель достигнута в пределах окна')
    before=[r for r in s if r['timestamp']<start];after=[r for r in s if r['timestamp']>end]
    if not before or not after or not inside:return dict(base,status='unknown',reason='Нет полного покрытия границ окна')
    avg=avg_round_seconds or median([b['timestamp']-a['timestamp'] for a,b in zip(s,s[1:]) if b['timestamp']>a['timestamp']])/1000
    maximum=min(180000,max(60000,avg*3000));coverage=[before[-1],*inside,after[0]]
    if any(b['timestamp']-a['timestamp']>maximum for a,b in zip(coverage,coverage[1:])):return dict(base,status='unknown',reason='В истории есть большой разрыв')
    return dict(base,status='miss',reason='Цель не достигнута при проверенном покрытии окна')

def legacy_diagnostics(rows,now_ms):
    """Run every supplied pure engine in isolation on an identical strict as-of snapshot.
    Original variants are kept for comparison. Their clamped future dates and scores
    do not become independent votes or calibrated probabilities in the main engine.
    """
    try:
        import legacy
    except ImportError as exc:
        return {'available':False,'error':str(exc),'results':{}}
    clean=[]
    for r in normalize_rounds(rows,now_ms):
        iso=dt.datetime.fromtimestamp(r['timestamp']/1000,dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
        clean.append(dict(r,round_timestamp=iso,played_at=iso,estimated=False,completed=True))
    results={};errors={}
    calls={
        'premium_research_analysis':lambda:legacy.premium_research_analysis(clean,now_ms),
        'ts_full_prediction':lambda:legacy.ts_full_prediction(clean,now_ms),
        'ai_analyze':lambda:legacy.ai_analyze(clean,now_ms/1000),
        'three_archive_analysis':lambda:{str(t):legacy.three_archive_analysis(clean,t,now_ms/1000) for t in (10,20,40,50,100,200,500,1000,5000,50000)},
        'ts_generate_prediction_exact':lambda:legacy.ts_generate_prediction_exact(clean,now=now_ms),
    }
    for name,call in calls.items():
        try:results[name]=call()
        except Exception as exc:errors[name]=type(exc).__name__+': '+str(exc)[:200]
    return dict(available=True,results=results,errors=errors,diagnosticOnly=True,
                scoreKind='correlated_legacy_heuristics',calibrated=False,
                futureShiftPolicy='Legacy future-clamping retained only for source comparison; not an entry recommendation')

def analyze_report(rows,now_ms=None):
    now_ms=time.time()*1000 if now_ms is None else now_ms
    rows=normalize_rounds(rows,now_ms);fresh=bool(rows and now_ms-rows[0]['timestamp']<=180000)
    report=dict(version=VERSION,now=now_ms,sampleSize=len(rows),dataCutoff=rows[0]['timestamp'] if rows else None,fresh=fresh,basic=analyze_basic(rows[:2000],now_ms=now_ms),thresholds=[analyze_threshold(rows,t,now_ms) for t in TARGETS],bigDiagnostics=legacy_big_candidates(rows,now_ms),originalVipServerFormula=False,originalAiServerFormula=False,legacyDiagnostics=legacy_diagnostics(rows,now_ms))
    try:
        from timed_engine import timed_analyze, timed_choose, timed_largest, TIMED_DURATIONS
        rates=timed_analyze(rows[:5000],now_ms)
        latest=[dict(coefficient=r['coefficient'],played_at=r['timestamp']) for r in rows[:3]]
        report['timedRates']=rates
        report['timedDurations']=[dict(minutes=minutes, proposal=timed_largest(minutes,rates['pct'],rates['perHour'])) for minutes in TIMED_DURATIONS] if rates else []
        report['timed']=timed_choose(rates,latest,now_ms+3600,now_ms) if rates else None
    except ImportError:report['timed']=None
    return report

def analyze_all(rows,now_ms=None,report=None):
    now_ms=time.time()*1000 if now_ms is None else now_ms
    rows=normalize_rounds(rows,now_ms);report=report if report is not None else analyze_report(rows,now_ms);out=[]
    if not report['fresh']:return out
    basic=report['basic']
    if basic:
        out.append(dict(basic,channel='basic',target=basic['estimatedCoef'],confidence=basic['reliability'],scoreKind='heuristic',reason=basic['basis'],modelVersion=VERSION,calibrated=False,basisEvent=rows[0]['id']))
    out.extend(r for r in report['thresholds'] if r['estimatedAt'] is not None)
    for candidate in report['bigDiagnostics']:
        rule=candidate['rule']
        if rule=='elapsed_poisson_diagnostic':continue
        if rule=='cycle100' and candidate['historicalExpectedAt']<=now_ms+40000:continue
        out.append(dict(candidate,channel='big_'+rule,target=candidate['estimatedCoef'],estimatedAt=candidate['expectedAt'],scoreKind='heuristic',modelVersion=VERSION,calibrated=False,basisEvent=rows[0]['id'] if rule=='hot_cluster' else str(candidate['historicalExpectedAt'])))
    timed=report.get('timed')
    if timed:
        start=parse_time(timed['startAt'])
        out.append(dict(channel='premium_live',target=timed['level'],estimatedAt=start,windowMs=timed['minutes']*MIN,confidence=timed['chance'],scoreKind='independence_model_probability',reason=timed['reason'],modelVersion='public-timed-20261120-v1',calibrated=False,basisEvent=rows[0]['id'],noticeSeconds=3.6,liveWindow=True,issuedAt=now_ms))
    return out
