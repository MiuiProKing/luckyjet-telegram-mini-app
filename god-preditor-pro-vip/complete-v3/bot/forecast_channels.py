"""Canonical source-compatible channel mathematics. Pure, deterministic and offline.

Input observations must be completed exact records; all public estimates are
model estimates and never represented as calibrated win rates.
"""
from __future__ import annotations
import copy
import math

from engine import normalize_rounds, parse_time, analyze_report, analyze_all
from timed_engine import (
    timed_analyze, timed_choose, timed_remote_overrides, timed_largest,
    timed_per_hour, timed_chance, TIMED_DURATIONS,
)

VERSION = 'god-complete-v3-20261121'
MINUTE = 60000
ROUND_LEVELS = (5, 10, 100)
WAIT_MINUTES = (5, 10, 30, 60, 180, 1440)


def minimum_rounds(pct, minimum=69):
    """Exact public analyse-approfondie O(): ceil(log(1-q)/log(1-p)).

    JSON-safe None replaces mathematical infinity at a zero frequency.
    """
    if isinstance(pct, bool) or not isinstance(pct, (int, float)) or not math.isfinite(pct):
        return None
    if pct <= 0:
        return None
    if pct >= 100:
        return 1
    if not 0 < minimum < 100:
        return None
    denominator = math.log(1-pct/100)
    return math.ceil(math.log(1-minimum/100) / denominator) if denominator else None


def _finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def full_history_pct(analytics):
    """The source explicitly assumes 0.095% for 1000x in deep analysis."""
    g = (analytics or {}).get('global') or {}
    out = {}
    for target in (2, 5, 10, 100):
        value = g.get('p'+str(target))
        out[target] = value if _finite(value) and 0 <= value <= 100 else 0
    out[1000] = .095
    return out


def full_history_per_hour(analytics):
    a = analytics or {}
    first, last = parse_time(a.get('first')), parse_time(a.get('last'))
    total = a.get('total')
    if not _finite(total) or first is None or last is None or last <= first:
        return 0
    return total / ((last-first)/3600000)


def deep_wait_table(analytics):
    pct = full_history_pct(analytics)
    a = analytics or {}
    total = a.get('total') or 0
    huge_count = (a.get('global') or {}).get('n10000') or 0
    pct[10000] = huge_count/total*100 if _finite(total) and total > 0 and _finite(huge_count) else 0
    per_hour = full_history_per_hour(a)
    return [dict(target=target, scoreKind='independence_model_probability',
                 assumption='fixed_original_0.095_percent' if target == 1000 else None,
                 perRoundPct=pct[target],
                 chances=[dict(minutes=m, probabilityPct=timed_chance(pct[target],m,per_hour))
                          for m in WAIT_MINUTES])
            for target in (2, 5, 10, 100, 1000, 10000)]

SCHEDULER_VERSION = 'god-complete-canonical-v3-20261121'
DURATIONS = [3, 6, 7, 10, 30, 61]
ROUND_TARGETS = [5, 10, 100]
VIP_TARGETS = [10, 20, 40, 50, 100, 200, 500]


def _number(v):
    if v is None or isinstance(v, bool): return None
    try:
        n = float(v.strip() or '0') if isinstance(v,str) else float(v)
        return n if math.isfinite(n) else None
    except (TypeError, ValueError, OverflowError): return None


def _valid(v): return _number(v) is not None

def _stamp(v):
    return v if isinstance(v,(int,float)) and not isinstance(v,bool) else parse_time(v)

def _safe_int(v): return _valid(v) and float(v).is_integer() and abs(v) <= 9007199254740991

def _js_str(v):
    if v is None:return 'null'
    if v is True:return 'true'
    if v is False:return 'false'
    if isinstance(v,(int,float)) and math.isfinite(v) and int(v)==v:return str(int(v))
    return str(v)

def _round(v):return math.floor(float(v)+.5)

