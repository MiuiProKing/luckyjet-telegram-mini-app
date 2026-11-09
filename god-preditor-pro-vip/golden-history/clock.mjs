export const TIME_ZONE = 'Europe/Kyiv';
const DAY = 86400000;
const formatters = new Map();

export function zonedParts(timestamp, timeZone = TIME_ZONE) {
  if (!formatters.has(timeZone)) formatters.set(timeZone, new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }));
  const parts = Object.fromEntries(formatters.get(timeZone).formatToParts(timestamp)
    .filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  return {...parts, date: `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
    secondOfDay: parts.hour * 3600 + parts.minute * 60 + parts.second};
}

function zoneOffset(timestamp, timeZone) {
  const p = zonedParts(timestamp, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(timestamp / 1000) * 1000;
}

// Build constant-offset UTC segments once. This also handles Kyiv's missing
// spring hour and repeated autumn hour; no fixed UTC+2/UTC+3 assumption is used.
export function createClockProjection(now, timeZone = TIME_ZONE) {
  const start = Math.ceil(now / 1000) * 1000, end = start + 3 * DAY;
  const segments = [];
  let from = start, offset = zoneOffset(start, timeZone);
  for (let sample = start + 6 * 3600000; sample <= end; sample += 6 * 3600000) {
    const nextOffset = zoneOffset(sample, timeZone);
    if (nextOffset === offset) continue;
    let low = Math.max(start, sample - 6 * 3600000), high = sample;
    while (high - low > 1000) {
      const middle = Math.floor((low + high) / 2000) * 1000;
      if (zoneOffset(middle, timeZone) === offset) low = middle; else high = middle;
    }
    segments.push({from, until: high, offset});
    from = high; offset = nextOffset;
  }
  segments.push({from, until: end, offset});
  return secondOfDay => {
    if (!Number.isInteger(secondOfDay) || secondOfDay < 0 || secondOfDay >= 86400) return null;
    let best = Infinity;
    for (const segment of segments) {
      const localStart = segment.from + segment.offset;
      let candidate = Math.floor(localStart / DAY) * DAY + secondOfDay * 1000 - segment.offset;
      if (candidate < segment.from) candidate += DAY;
      if (candidate >= segment.from && candidate < segment.until && candidate < best) best = candidate;
    }
    return Number.isFinite(best) ? best : null;
  };
}

export function prepareEvent(round, timeZone = TIME_ZONE) {
  if (!round || !round.id || !Number.isFinite(round.timestamp) || round.timestamp <= 0 ||
      !Number.isFinite(round.coefficient) || round.coefficient < 10) return null;
  const p = zonedParts(round.timestamp, timeZone);
  return {...round, sourceDate: p.date, secondOfDay: p.secondOfDay};
}

export function buildTimeline(events, {now = Date.now(), threshold = 10, days = 0, limit = 25, timeZone = TIME_ZONE} = {}) {
  const today = zonedParts(now, timeZone).date;
  const project = createClockProjection(now, timeZone);
  const minimumDate = days > 0 ? (() => {
    const p = zonedParts(now, timeZone);
    return new Date(Date.UTC(p.year, p.month - 1, p.day) - days * DAY).toISOString().slice(0, 10);
  })() : null;
  const rows = [], seen = new Set();
  for (const event of events) {
    if (!event || seen.has(event.id) || !Number.isFinite(event.coefficient) || event.coefficient < threshold ||
        !Number.isFinite(event.timestamp) || event.timestamp > now || event.sourceDate >= today ||
        (minimumDate && event.sourceDate < minimumDate)) continue;
    const nextAt = project(event.secondOfDay);
    if (nextAt === null) continue;
    seen.add(event.id);
    rows.push({...event, nextAt});
  }
  rows.sort((a, b) => a.nextAt - b.nextAt || b.timestamp - a.timestamp || b.coefficient - a.coefficient || a.id.localeCompare(b.id));
  return {total: rows.length, cards: rows.slice(0, limit), today};
}

export function formatClock(timestamp, timeZone = TIME_ZONE) {
  const p = zonedParts(timestamp, timeZone);
  return [p.hour, p.minute, p.second].map(x => String(x).padStart(2, '0')).join(':');
}

export function formatOccurrenceDay(nextAt, now = Date.now(), timeZone = TIME_ZONE) {
  const today = zonedParts(now, timeZone), target = zonedParts(nextAt, timeZone);
  if (target.date === today.date) return 'СЕГОДНЯ';
  const tomorrow = new Date(Date.UTC(today.year, today.month - 1, today.day + 1)).toISOString().slice(0, 10);
  if (target.date === tomorrow) return 'ЗАВТРА';
  return new Intl.DateTimeFormat('ru-RU', {timeZone, day: '2-digit', month: '2-digit', year: 'numeric'}).format(nextAt);
}

export function formatCountdown(nextAt, now = Date.now()) {
  const seconds = Math.max(0, Math.ceil((nextAt - now) / 1000));
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return (h ? `${String(h).padStart(2, '0')}:` : '') + `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
