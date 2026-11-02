// Clock rollback or missing timestamps cannot arm the controller.
export function sourceReady(status, stats, lastSuccessAt, now = Date.now()) {
  if (status !== 'connected' || stats?.ready !== true || !Number.isFinite(now) ||
      !Number.isFinite(lastSuccessAt) || !Number.isFinite(stats.lastAt)) return false;
  const pollAge = now - lastSuccessAt, roundAge = now - stats.lastAt;
  return pollAge >= 0 && pollAge <= 12000 && roundAge >= 0 && roundAge <= 180000;
}