def _median(values):
    if not values:return 0
    s=sorted(values);m=len(s)//2
    return s[m] if len(s)%2 else (s[m-1]+s[m])/2


def stable_signal_id(channel,start,basis,version=SCHEDULER_VERSION):
    raw='|'.join([version,channel,_js_str(_round(start)),_js_str(basis)]).encode('utf-8')
    def hashed(seed):
        h=seed & 0xffffffff
        for value in raw:h=((h ^ value)*16777619)&0xffffffff
        return format(h,'08x')
    return 'g3_'+hashed(2166136261)+hashed(3335557771)


def minimum_rounds(pct,minimum=69):
    p,q=_number(pct),_number(minimum)
    if p is None or p<=0 or p>100 or q is None or q<=0 or q>=100:return None
    if p==100:return 1
    denominator=math.log(1-p/100)
    if denominator==0:return None
    n=math.ceil(math.log(1-q/100)/denominator)
    return n if _safe_int(n) and n>0 else None


def full_history_frequency(analytics):
    a=analytics or {};g=a.get('global') or {};total=_number(a.get('total'));first=_stamp(a.get('first'));last=_stamp(a.get('last'))
    if not _safe_int(total) or total<1 or not _valid(first) or first<=0 or not _valid(last) or last<=first:return None
    pct={}
    for target in (2,5,10,100):
        p=_number(g.get('p'+str(target)))
        if p is None or p<0 or p>100:return None
        pct[target]=p
    pct[1000]=.095;pct[10000]=float(g['n10000'])/total*100 if _valid(g.get('n10000')) else 0
    return dict(pct=pct,perHour=timed_per_hour(total,first,last),total=total,first=first,last=last,source='own_full_history',assumptions={1000:dict(pct=.095,kind='fixed_theoretical_baseline',measured=False)},calibrated=False)


def waiting_chance_table(analytics):
    full=full_history_frequency(analytics)
    if not full:return []
    return [dict(target=t,pct=full['pct'][t],probabilitySource='fixed_theoretical_baseline' if t==1000 else 'own_full_history',measured=t!=1000,cells=[dict(minutes=m,chance=timed_chance(full['pct'][t],m,full['perHour'])) for m in WAIT_MINUTES]) for t in (2,5,10,100,1000,10000)]


def _unpack(signal):
    import json
    meta=signal.get('metadata') or {}
    if isinstance(meta,str):
        try:meta=json.loads(meta)
        except (ValueError,TypeError):meta={}
    x={**meta,**signal}
    for key,alias in (('start','start_at'),('end','end_at'),('issuedAt','issued_at'),('resultAt','result_at')):
        value=x.get(key) if x.get(key) is not None else x.get(alias)
        x[key]=None if value is None else _stamp(value)
    x['target']=_number(x.get('target'));x['actual']=_number(x.get('actual'));x['windowKind']=x.get('windowKind') or 'time';x['status']=x.get('status') or 'pending'
    return x


def _temporal_coverage(rows,start,end,need_before=True,need_after=True,avg_round_seconds=None):
    data=sorted(rows,key=lambda r:r['timestamp']);inside=[r for r in data if start<r['timestamp']<=end]
    before=next((r for r in reversed(data)if r['timestamp']<=start),None);after=next((r for r in data if r['timestamp']>end),None)
    if (need_before and not before) or (need_after and not after) or not inside:return dict(ok=False,reason='Не подтверждены границы истории')
    gaps=[b['timestamp']-a['timestamp']for a,b in zip(data,data[1:])if b['timestamp']>a['timestamp']]
    supplied=_number(avg_round_seconds);pace=supplied if supplied is not None and supplied>0 else _median(gaps)/1000 if len(gaps)>=10 else 0
    maximum=min(180000,max(60000,pace*3000));relevant=([before]if before else [])+inside+([after]if need_after and after else [])
    if any(b['timestamp']-a['timestamp']>maximum for a,b in zip(relevant,relevant[1:])):return dict(ok=False,reason='В истории есть большой разрыв',maxGap=maximum)
    return dict(ok=True,reason='Покрытие по временным границам и интервалам',maxGap=maximum)


