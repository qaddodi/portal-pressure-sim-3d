// The timeline chart's data as the page has it now: the record's days and History's entries. It re-reads when the days or History change, and every TICK_MS while the card is open (a run that goes
// on adds its newest day in place: the record raises no flag for that).
import { useEffect, useMemo, useState } from 'react';
import { clock } from '../../clock/frame.ts';
import { record } from '../tests/feed.ts';
import { timeline, getInterventionLabels } from '../timeline/index.ts';
import { useTimeline } from '../timeline/store.ts';
import { useHidden } from '../tests/hidden.ts';
import { buildData, type Data } from './data.ts';
import type { EntryIn } from './marks.ts';

export const TICK_MS = 250;

/** History's entries as the chart reads them: what was done up to the moment the model is at (later entries kept ahead by Undo are not yet) */
export function entriesNow(): EntryIn[] {
  const es = timeline.entries(), out: EntryIn[] = [];
  es.forEach((e, i) => {
    if (timeline.isFuture(i)) return;
    out.push({ id: e.id, kind: e.kind, label: e.label, day: e.day, ...(e.sev ? { sev: e.sev } : {}), ...(e.keys ? { keys: e.keys } : {}), ...(e.action ? { action: true } : {}), ...(e.detail ? { detail: e.detail } : {}), ...(e.snap ? { params: e.snap.params } : e.params != null ? { params: e.params } : {}) });
  });
  return out;
}

export function useBigData(on: boolean): Data {
  const rev = useTimeline((s) => s.rev), hidden = useHidden();
  const [tick, setTick] = useState(0);
  useEffect(() => { if (!on) return; const id = clock.every(() => setTick((n) => n + 1), TICK_MS, 'bigtime-data'); return () => clock.cancel(id); }, [on]);
  // The tick only looks again; what is drawn is made anew when the days or History changed, or today's point moved (its readings are the signature).
  const last = record.days[record.days.length - 1];
  const sig = `${on}|${rev}|${record.daysVer}|${last ? `${last.day}:${Object.values(last.v).map((v) => Math.round(v * 10)).join(',')}` : ''}`;
  void tick;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => buildData({ calm: record.calm, entries: entriesNow(), labelsOf: getInterventionLabels(), hidden }), [sig, hidden]);
}
