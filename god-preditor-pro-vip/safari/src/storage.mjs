// Read-only migration. The old installation's key is never rewritten.
export async function loadPanelState(gm, model, {key, legacyKey}) {
  const current = await gm.getValue(key, null);
  const saved = current ?? await gm.getValue(legacyKey, null);
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null;
  const journal = Array.isArray(saved.journal) ? saved.journal.filter(x => x && typeof x === 'object') : [];
  const legacy = Array.isArray(saved.legacyJournal) ? saved.legacyJournal.filter(x => x && typeof x === 'object') : [];
  const active = saved.model === model ? journal.filter(x => x.model === model) : [];
  const archived = saved.model === model ? journal.filter(x => x.model !== model) : journal;
  return {
    model,
    rows: Array.isArray(saved.rows) ? saved.rows : [],
    journal: active.slice(-100),
    legacyJournal: [...legacy, ...archived].slice(-200),
    selected: saved.selected === 'big' ? 'big' : 'primary',
    ui: saved.ui && typeof saved.ui === 'object' && !Array.isArray(saved.ui) ? saved.ui : {},
  };
}