def evaluate_canonical_signal(raw,input_rows,now):
    s=_unpack(raw);rows=normalize_rounds(input_rows,now);open_start=s.get('boundaryPolicy')!='closed'
    def bad(reason):return dict(status='unknown',actual=None,resultAt=None,roundId=None,reason=reason)
    if not _valid(s.get('start')) or not _valid(s.get('target')):return bad('Повреждены неизменяемые поля сигнала')
    evidence=s.get('evidence')
    if s['windowKind']=='rounds':
        n=_number(s.get('roundsRequired',s.get('plannedRounds',s.get('rounds'))))
        if not _safe_int(n) or n<1:return bad('Нет корректного числа раундов')
        n=int(n)
        if evidence and evidence.get('status')in ('pending','hit','miss','unknown'):
            count=_number(evidence.get('count',0));actual=_number(evidence.get('actual'));at=_stamp(evidence['resultAt'])if evidence.get('resultAt')is not None else None
            invalid_count=count is None or not _safe_int(count) or count<0 or count>n
            invalid_at=at is not None and (not _valid(at) or at<=s['start'] or at>now)
            invalid_hit=evidence['status']=='hit' and (actual is None or actual<s['target'] or at is None or count is None or count<1)
            invalid_miss=evidence['status']=='miss' and (count is None or count<n or actual is None or actual>=s['target'] or at is None)
            invalid=invalid_count or invalid_at or invalid_hit or invalid_miss
            return dict(status='unknown'if invalid else evidence['status'],actual=actual,resultAt=None if invalid_at else at,roundId=evidence.get('roundId'),reason='Некорректное серверное подтверждение количества/границ'if invalid else evidence.get('coverageReason',evidence.get('reason','Проверено по серверной истории')),count=0 if invalid_count else count,roundsRemaining=max(0,n-(0 if invalid_count else count)),coverageBasis='received_exact_rounds',providerCompletenessVerified=False)
        relevant=[r for r in reversed(rows)if r['timestamp']>s['start']][:n];first_hit=next((r for r in relevant if r['coefficient']>=s['target']),None);last=relevant[-1]if relevant else None
        result=dict(actual=max((r['coefficient']for r in relevant),default=None),resultAt=first_hit['timestamp']if first_hit else last['timestamp']if last else None,roundId=first_hit['id']if first_hit else last['id']if last else None,count=len(relevant),roundsRemaining=max(0,n-len(relevant)),coverageBasis='received_exact_rounds',providerCompletenessVerified=False)
        if not first_hit and len(relevant)<n:return dict(result,status='pending',reason='Ожидаются следующие полученные завершённые раунды')
        if first_hit:return dict(result,status='hit',reason='Цель достигнута в первых N полученных завершённых раундах')
        cov=_temporal_coverage(rows,s['start'],last['timestamp'],need_after=False,avg_round_seconds=s.get('avgRoundSeconds'))
        if not cov['ok']:return dict(result,status='unknown',reason=cov['reason'])
        return dict(result,status='miss',reason='Первые N полученных завершённых раундов проверены')
    if not _valid(s.get('end')) or s['end']<=s['start']:return bad('Нет корректного конца окна')
    if now<=s['end']:return dict(status='pending',actual=None,resultAt=None,roundId=None,reason='Окно ещё не закрыто')
    if evidence and evidence.get('status')in ('hit','miss','unknown'):
        actual=_number(evidence.get('actual'));at=_stamp(evidence['resultAt'])if evidence.get('resultAt')is not None else None
        invalid_at=at is not None and (not _valid(at)or at>now or at>s['end']or(at<=s['start']if open_start else at<s['start']))
        invalid_hit=evidence['status']=='hit' and(actual is None or actual<s['target']or at is None)
        invalid_miss=evidence['status']=='miss' and(actual is None or actual>=s['target']or at is None)
        invalid=invalid_at or invalid_hit or invalid_miss
        return dict(status='unknown'if invalid else evidence['status'],actual=actual,resultAt=None if invalid_at else at,roundId=evidence.get('roundId'),reason='Некорректное серверное подтверждение границ/цели'if invalid else evidence.get('coverageReason',evidence.get('reason','Проверено по серверной истории')),coverageBasis='temporal_boundaries_and_gaps',providerCompletenessVerified=False)
    inside=[r for r in rows if(r['timestamp']>s['start']if open_start else r['timestamp']>=s['start'])and r['timestamp']<=s['end']]
    best=max(inside,key=lambda r:r['coefficient'],default=None)
    result=dict(actual=best['coefficient']if best else None,resultAt=best['timestamp']if best else None,roundId=best['id']if best else None,coverageBasis='temporal_boundaries_and_gaps',providerCompletenessVerified=False)
    if best and best['coefficient']>=s['target']:return dict(result,status='hit',reason='Цель достигнута внутри закрытого окна')
    cov=_temporal_coverage(rows,s['start']if open_start else s['start']-1,s['end'],avg_round_seconds=s.get('avgRoundSeconds'))
    return dict(result,status='miss'if cov['ok']else'unknown',reason='Цель не достигнута при подтверждённом временном покрытии'if cov['ok']else cov['reason'])


