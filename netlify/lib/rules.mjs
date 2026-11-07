// Deterministic completeness checks (rules first, AI later). Flags are prompts for human review, never proof of wrongdoing.
export const EVENT_TYPES = ['production', 'quality', 'packing', 'dispatch', 'receipt', 'storage'];
export const REQUIRED = ['production', 'quality', 'packing', 'dispatch'];
const STAGE = { production: 0, quality: 1, packing: 2, dispatch: 3, receipt: 4 };
export const ROLE_EVENTS = {
  admin: new Set(EVENT_TYPES),
  operator: new Set(['production', 'packing', 'storage']),
  quality: new Set(['quality']),
  distributor: new Set(['dispatch', 'receipt', 'storage']),
};
export const supersededIds = evs => new Set(evs.filter(e => e.corrects_id).map(e => e.corrects_id));
export const activeEvents = evs => { const gone = supersededIds(evs); return evs.filter(e => !gone.has(e.id)).sort((a, b) => (a.event_time < b.event_time ? -1 : a.event_time > b.event_time ? 1 : a.id - b.id)); };
export const eventLabel = e => (e.reviewed_by ? 'reviewed' : e.evidence && e.evidence.length ? 'document' : 'entered');

export function analyse(batch, events) {
  const act = activeEvents(events), first = {};
  for (const e of act) if (!first[e.event_type]) first[e.event_type] = e;
  const flags = [];
  const furthest = Math.max(-1, ...Object.keys(first).filter(t => t in STAGE).map(t => STAGE[t]));
  for (const t of REQUIRED) {
    if (!first[t]) {
      const late = STAGE[t] < furthest;
      flags.push({ severity: late ? 'warning' : 'info', code: `missing_${t}`, message: `No ${t} event recorded` + (late ? ' even though later steps exist.' : ' yet.') });
    }
  }
  const prodDay = first.production ? first.production.event_time.slice(0, 10) : batch.production_date;
  for (const t of ['quality', 'packing', 'dispatch', 'receipt'])
    if (first[t] && first[t].event_time.slice(0, 10) < prodDay)
      flags.push({ severity: 'warning', code: `${t}_before_production`, message: `The ${t} event is dated before production (${prodDay}).` });
  const before = (a, b, message, code) => { if (first[a] && first[b] && first[a].event_time < first[b].event_time) flags.push({ severity: 'warning', code, message }); };
  before('receipt', 'dispatch', 'Receipt is dated before dispatch.', 'receipt_before_dispatch');
  before('dispatch', 'packing', 'Dispatch is dated before packing.', 'dispatch_before_packing');
  if (act.some(e => e.event_type === 'quality' && !(e.evidence && e.evidence.length)))
    flags.push({ severity: 'warning', code: 'quality_no_evidence', message: 'A quality event has no supporting document attached.' });
  const status = flags.some(f => f.severity === 'warning') ? 'needs_review' : flags.length ? 'in_progress' : 'complete';
  return { status, flags };
}
