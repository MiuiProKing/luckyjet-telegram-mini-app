import {TIME_ZONE, previousMorningWindow, prepareEvent, buildTimeline} from './clock.mjs?v=20261109-3';

// Conditional tail approximation for rounds already reaching the gold threshold.
// This is not a probability for the very next ordinary round or a timing model.
export function goldenTailPercent(target, goldThreshold = 10) {
  if (!Number.isFinite(target) || !Number.isFinite(goldThreshold) || goldThreshold < 1 || target < goldThreshold) return null;
  return 100 * goldThreshold / target;
}

export function buildRecommendation(rounds, {now = Date.now(), filterThreshold = 10,
  timeZone = TIME_ZONE, sourceWindow = previousMorningWindow(now, timeZone)} = {}) {
  const filter = Number.isFinite(filterThreshold) ? Math.max(10, filterThreshold) : 10;
  const target = Math.max(20, filter);
  const seen = new Set(), events = [];
  for (const round of rounds) {
    if (!round || seen.has(round.id) || round.completed === false || round.estimated === true ||
        !Number.isFinite(round.timestamp) || round.timestamp > now ||
        round.timestamp < sourceWindow.start || round.timestamp >= sourceWindow.end) continue;
    const event = prepareEvent(round, timeZone);
    if (!event) continue;
    seen.add(event.id); events.push(event);
  }
  const hits = events.filter(event => event.coefficient >= target).length;
  const mark = buildTimeline(events, {now, threshold: target, limit: 1, timeZone, sourceWindow}).cards[0] ?? null;
  return {target, modeledPct: goldenTailPercent(target), goldenCount: events.length, hits,
    empiricalPct: events.length ? 100 * hits / events.length : null, mark,
    status: !events.length ? 'no-data' : mark ? 'ready' : 'no-time'};
}