def full_threshold(analytics,rows,target,now,fallback):
    from engine import gamma_quantile,beta_quantile
    collection=(analytics or {}).get('thresholdStats',(analytics or {}).get('thresholds'))
    stats=next((x for x in collection if _number(x.get('target',x.get('threshold')))==target),None)if isinstance(collection,list)else collection.get(str(target),collection.get(target))if isinstance(collection,dict)else None
    if not stats:return dict(fallback,historySource='latest_loaded_history',fullHistoryAvailable=False)
    full=full_history_frequency(analytics);n=_number(analytics.get('total'));cutoff=_stamp(analytics.get('last'));hit=next((r for r in rows if r['coefficient']>=target),None)
    count=_number(stats.get('count',stats.get('events',stats.get('hits',0))));med=_number(stats.get('medianGapMs',stats.get('medGap',stats.get('median_gap_ms'))));mad=_number(stats.get('madGapMs',stats.get('madGap',stats.get('mad_gap_ms'))))or 0
    last_full=_stamp(stats.get('lastHitAt',stats.get('last')));last=max(last_full if _valid(last_full)else 0,hit['timestamp']if hit else 0)
    if not full or not _safe_int(count)or count<0 or count>n:return dict(fallback,historySource='latest_loaded_history',fullHistoryAvailable=False,fullHistoryError='Некорректный агрегат полной истории')
    out=dict(fallback,modelVersion='god-full-history-threshold-v3-20261121',sampleSize=n,events=count,lastHitAt=last or None,medianGapMs=med or 0,madGapMs=mad,estimatedAt=None,status='waiting',historySource='own_full_history',fullHistoryAvailable=True,dataCutoff=rows[0]['timestamp']if rows else None,statisticsCutoff=cutoff,probabilityAsOf=cutoff,reason='')
    boundary=_number(analytics.get('firstCoefficient'));shape=max(0,count-int(boundary is not None and boundary>=target))+.5;span=(full['last']-full['first'])/MINUTE;w=3;a=count+.5;b=max(.5,n-count+.5)
    out.update(probability=-math.expm1(-shape*math.log1p(w/span)),interval95=[-math.expm1(-gamma_quantile(q,shape)/span*w)for q in (.025,.975)],perRoundProbability=a/(a+b),perRoundInterval95=[beta_quantile(.025,a,b),beta_quantile(.975,a,b)])
    out['confidence']=out['probability']*100
    if count<5 or not last or not med or med<=0:out['reason']=f'Недостаточно событий ≥{target}× для оценки интервала';return out
    expected=last+med;out['historicalExpectedAt']=expected
    if expected<=now:out['status']='overdue';out['reason']='Медианная историческая отметка прошла; новая точная дата не доказана';return out
    if expected-now<40000:out['reason']='Недостаточно времени для опережающего уведомления';return out
    out.update(status='candidate',estimatedAt=expected,start=expected,end=expected+180000,windowMs=180000,basisEvent=f'{target}:{_js_str(last)}',reason=f'Оценка по {_js_str(count)} событиям ≥{target}× всей доступной истории; медианный интервал {med/MINUTE:.1f} мин')
    return out


