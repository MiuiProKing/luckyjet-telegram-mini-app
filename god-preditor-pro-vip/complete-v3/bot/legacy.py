from datetime import timezone as _ts_timezone
from urllib.parse import urlsplit
import statistics as _premium_stats
AI_MIN_ROWS=200
BAYES_TARGETS=(10,20,40,50,100,200,500)
import math,time,json,statistics,re,os
from datetime import datetime,timezone
from zoneinfo import ZoneInfo
from html import escape
from collections import Counter as _ai_Counter
import statistics as _ai_stats
AI_THRESHOLDS=(10,20,50,100,500,1000,5000,50000)
def _bb_number(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return number if math.isfinite(number) else None

def _bb_now():
    return int(time.time() * 1000)

def _bb_log(message, config=None):
    value = str(message)
    for key in ('TELEGRAM_BOT_TOKEN', 'SUPABASE_KEY', 'EDGE_TOKEN', 'SUPABASE_ANON_KEY'):
        secret = str((config or globals().get('CONFIG', {})).get(key, ''))
        if secret:
            value = value.replace(secret, '[СКРЫТО]')
    value = re.sub(r'\b\d{6,12}:[A-Za-z0-9_-]{25,}', '[СКРЫТО]', value)
    print(time.strftime('%Y-%m-%d %H:%M:%S') + ' | ' + value[:500], flush=True)

def _bb_https(url):
    try:
        parsed = urlsplit(str(url))
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.port not in (None, 443):
            raise ValueError()
    except (TypeError, ValueError):
        raise ValueError('Нужен HTTPS-адрес сервиса без секретов в URL') from None
    return str(url).rstrip('/')

def _bb_stamp(ms):
    return datetime.fromtimestamp(ms / 1000, ZoneInfo('Europe/Kyiv')).strftime('%d.%m %H:%M:%S')

def _bb_window(raw):
    if not isinstance(raw, dict) or not isinstance(raw.get('id'), str) or not 0 < len(raw['id']) <= 512:
        return None
    values = [_bb_number(raw.get(key)) for key in ('target', 'start', 'end', 'issuedAt', 'probability')]
    if any(v is None for v in values):
        return None
    target, start, end, issued, probability = values
    if target not in BAYES_TARGETS or not 0 < issued < start < end or end-start != 180000 or not 0 <= probability <= 1:
        return None
    version = raw.get('modelVersion')
    if not isinstance(version, str) or not version.startswith('god-bayes-frequency-'):
        return None
    return {**raw, 'target': int(target), 'start': int(start), 'end': int(end), 'issuedAt': int(issued), 'probability': probability}

def _bb_same(first, second):
    return all(first.get(key) == second.get(key) for key in ('id', 'modelVersion', 'target', 'start', 'end', 'issuedAt', 'probability'))

def premium_research_analysis(rows, now_ms=None):
    """Analyze actual rounds with timestamps. Returns diagnostics and future observation windows."""
    now_ms = int(now_ms if now_ms is not None else _bb_now())
    clean = {}
    for r in rows:
        try:
            if r.get('estimated') is True: continue
            x = float(r['coefficient'])
            ts = int(datetime.fromisoformat(str(r['round_timestamp']).replace('Z','+00:00')).timestamp()*1000)
            if math.isfinite(x) and x >= 1 and 0 < ts <= now_ms+10000:
                clean[str(r.get('id') or ts)] = (ts,x)
        except (KeyError,ValueError,TypeError,OverflowError): continue
    ordered = sorted(clean.values())
    if len(ordered) < 20: return {'ok':False,'reason':'Менее 20 подтверждённых раундов','windows':[]}
    if now_ms - ordered[-1][0] > 180000: return {'ok':False,'reason':'История старше 3 минут','windows':[]}
    xs=[x for _,x in ordered]
    def median(v):return _premium_stats.median(v) if v else 0
    def ema(v,alpha):
        result=v[0]
        for x in v[1:]:result=alpha*x+(1-alpha)*result
        return result
    last50=xs[-50:]; avg50=sum(last50)/len(last50); med50=median(last50)
    mad50=median([abs(x-med50) for x in last50]); geo=math.exp(sum(math.log(max(x,1.001)) for x in xs)/len(xs))
    ema20=ema(xs[-20:],.25);ema50=ema(last50,.12)
    low15=len(xs)>=15 and all(x<2 for x in xs[-15:])
    big20=[x for x in xs[-30:] if x>=20]
    mid=[x for x in xs[-60:] if 5<=x<=9]
    low_share=sum(x<2 for x in xs[-60:])/len(xs[-60:])
    if low15:
        target=min(15,max(2.5,geo*2.5+med50));pattern='15 подряд ниже 2×'
    elif len(big20)>=3:
        divisor=3 if len(big20)>=5 else 4 if len(big20)>=4 else 5
        target=min(12,max(2,math.exp(sum(math.log(x) for x in big20)/len(big20))/divisor));pattern='кластер ≥20×'
    elif len(mid)>=3:
        mid_geo=math.exp(sum(math.log(x) for x in mid)/len(mid));fragile=low_share>.55 or (_premium_stats.pstdev(last50)>avg50*1.4)
        target=min(4.5,max(2,mid_geo*.45)) if fragile else min(7,max(3,mid_geo*.7));pattern='зона 5–9×'
    else:
        blend=.5*ema20+.3*ema50+.2*avg50
        target=min(12,max(1.8,blend*.6+1.6));pattern='EMA / среднее'
        if low_share>.6:target=min(target,3.2)
        elif low_share>.45:target=min(target,5)
    windows=[]
    for threshold in (40,200,500):
        hits=[(ts,x) for ts,x in ordered if x>=threshold]
        if len(hits)<5:continue
        gaps=[hits[i][0]-hits[i-1][0] for i in range(1,len(hits)) if hits[i][0]>hits[i-1][0]]
        if len(gaps)<4:continue
        cycle=median(gaps);mad=median([abs(g-cycle) for g in gaps]);
        if cycle<60000 or cycle>48*3600000:continue
        # Same median/MAD cycle idea as public TypeScript; window is descriptive, not a probability.
        expected=hits[-1][0]+cycle
        if expected<now_ms:expected+=math.ceil((now_ms-expected)/cycle)*cycle
        tolerance=int(max(3*60000,min(12*60000,1.4826*mad)))
        if expected>now_ms+30*60000:continue
        windows.append({'threshold':threshold,'start':int(expected),'end':int(expected+tolerance),
            'cycle_minutes':round(cycle/60000,2),'mad_minutes':round(mad/60000,2),
            'events':len(hits),'method':'median/MAD interval (heuristic)'})
    return {'ok':True,'count':len(xs),'latest_ms':ordered[-1][0], 'ema20':round(ema20,2),
        'ema50':round(ema50,2),'median50':round(med50,2),'mad50':round(mad50,2),
        'geo':round(geo,2),'target_x':round(target,2),'pattern':pattern,
        'cluster20_30':len(big20),'windows':windows}

def ts_full_prediction(rows, now_ms=None, previous=None):
    """Python port of methode-de-calcul-prediction.ts; returns forecast and diagnostics."""
    now=int(now_ms if now_ms is not None else _bb_now()); MIN=60000
    clamp=lambda v,a,b:max(a,min(b,v))
    mean=lambda a:sum(a)/len(a) if a else 0
    median=lambda a:_premium_stats.median(a) if a else 0
    std=lambda a:_premium_stats.pstdev(a) if len(a)>1 else 0
    mad=lambda a:median([abs(v-median(a)) for v in a]) if len(a)>1 else 0
    geo=lambda a:math.exp(mean([math.log(max(v,1.001)) for v in a])) if a else 0
    def ema(a,alpha):
        if not a:return 0
        v=a[-1]
        for x in reversed(a[:-1]):v=alpha*x+(1-alpha)*v
        return v
    def clean_rows():
        found={}
        for r in rows:
            try:
                if r.get('estimated') is True:continue
                x=float(r.get('coefficient',r.get('coef')))
                raw=r.get('round_timestamp',r.get('timestamp'))
                if isinstance(raw,(int,float)):ts=int(raw if raw>1e11 else raw*1000)
                else:ts=int(datetime.fromisoformat(str(raw).replace('Z','+00:00')).timestamp()*1000)
                if math.isfinite(x) and x>=1 and 0<ts<=now+10000:found[str(r.get('id') or ts)]=(ts,x)
            except (ValueError,TypeError,OverflowError):continue
        return sorted(found.values())
    ordered=clean_rows()
    if len(ordered)<20:return {'ok':False,'reason':'Меньше 20 раундов'}
    if now-ordered[-1][0]>180000:return {'ok':False,'reason':'История старше 3 минут'}
    if previous and now<max(previous['estimatedAt']+previous['windowMs'],previous['generatedAt']+MIN):return previous
    desc=list(reversed(ordered));coefs=[x for _,x in desc]
    avgAll=mean(coefs);medAll=median(coefs);geoAll=geo(coefs)
    last20=coefs[:20];last50=coefs[:50];avg50=mean(last50)
    ema20=ema(last20,.25);ema50=ema(last50,.12);sd50=std(last50);mad50=mad(last50)
    def gap(th):
        hits=[t for t,x in ordered if x>=th];gaps=[b-a for a,b in zip(hits,hits[1:]) if b>a]
        return {'count':len(hits),'medGap':median(gaps),'madGap':mad(gaps),'avgGap':mean(gaps),'stdGap':std(gaps),'last':hits[-1] if hits else None}
    golden=gap(10);mega=gap(100)
    def buckets(fn):
        groups={}
        for t,x in ordered:groups.setdefault(fn(t),[]).append(x)
        return {k:{'count':len(a),'goldenCount':sum(x>=10 for x in a),'megaCount':sum(x>=100 for x in a),'avg':geo(a),'max':max(a)} for k,a in groups.items()}
    utc=lambda t:datetime.fromtimestamp(t/1000,_ts_timezone.utc)
    hours=buckets(lambda t:utc(t).hour);minutes=buckets(lambda t:utc(t).minute)
    current=utc(now);hb=hours.get(current.hour);mb=minutes.get((current.minute+2)%60)
    recentBig=[x for x in coefs[:30] if x>=20]
    candidates=[]
    if mega['count']>=5 and mega['last'] and mega['medGap']>0:
        expected=mega['last']+mega['medGap'];drift=expected-now
        tol=clamp(mega['madGap']*1.4826 or mega['medGap']*.35,2*MIN,12*MIN)
        since=now-mega['last']
        if 0<mega['madGap']<mega['medGap']*.5 and (abs(drift)<=tol*.7 or since>=mega['medGap']*.9):
            conf=round(clamp(55+min(10,mega['count'])+clamp(1-abs(drift)/max(tol,1),0,1)*12,55,82))
            candidates.append({'expectedAt':int(expected if drift>0 else now+max(2*MIN,tol*.4)),'windowMs':int(clamp(tol,3*MIN,10*MIN)),'estimatedCoef':100,'confidence':conf,'reason':'Cycle ≥100x'})
    last80=coefs[:80];big20=sum(x>=20 for x in last80);big50=sum(x>=50 for x in last80)
    if big50>=3 and big20>=6:
        candidates.append({'expectedAt':now+3*MIN,'windowMs':6*MIN,'estimatedCoef':120,'confidence':round(clamp(55+big50*5+big20,55,82)),'reason':'Cluster ≥20x/≥50x'})
    if mega['count']>=4 and mega['last'] and len(ordered)>=80:
        span=ordered[-1][0]-ordered[0][0];lam=mega['count']/span if span>0 else 0
        if lam>0:
            overdue=1-math.exp(-lam*max(0,now-mega['last']))
            if overdue>=.75:
                eta=clamp(1/lam,90000,8*MIN)
                candidates.append({'expectedAt':int(now+eta),'windowMs':int(clamp(eta*.8,3*MIN,7*MIN)),'estimatedCoef':100,'confidence':round(clamp(50+overdue*30,50,80)),'reason':'Poisson overdue heuristic','overduePct':round(overdue*100,1)})
    candidates.sort(key=lambda c:c['confidence'],reverse=True)
    bigOpportunity=dict(candidates[0]) if candidates and (len(candidates)>=2 or candidates[0]['confidence']>=75) else None
    if bigOpportunity and len(candidates)>=2:bigOpportunity['confidence']=min(92,bigOpportunity['confidence']+5)
    low15=len(coefs)>=15 and all(x<2 for x in coefs[:15])
    recent60=coefs[:60];mid=[x for x in recent60 if 5<=x<10];smallShare=sum(x<2 for x in recent60)/len(recent60)
    def result(target,reliability,eta,window,pattern,basis):
        reliability=round(reliability)
        confidence='Очень высокая' if reliability>=93 else 'Высокая' if reliability>=82 else 'Средняя' if reliability>=68 else 'Низкая'
        return {'ok':True,'estimatedCoef':round(target,2),'reliability':reliability,'confidence':confidence,'estimatedAt':int(eta),'windowMs':int(window),'pattern':pattern,'basis':basis,'generatedAt':now,'bigOpportunity':bigOpportunity,'diagnostics':{'ema20':round(ema20,2),'ema50':round(ema50,2),'median50':round(median(last50),2),'mad50':round(mad50,2),'goldenGap':golden,'megaGap':mega,'hourBucket':hb,'nextMinuteBucket':mb,'cluster20_30':len(recentBig),'midZone60':len(mid),'smallShare60':round(smallShare,4),'poissonCandidates':len(candidates)}}
    if golden['medGap']>0 and golden['last']:
        expected=golden['last']+golden['medGap'];drift=expected-now
        tol=clamp(golden['madGap']*1.4826 or golden['medGap']*.55,MIN,4*MIN)
        if golden['count']>=8 and 0<golden['madGap']<golden['medGap']*.6 and abs(drift)<=tol*.6:
            divisor=2 if len(recentBig)>=3 else 3 if recentBig else 4
            target=clamp(max(coefs[:80])/divisor,2,20)
            reliability=round(clamp(clamp(60-abs(drift)/tol*15,40,62)+(3 if hb and hb['avg']>geoAll else 0)+clamp(golden['count']/20,0,4),40,68))
            return result(target,reliability,now+max(drift,90000) if drift>0 else now+2*MIN,clamp(golden['medGap']*.25,90000,3*MIN),'Golden Cycle ≥10x',f"Цикл {golden['medGap']/MIN:.1f} мин; MAD {golden['madGap']/MIN:.2f} мин")
    if low15:
        return result(clamp(geoAll*2.5+medAll,2.5,15),round(clamp(70+min(15,(now-desc[14][0])/MIN),65,92)),now+90000,2*MIN,'15 коэффициентов ниже 2x','Геометрическое среднее и медиана')
    if len(recentBig)>=3:
        divisor=3 if len(recentBig)>=5 else 4 if len(recentBig)>=4 else 5
        return result(clamp(geo(recentBig)/divisor,2,12),min(78,60+len(recentBig)*3),now+2*MIN,2.5*MIN,'Кластер ≥20x',f'Геометрическое среднее / {divisor}')
    if len(mid)>=3:
        cautious=smallShare>.55 or sd50>avg50*1.4
        target=clamp(geo(mid)*(.45 if cautious else .7),2 if cautious else 3,4.5 if cautious else 7)
        return result(target,clamp(64+len(mid)*4+(-6 if cautious else 6),58,90),now+2*MIN,2.5*MIN,'Зона 5–9x','Осторожный режим' if cautious else 'Нормальный режим')
    hourFactor=hb['avg']/max(geoAll,.1) if hb and hb['count']>=5 else 1
    minuteFactor=mb['avg']/max(geoAll,.1) if mb and mb['count']>=5 else 1
    blended=.5*ema20+.3*ema50+.2*avg50
    target=clamp(blended*hourFactor*.6+(mb['max'] if mb else 0)*.1+1.6,1.8,12)
    fragile=smallShare>.6 or sd50>avg50*1.6
    if fragile:target=min(target,3.2)
    elif smallShare>.45:target=min(target,5)
    reliability=round(clamp(52+clamp(len(coefs)/25,0,28)+clamp(abs(hourFactor-1)*42,0,22)+clamp(abs(minuteFactor-1)*32,0,16)+(5 if 0<mad50<avg50*.6 else 0)+(-8 if fragile else 0),50,92))
    eta=now+2*MIN+((60-current.second)*1000)%45000
    return result(target,reliability,eta,2.5*MIN,'EMA / UTC hour-minute buckets','Комбинированный fallback')

def ai_history_rows(rows):
    clean = {}
    for r in rows:
        try:
            if r.get('estimated') is not False: continue
            coef = float(r['coefficient'])
            dt = datetime.fromisoformat(str(r['round_timestamp']).replace('Z','+00:00'))
            if not math.isfinite(coef) or coef < 1 or dt.tzinfo is None: continue
            key = str(r.get('id') or r.get('feed_order') or dt.isoformat())
            clean[key] = (dt.timestamp(), coef)
        except (ValueError, TypeError, KeyError, OverflowError): continue
    return sorted(clean.values())

def ai_analyze(rows, now=None):
    points = ai_history_rows(rows)
    now = now or time.time()
    points = [(t,x) for t,x in points if t <= now + 5]
    if len(points) < AI_MIN_ROWS:
        return {'ok':False, 'reason':f'Недостаточно истории: {len(points)}/{AI_MIN_ROWS} раундов'}
    if now - points[-1][0] > 180:
        return {'ok':False,'reason':'Нет свежих раундов (более 180 секунд)'}
    recent = points[-200:]
    values = [x for _,x in recent]
    def ema(v,n):
        a=2/(n+1); out=v[0]
        for x in v[1:]:out=a*x+(1-a)*out
        return out
    output=[]
    kyiv=ZoneInfo('Europe/Kyiv')
    for threshold in AI_THRESHOLDS:
        hits=[t for t,x in points if x>=threshold]
        if len(hits)<5:continue
        gaps=[b-a for a,b in zip(hits,hits[1:]) if b>a]
        if not gaps:continue
        median=_ai_stats.median(gaps)
        mad=_ai_stats.median([abs(g-median) for g in gaps])
        elapsed=max(0,now-hits[-1])
        # TS median-gap cycle estimate, clamped to the future
        wait=max(15, median-elapsed)
        candidate=now+wait
        # Shrink minute-of-hour hot spots toward global event rate.
        total_minutes=_ai_Counter(datetime.fromtimestamp(t,kyiv).minute for t,x in points)
        hit_minutes=_ai_Counter(datetime.fromtimestamp(t,kyiv).minute for t in hits)
        hot=sorted(range(60),key=lambda m:(hit_minutes[m]+1)/(total_minutes[m]+60),reverse=True)[:3]
        # Rate for next 3 minutes; descriptive Poisson approximation, not calibrated probability
        span=max(1,points[-1][0]-points[0][0]); rate=len(hits)/span
        base=1-math.exp(-rate*180)
        output.append({'target':threshold,'count':len(hits),'median_gap_s':round(median),
                       'mad_s':round(mad),'elapsed_s':round(elapsed),'candidate':candidate,
                       'base_rate_3m':base,'hot_minutes':hot})
    return {'ok':bool(output),'n':len(points),'last':points[-1][0],
            'ema20':ema(values[-20:],20),'ema50':ema(values[-50:],50),
            'median50':_ai_stats.median(values[-50:]),'targets':output,
            'reason':'Нет достаточных событий ≥10x' if not output else ''}

def ai_message(report):
    if not report.get('ok'):
        return '🧠 <b>GOD PREDITOR AI</b>\n⚠️ '+escape(report.get('reason','Нет данных'))
    fmt=lambda ts:datetime.fromtimestamp(ts,ZoneInfo('Europe/Kyiv')).strftime('%H:%M:%S')
    lines=['🧠 <b>GOD PREDITOR • AI ANALYSIS</b>',
           '🗄 Supabase LIVE • подтверждённых раундов: '+str(report['n']),
           '🕒 Последний: '+fmt(report['last']),
           '📊 EMA20: %.2fx | EMA50: %.2fx | MED50: %.2fx'%(report['ema20'],report['ema50'],report['median50']),
           '━━━━━━━━━━━━━━━━━━━━']
    for t in report['targets']:
        lines.append('🎯 <b>≥%sx</b> | событий: %s'%(t['target'],t['count']))
        lines.append('⏱ Цикл: %ss • прошло: %ss • ориентир: %s'%(t['median_gap_s'],t['elapsed_s'],fmt(t['candidate'])))
        lines.append('🕰 Частые минуты в истории: '+', '.join('%02d'%x for x in t['hot_minutes']))
        lines.append('📈 Частота за 3 мин (базовая): %.1f%%'%(t['base_rate_3m']*100))
    lines.append('━━━━━━━━━━━━━━━━━━━━')
    lines.append('⚠️ Временные совпадения и частоты не гарантируют будущий результат. AI-сигнал — исследовательская оценка, не подтверждённый выигрыш.')
    return '\n'.join(lines)[:3900]

def three_archive_analysis(history, target, now):
    from collections import Counter
    from statistics import median, pstdev
    pts = [(t,x) for t,x in ai_history_rows(history) if t <= now + 30]
    if len(pts) < 20 or not pts or now-pts[-1][0] > 180:
        return None
    coefs=[x for _,x in pts]
    hits=[t for t,x in pts if x >= target]
    if len(hits) < 5:return None
    gaps=[b-a for a,b in zip(hits,hits[1:]) if b>a]
    if not gaps:return None
    med=median(gaps);mad=median([abs(g-med) for g in gaps]);elapsed=max(0,now-hits[-1])
    recent=coefs[-80:]
    clusters={'20':sum(x>=20 for x in recent),'50':sum(x>=50 for x in recent),
              'mid':sum(5<=x<10 for x in coefs[-60:]),'low15':all(x<2 for x in coefs[-15:])}
    span=max(1,pts[-1][0]-pts[0][0]);rate=len(hits)/span
    # From TS: median inter-event gap and MAD-based tolerance, not a causal cycle.
    tol=min(720,max(120,1.4826*mad if mad else med*.35))
    cycle_eta=max(15,med-elapsed)
    # Empirical minute/second counts with exposure denominator, not raw counts.
    tz=ZoneInfo('Europe/Kyiv')
    exposures=Counter(datetime.fromtimestamp(t,tz).minute for t,_ in pts)
    events=Counter(datetime.fromtimestamp(t,tz).minute for t in hits)
    minute_rates={m:(events[m]+1)/(exposures[m]+60) for m in range(60)}
    top=sorted(minute_rates,key=lambda m:minute_rates[m],reverse=True)[:3]
    # Conservative candidate: choose earlier of cycle estimate and upcoming
    # high-exposure minute, only if there are enough observations in that bin.
    candidates=[]
    for delta in range(1,16):
        ts=now+delta*60
        m=datetime.fromtimestamp(ts,tz).minute
        if m in top and exposures[m]>=10:candidates.append(ts)
    candidate=now+cycle_eta
    if candidates and abs(candidates[0]-candidate)<=tol:candidate=candidates[0]
    # Poisson is a descriptive baseline; do not confuse P(event) with accuracy.
    horizon=180
    baseline=100*(-math.expm1(-rate*horizon))
    # TS 100x opportunity conditions: cluster and overdue diagnostics.
    consensus=int(clusters['50']>=3 and clusters['20']>=6)+int(mad>0 and mad<med*.5)+int(1-math.exp(-rate*elapsed)>=.75)
    # Never label heuristic reliability as measured forecast confidence.
    return {'candidate':candidate,'end':candidate+horizon,'baseline':baseline,
            'median_gap':med,'mad_gap':mad,'elapsed':elapsed,'count':len(hits),
            'clusters':clusters,'top_minutes':top,'consensus':consensus,
            'class':('mega' if target>=100 else 'high' if target>=10 else 'mid' if target>=2 else 'low'),
            'sample':len(pts)}

def ts_generate_prediction_exact(rounds, previous=None, now=None):
    import statistics as st
    from datetime import datetime as dt, timezone
    if now is None: now=int(__import__('time').time()*1000)
    R=sorted([{'timestamp':int(t*1000),'coefficient':float(x)} for t,x in ai_history_rows(rounds) if t*1000<=now],key=lambda r:r['timestamp'])
    if len(R)<20 or now-R[-1]['timestamp']>180000:return None
    if previous and now<max(previous['estimatedAt']+previous['windowMs'],previous['generatedAt']+60000):return previous
    def mean(v):return sum(v)/len(v) if v else 0
    def med(v):return st.median(v) if v else 0
    def sd(v):return (mean([(x-mean(v))**2 for x in v]))**.5 if len(v)>1 else 0
    def mad(v):return med([abs(x-med(v)) for x in v]) if len(v)>1 else 0
    def clamp(x,a,b):return max(a,min(b,x))
    def geo(v):return math.exp(mean([math.log(max(x,1.001)) for x in v])) if v else 0
    def ema(v,a):
        if not v:return 0
        result=v[-1]
        for x in v[-2::-1]:result=a*x+(1-a)*result
        return result
    def gaps(th):
        H=[r['timestamp'] for r in R if r['coefficient']>=th]
        G=[b-a for a,b in zip(H,H[1:])]
        return {'avgGap':mean(G),'medGap':med(G),'stdGap':sd(G),'madGap':mad(G),'last':H[-1] if H else None,'count':len(H)}
    def buckets(key):
        out={}
        for r in R:out.setdefault(key(r['timestamp']),[]).append(r['coefficient'])
        return {k:{'count':len(v),'avg':geo(v),'max':max(v)} for k,v in out.items()}
    C=[r['coefficient'] for r in R[::-1]]
    avg50=mean(C[:50]);ema20=ema(C[:20],.25);ema50=ema(C[:50],.12)
    sd50=sd(C[:50]);mad50=mad(C[:50]);geoAll=geo(C);medAll=med(C)
    gold=gaps(10); sinceGolden=now-gold['last'] if gold['last'] else float('inf')
    hour=lambda ms:dt.fromtimestamp(ms/1000,timezone.utc).hour
    minute=lambda ms:dt.fromtimestamp(ms/1000,timezone.utc).minute
    HB=buckets(hour);MB=buckets(minute);h=hour(now);m=minute(now)
    hb=HB.get(h);mb=MB.get((m+2)%60)
    lowStreak=all(x<2 for x in C[:15]);recentBig=[x for x in C[:30] if x>=20]
    mega=gaps(100); candidates=[]
    if mega['count']>=5 and mega['last'] and mega['medGap']>0:
        expected=mega['last']+mega['medGap'];drift=expected-now
        tol=clamp(mega['madGap']*1.4826 or mega['medGap']*.35,120000,720000)
        since=now-mega['last'];stable=mega['madGap']>0 and mega['madGap']<mega['medGap']*.5
        if stable and (abs(drift)<=tol*.7 or since>=mega['medGap']*.9):
            score=clamp(1-abs(drift)/max(tol,1),0,1)
            conf=clamp(55+min(10,mega['count'])+score*12,55,82)
            candidates.append({'expectedAt':expected if drift>0 else now+max(120000,tol*.4),'windowMs':clamp(tol,180000,600000),'estimatedCoef':100,'confidence':round(conf),'reason':'Cycle 100x'})
    big20=sum(x>=20 for x in C[:80]);big50=sum(x>=50 for x in C[:80])
    if big50>=3 and big20>=6:candidates.append({'expectedAt':now+180000,'windowMs':360000,'estimatedCoef':120,'confidence':round(clamp(55+big50*5+big20,55,82)),'reason':'Cluster'})
    if mega['count']>=4 and mega['last'] and len(R)>=80:
        span=R[-1]['timestamp']-R[0]['timestamp'];lam=mega['count']/span if span>0 else 0
        if lam>0:
            overdue=1-math.exp(-lam*(now-mega['last']))
            if overdue>=.75:
                eta=clamp(1/lam,90000,480000)
                candidates.append({'expectedAt':now+eta,'windowMs':clamp(eta*.8,180000,420000),'estimatedCoef':100,'confidence':round(clamp(50+overdue*30,50,80)),'reason':'Poisson hazard'})
    candidates.sort(key=lambda c:c['confidence'],reverse=True)
    big=None
    if candidates and (len(candidates)>=2 or candidates[0]['confidence']>=75):
        big=dict(candidates[0]);big['confidence']=min(92,big['confidence']+(5 if len(candidates)>=2 else 0))
    def result(x,rel,eta,window,pattern,basis):
        return {'estimatedCoef':round(x,2),'confidence':'Élevé' if rel>=82 else 'Moyen' if rel>=66 else 'Faible','reliability':round(rel),'estimatedAt':round(eta),'windowMs':round(window),'pattern':pattern,'basis':basis,'generatedAt':now,'bigOpportunity':big}
    if gold['medGap']>0 and gold['last']:
        expected=gold['last']+gold['medGap'];drift=expected-now
        tol=clamp(gold['madGap']*1.4826 or gold['medGap']*.55,60000,240000)
        stable=gold['count']>=8 and gold['madGap']>0 and gold['madGap']<gold['medGap']*.6
        if stable and abs(drift)<=tol*.6:
            divisor=2 if len(recentBig)>=3 else 3 if recentBig else 4
            target=clamp(max(C[:80])/divisor,2,20)
            score=clamp(60-abs(drift)/tol*15,40,62)
            rel=round(clamp(score+(3 if hb and hb['avg']>geoAll else 0)+clamp(gold['count']/20,0,4),40,68))
            r=result(target,rel,now+max(drift,90000) if drift>0 else now+120000,clamp(gold['medGap']*.25,90000,180000),'Cycle des cotes d’or détecté','Golden cycle')
            r['confidence']='Moyen' if rel>=66 else 'Faible';return r
    if lowStreak:
        target=clamp(geoAll*2.5+medAll,2.5,15)
        rel=round(clamp(70+min(15,(now-R[-15]['timestamp'])/60000),65,92))
        r=result(target,rel,now+90000,120000,'Série basse — rebond statistique','15 tours <2x')
        r['confidence']='Élevé' if rel>=82 else 'Moyen';return r
    if len(recentBig)>=3:
        div=3 if len(recentBig)>=5 else 4 if len(recentBig)>=4 else 5
        rel=min(78,60+len(recentBig)*3)
        r=result(clamp(geo(recentBig)/div,2,12),rel,now+120000,150000,'Cluster ≥20x','Geometric mean')
        r['confidence']='Élevé' if rel>=72 else 'Moyen';return r
    recent60=C[:60];mid=[x for x in recent60 if 5<=x<10]
    share=sum(x<2 for x in recent60)/len(recent60)
    if len(mid)>=3:
        cautious=share>.55 or sd50>avg50*1.4
        target=clamp(geo(mid)*(.45 if cautious else .7),2 if cautious else 3,4.5 if cautious else 7)
        rel=round(clamp(64+len(mid)*4+(-6 if cautious else 6),58,90))
        return result(target,rel,now+120000,150000,'Phase mixte' if cautious else 'Phase favorable','Zone 5x-9x')
    hourFactor=hb['avg']/max(geoAll,.1) if hb and hb['count']>=5 else 1
    minuteFactor=mb['avg']/max(geoAll,.1) if mb and mb['count']>=5 else 1
    blended=ema20*.5+ema50*.3+avg50*.2
    target=clamp(blended*hourFactor*.6+(mb['max'] if mb else 0)*.1+1.6,1.8,12)
    fragile=share>.6 or sd50>avg50*1.6
    if fragile:target=min(target,3.2)
    elif share>.45:target=min(target,5)
    rel=round(clamp(52+clamp(len(R)/25,0,28)+clamp(abs(hourFactor-1)*42,0,22)+clamp(abs(minuteFactor-1)*32,0,16)+(5 if mad50>0 and mad50<avg50*.6 else 0)+(-8 if fragile else 0),50,92))
    sec=dt.fromtimestamp(now/1000,timezone.utc).second
    eta=120000+((60-sec)*1000)%45000
    return result(target,rel,now+eta,150000,'Analyse multi-signaux','EMA / buckets / MAD')


# Optional external commentary; disabled by default. Never changes mathematical targets/timing.
def ai_gemini_commentary(report, config=None):
    if not (config or {}).get('ENABLE_GEMINI', False):
        return ''
    'Optional Gemini commentary on aggregate statistics; never invents target/time/probability.'
    key = str((config or {}).get('GEMINI_API_KEY') or os.getenv('GEMINI_API_KEY', '')).strip()
    if not key or not report.get('ok'):
        return ''
    try:
        import requests
    except ImportError:
        return '\n🤖 Gemini: библиотека requests недоступна; локальный расчёт сохранён.'
    model = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash')
    summary = {'n': report['n'], 'ema20': round(report['ema20'], 3), 'median50': round(report['median50'], 3), 'targets': report['targets']}
    prompt = 'Ты аналитик статистики Lucky Jet. На русском, до 80 слов. Прокомментируй только эти агрегированные данные, не выдумывай прогнозы, не заявляй о закономерности без out-of-sample теста и не обещай выигрыша. ' + json.dumps(summary, ensure_ascii=False)
    try:
        response = requests.post('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', headers={'x-goog-api-key': key, 'Content-Type': 'application/json'}, json={'contents': [{'parts': [{'text': prompt}]}], 'generationConfig': {'temperature': 0.1, 'maxOutputTokens': 250}}, timeout=(5, 15))
        response.raise_for_status()
        parts = response.json()['candidates'][0]['content']['parts']
        answer = ' '.join((p.get('text', '') for p in parts)).strip()
        return '\n\n🤖 <b>Gemini:</b> ' + escape(answer[:450]) if answer else ''
    except (requests.RequestException, KeyError, IndexError, ValueError, TypeError):
        return '\n🤖 Gemini: временно недоступен; статистический расчёт сохранён.'
