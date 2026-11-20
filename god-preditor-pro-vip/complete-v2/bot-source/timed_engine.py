"""Reviewed port of public TimedPredictions-CONzHsI0.js, captured 2026-11-20.
These are historical frequency estimates, not calibrated win probabilities.
A forecast's start is supplied explicitly; the source UI starts after 3.6s ingestion.
No remote credentials or third-party history are embedded in this module.
"""
from __future__ import annotations
import math
from datetime import datetime, timezone

TIMED_DURATIONS = (3, 6, 7, 10, 30, 61)
TIMED_LEVELS = (2, 5, 10, 100, 1000)
TIMED_VERSION = 'public-timed-20261120'
TIMED_INGEST_MS = 3600
TIMED_RESULT_MS = 40000


def timed_time(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if not isinstance(value, str) or not value.strip():
        return math.nan
    try:
        v = value.strip().replace(' ', 'T').replace('Z', '+00:00').replace('z', '+00:00')
        d = datetime.fromisoformat(v)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d.timestamp() * 1000
    except (ValueError, TypeError, OverflowError):
        return math.nan


def timed_iso(value):
    return datetime.fromtimestamp(timed_time(value) / 1000, timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def timed_rows(rows):
    """Adapt own Supabase or normalized model records to the original client contract."""
    out = []
    for row in rows:
        try:
            x = float(row.get('coefficient', row.get('x')))
        except (ValueError, TypeError):
            continue
        if row.get('completed') is False or row.get('estimated') is True:
            continue
        at = row.get('played_at', row.get('round_timestamp', row.get('timestamp')))
        stamp = timed_time(at)
        if not math.isfinite(stamp):
            continue
        out.append({'coefficient': x, 'played_at': at if isinstance(at, str) else timed_iso(stamp)})
    return out


def timed_chance(pct, minutes, per_hour):
    rounds = max(0, math.floor(minutes * per_hour / 60 + .5))  # JS Math.round, nonnegative inputs
    return (1 - (1 - pct / 100) ** rounds) * 100


def timed_per_hour(count, start, end):
    hours = (timed_time(end) - timed_time(start)) / 3600000
    return count / hours if hours > 0 else 0


def timed_largest(duration, pct, per_hour, minimum=69):
    best = None
    for level in TIMED_LEVELS:
        chance = timed_chance(pct.get(level, pct.get(str(level), 0)), duration, per_hour)
        if chance >= minimum:
            best = {'level': level, 'chance': chance}
    return best


def timed_valid(prediction):
    try:
        level, minutes, chance = prediction['level'], prediction['minutes'], prediction['chance']
        return level in (5, 10, 20, 100) and math.isfinite(chance) and 0 <= chance <= 100 and math.isfinite(timed_time(prediction['startAt'])) and (minutes == 1.5 if level == 5 else 2 <= minutes <= 3)
    except (KeyError, TypeError):
        return False


def timed_empirical_windows(rows):
    """Original nonoverlapping 30/61 minute coverage-qualified historical windows."""
    out = []
    for minutes in (30, 61):
        hits = {20: 0, 100: 0}
        sample = 0
        i = 0
        while i < len(rows) - 1:
            end = timed_time(rows[i]['played_at']) + minutes * 60000
            j, covered, largest = i + 1, True, 0
            while j < len(rows) and timed_time(rows[j]['played_at']) <= end:
                if timed_time(rows[j]['played_at']) - timed_time(rows[j - 1]['played_at']) > 180000:
                    covered = False
                largest = max(largest, rows[j]['coefficient'])
                j += 1
            if j >= len(rows):
                break
            if timed_time(rows[j]['played_at']) - timed_time(rows[j - 1]['played_at']) > 180000:
                covered = False
            if covered:
                sample += 1
                for level in hits:
                    hits[level] += largest >= level
            i = j
        for level in (20, 100):
            p = hits[level] / sample if sample else 0
            z = 1.96
            lower = (p + z*z/(2*sample) - z*math.sqrt(p*(1-p)/sample + z*z/(4*sample*sample))) / (1+z*z/sample)*100 if sample else 0
            out.append({'level': level, 'minutes': minutes, 'sample': sample, 'chance': p*100, 'lower': lower})
    return out


def timed_analyze(rows, now_ms=None):
    now_ms = datetime.now(timezone.utc).timestamp() * 1000 if now_ms is None else now_ms
    unique = set()
    clean = []
    for row in timed_rows(rows):
        at, x = timed_time(row['played_at']), row['coefficient']
        if not math.isfinite(at) or at > now_ms or not math.isfinite(x) or x < 1 or at in unique:
            continue
        unique.add(at)
        clean.append(row)
    clean.sort(key=lambda r: timed_time(r['played_at']))
    if len(clean) < 500:
        return None
    gaps = sorted(timed_time(b['played_at']) - timed_time(a['played_at']) for a, b in zip(clean, clean[1:]) if 0 < timed_time(b['played_at']) - timed_time(a['played_at']) <= 180000)
    if len(gaps) < 100:
        return None
    mid = len(gaps)//2
    median = gaps[mid] if len(gaps)%2 else (gaps[mid-1]+gaps[mid])/2
    pct = {level: 100*sum(r['coefficient'] >= level for r in clean)/len(clean) for level in (2, 5, 10, 20, 100, 1000)}
    return {'pct': pct, 'perHour': 3600000/median, 'sample': len(clean), 'cutoff': clean[-1]['played_at'], 'windows': timed_empirical_windows(clean)}


def timed_kind(latest):
    if latest and latest[0]['coefficient'] >= 10:
        return 'gold'
    if len(latest) >= 3 and all(1 <= r['coefficient'] < 1.3 for r in latest[:3]):
        return 'fall'
    return 'scan'


def timed_choose(rates, latest, start_at, now_ms=None):
    """Original 5/10/20/100 priority and fallback, without inventing future timing."""
    now_ms = datetime.now(timezone.utc).timestamp()*1000 if now_ms is None else now_ms
    if not rates:
        return None
    latest = timed_rows(latest)
    a = timed_time(rates.get('cutoff'))
    newest = timed_time(latest[0]['played_at']) if latest else math.nan
    per_hour = rates.get('perHour', 0)
    if not math.isfinite(a) or a > now_ms or now_ms-a > 180000 or not math.isfinite(timed_time(start_at)) or not math.isfinite(newest) or now_ms-newest > 180000 or newest > now_ms or not math.isfinite(per_hour) or per_hour <= 0:
        return None
    kind = timed_kind(latest)
    pct = rates['pct']
    get_pct = lambda level: pct.get(level, pct.get(str(level), 0))
    for level in (100, 20):
        p100 = get_pct(level)
        if not math.isfinite(p100) or p100 <= 0 or p100 > 100 or rates['sample'] < 500:
            continue
        p, n, z = p100/100, rates['sample'], 1.96
        lower = (p+z*z/(2*n)-z*math.sqrt(p*(1-p)/n+z*z/(4*n*n)))/(1+z*z/n)
        if timed_chance(lower*100, 3, per_hour) >= 69:
            return {'level': level, 'minutes': 3, 'chance': timed_chance(p100, 3, per_hour), 'startAt': start_at, 'reason': 'Fréquence observée · estimation prudente'}
    candidates = [(5, 1.5)] if kind == 'gold' else [(10, 3)] if kind == 'fall' else [(5, 1.5), (10, 2), (10, 2.5), (10, 3), (20, 2), (20, 2.5), (20, 3), (100, 3)]
    best = None
    eligible = None
    for level, duration in candidates:
        observed = get_pct(level)
        if not math.isfinite(observed) or observed <= 0 or observed > 100:
            continue
        chance = timed_chance(observed, duration, per_hour)
        item = {'level': level, 'minutes': duration, 'chance': chance, 'startAt': start_at, 'reason': 'Après cote d’or' if kind == 'gold' else 'Trois petites cotes' if kind == 'fall' else 'Analyse des tours'}
        if best is None or chance > best['chance']:
            best = item
        if kind == 'scan' and chance >= 35 and (eligible is None or level > eligible['level'] or level == eligible['level'] and duration < eligible['minutes']):
            eligible = {**item, 'reason': 'Cote avancée · analyse des tours'}
    return best if kind != 'scan' else eligible or best


def timed_remote_overrides(rates, remote):
    """Optional original GET global.p2/p5/p10/p100; only validated values are accepted.
    Our production defaults to own Supabase history; missing remote response is fine.
    """
    out = {**rates, 'pct': {**rates['pct']}}
    g = remote.get('global', {}) if isinstance(remote, dict) else {}
    for level in (2, 5, 10, 100):
        value = g.get('p'+str(level))
        if isinstance(value, (int, float)) and math.isfinite(value) and 0 <= value <= 100:
            out['pct'][level] = value
    return out


def timed_evaluate_original(prediction, rows, latest_at):
    """Compatibility-only source outcome. Use engine.validate_window for audited results:
    original code labels a loss without checking gaps; it can report an early hit.
    """
    start = timed_time(prediction['startAt'])
    end = start + prediction['minutes']*60000
    if not math.isfinite(end):
        return None
    clean = sorted(timed_rows(rows), key=lambda r: timed_time(r['played_at']))
    first = next((r for r in clean if start < timed_time(r['played_at']) <= end and math.isfinite(r['coefficient']) and r['coefficient'] >= prediction['level']), None)
    if first:
        return {**prediction, 'ok': True, 'hit': first['coefficient']}
    return {**prediction, 'ok': False, 'hit': None} if timed_time(latest_at) > end else None