def _new_signal(fields,now,rows):
    start=_round(fields['start']);basis=_js_str(fields.get('basisId',fields.get('basisEvent',rows[0]['id']if rows else start)));kind=fields.get('windowKind','time')
    gaps=[a['timestamp']-b['timestamp']for a,b in zip(rows,rows[1:])if 0<a['timestamp']-b['timestamp']<=180000]
    supplied=_number(fields.get('avgRoundSeconds'));pace=supplied if supplied is not None and supplied>0 else _median(gaps)/1000 if len(gaps)>=10 else None
    return dict(fields,id=stable_signal_id(fields['channel'],start,basis),start=start,end=None if kind=='rounds'else _round(fields['end']),issuedAt=now,basisId=basis,modelVersion=fields.get('modelVersion',SCHEDULER_VERSION),schedulerVersion=SCHEDULER_VERSION,avgRoundSeconds=pace,windowKind=kind,status='pending',calibrated=False,sourceCutoff=rows[0]['timestamp']if rows else None,sourceSampleSize=len(rows),boundaryPolicy=fields.get('boundaryPolicy','open_start'),providerCompletenessVerified=False)


def plan_snapshot(snapshot=None,**kwargs):
    import time
    value=dict(snapshot or {});value.update(kwargs)
    now=value.get('now',time.time()*1000);rounds=value.get('rounds')or[];analytics=value.get('analytics');signals=value.get('signals')or[];state=value.get('state')or{}
    invalid_analytics=bool(analytics and ((_valid(_stamp(analytics.get('last')))and _stamp(analytics.get('last'))>now)or(_valid(_stamp(analytics.get('first')))and _stamp(analytics.get('first'))>now)))
    if invalid_analytics:analytics=None
    now=_round(now);rows=normalize_rounds(rounds,now);existing=[_unpack(s)for s in signals];next_state=copy.deepcopy(state);created=[];outcomes=[];effective={s['id']:s for s in existing}
    next_state['version']=SCHEDULER_VERSION;next_state.setdefault('lastBasis',{});next_state['premium']=dict(lastBasisId=None,cooldownUntil=0,ingest=None,**{})| (next_state.get('premium')or{})
    if next_state['premium'].get('ingest')and now>=next_state['premium']['ingest']['readyAt']:next_state['premium']['ingest']=None
    progress={}
    for s in existing:
        if s['status']not in ('pending','unknown'):continue
        result=evaluate_canonical_signal(s,rows,now)
        if s['windowKind']=='rounds':
            remaining=result.get('roundsRemaining',s.get('roundsRequired'))
            progress[s['id']]=dict(roundsObserved=result.get('count',0),roundsRemaining=remaining,remainingRounds=remaining)
        if result['status']=='pending':continue
        if result['status']!=s['status']or result.get('actual')!=s.get('actual')or result.get('resultAt')!=s.get('resultAt'):
            outcome=dict(id=s['id'],**result,checkedAt=now);outcomes.append(outcome);effective[s['id']]=dict(s,**outcome)
            if s.get('channel')=='premium_live':
                if s['status']=='pending':
                    next_state['premium']['cooldownUntil']=now+40000;next_state['premium']['lastResult']=dict(s,**outcome)
                elif (next_state['premium'].get('lastResult')or{}).get('id')==s['id']:
                    next_state['premium']['lastResult']=dict(s,**outcome)
    def pending(channel):return any(s.get('channel')==channel and s['status']=='pending'for s in [*effective.values(),*created])
    def last(channel):
        all_signals=[s for s in [*effective.values(),*created]if s.get('channel')==channel]
        return max(all_signals,key=lambda s:s.get('issuedAt')or 0,default={})
    def add(fields):
        if pending(fields['channel']):return None
        basis=fields.get('basisId',fields.get('basisEvent',rows[0]['id']if rows else None));basis=_js_str(basis)
        previous=next_state['lastBasis'].get(fields['channel'],last(fields['channel']).get('basisId',''))
        if _js_str(previous)==basis:return None
        signal=_new_signal(dict(fields,basisId=basis),now,rows);created.append(signal);next_state['lastBasis'][signal['channel']]=signal['basisId'];return signal
    fresh=bool(rows and now-rows[0]['timestamp']<=180000);full=full_history_frequency(analytics)
    diagnostics=dict(version=SCHEDULER_VERSION,now=now,fresh=fresh,sampleSize=len(rows),dataCutoff=rows[0]['timestamp']if rows else None,fullHistory=full,progress=progress,waitingChanceTable=waiting_chance_table(analytics),warnings=[])
    if invalid_analytics:diagnostics['warnings'].append('Будущая граница агрегированной истории отклонена')
    if not fresh:
        diagnostics['reason']='Нет свежей точной завершённой истории';return dict(signals=created,outcomes=outcomes,state=next_state,diagnostics=diagnostics)
    report=analyze_report(rows,now);diagnostics.update(report,fullHistory=full,progress=progress,waitingChanceTable=waiting_chance_table(analytics))
    diagnostics['thresholds']=[full_threshold(analytics,rows,t,now,next(x for x in report['thresholds']if x['target']==t))for t in VIP_TARGETS]
    if not next_state.get('rates')or now-float(next_state['rates'].get('computedAt')or 0)>=60000 or now<float(next_state['rates'].get('computedAt')or 0):
        rates=timed_analyze(rows[:5000],now)
        if rates and full:rates=timed_remote_overrides(rates,analytics)
        next_state['rates']=dict(computedAt=now,value=rates,source='own_full_history_global_override'if full else'own_latest_5000')
    source_rates=next_state['rates'].get('value');diagnostics.update(sourceRates=source_rates,timedRates=source_rates,rateSource=next_state['rates'].get('source'),timedDurations=[dict(minutes=minutes,proposal=timed_largest(minutes,full['pct'],full['perHour']),probabilitySource='own_full_history',theoretical1000Pct=.095)for minutes in DURATIONS]if full else[])
    if not full:diagnostics['warnings'].append('Полная агрегированная история недоступна; глубокие каналы приостановлены')
    premium=next_state['premium']
    if not pending('premium_live')and now>=float(premium.get('cooldownUntil')or 0)and rows[0]['id']!=premium.get('lastBasisId'):
        proposal=timed_choose(source_rates,rows[:3],now+3600,now)
        if proposal:
            start=now+3600;signal=add(dict(channel='premium_live',target=proposal['level'],start=start,end=start+proposal['minutes']*MINUTE,windowMs=proposal['minutes']*MINUTE,minutes=proposal['minutes'],confidence=proposal['chance'],scoreKind='independence_model_probability',reason=proposal['reason'],modelKind='original_timed_vortex',probabilitySource=next_state['rates']['source'],basisId=rows[0]['id'],liveWindow=True))
            if signal:
                premium['lastBasisId']=rows[0]['id'];premium['ingest']=dict(createdAt=now,readyAt=start,signalId=signal['id'],basisId=rows[0]['id'],proposal={k:proposal[k]for k in ('level','minutes','chance')},coefs=[r['coefficient']for r in reversed(rows[:3])])
    for candidate in analyze_all(rows,now,report):
        if candidate['channel']=='premium_live'or candidate['channel'].startswith('vip_'):continue
        if not _valid(candidate.get('estimatedAt'))or candidate['estimatedAt']-now<40000:continue
        basis=candidate.get('basisEvent',rows[0]['id'])
        if candidate['channel']=='big_cycle100'and _number(basis)is not None:basis=_js_str(_number(basis))
        add(dict(candidate,start=candidate['estimatedAt'],end=candidate['estimatedAt']+candidate['windowMs'],basisId=basis,boundaryPolicy='closed'))
    for candidate in diagnostics['thresholds']:
        if candidate.get('estimatedAt')is not None:add(dict(candidate,start=candidate['estimatedAt'],end=candidate['estimatedAt']+candidate['windowMs'],basisId=candidate.get('basisEvent'),boundaryPolicy='closed'))
    if full and full['perHour']>0:
        for minutes in DURATIONS:
            channel='duration_'+str(minutes)
            if pending(channel):continue
            proposal=timed_largest(minutes,full['pct'],full['perHour'])
            if not proposal:continue
            start=rows[0]['timestamp'];end=start+minutes*MINUTE
            if end-now<30000:continue
            add(dict(channel=channel,target=proposal['level'],start=start,end=end,windowMs=minutes*MINUTE,minutes=minutes,confidence=proposal['chance'],scoreKind='independence_model_probability',modelKind='original_deep_duration',probabilitySource='fixed_theoretical_baseline'if proposal['level']==1000 else'own_full_history',theoretical1000Pct=.095,backdatedStart=start<now,basisId=rows[0]['id'],anchorRoundId=rows[0]['id']))
        for target in ROUND_TARGETS:
            channel='rounds_'+str(target)
            if pending(channel):continue
            required=minimum_rounds(full['pct'][target])
            if not required:continue
            start=rows[0]['timestamp'];chance=timed_chance(full['pct'][target],required*60/full['perHour'],full['perHour'])
            add(dict(channel=channel,target=target,start=start,end=None,estimatedEnd=start+required/full['perHour']*3600000,windowKind='rounds',roundsRequired=required,plannedRounds=required,rounds=required,roundsObserved=0,roundsRemaining=required,remainingRounds=required,confidence=chance,scoreKind='independence_model_probability',modelKind='original_deep_rounds',probabilitySource='own_full_history',roundBasis='received_exact_rounds',backdatedStart=start<now,approximateTime=True,basisId=rows[0]['id'],anchorRoundId=rows[0]['id']))
    diagnostics['channelStatistics']={};diagnostics['channelStatisticsScope']='snapshot_visible_signals'
    for signal in [*effective.values(),*created]:
        item=diagnostics['channelStatistics'].setdefault(signal['channel'],dict(created=0,hit=0,miss=0,unknown=0,pending=0));item['created']+=1;item[signal['status']]=item.get(signal['status'],0)+1
    canonical_premium=next((s for s in [*created,*effective.values()]if s.get('channel')=='premium_live'and s.get('status')=='pending'),None)
    diagnostics['compatibilityOnlyLocalTimed']=diagnostics.get('timed')
    diagnostics['timed']=dict(level=canonical_premium['target'],minutes=canonical_premium.get('minutes',canonical_premium.get('windowMs',0)/MINUTE),chance=canonical_premium.get('confidence'),startAt=canonical_premium['start'],reason=canonical_premium.get('reason'),canonical=True)if canonical_premium else None
    diagnostics['premium']=copy.deepcopy(premium);diagnostics['generated']=len(created)
    return dict(signals=created,outcomes=outcomes,state=next_state,diagnostics=diagnostics)

# JavaScript-spelled aliases make review against the canonical source straightforward.
planSnapshot=plan_snapshot
evaluateCanonicalSignal=evaluate_canonical_signal
stableSignalId=stable_signal_id
fullHistoryFrequency=full_history_frequency
waitingChanceTable=waiting_chance_table
minimumRounds=minimum_rounds
