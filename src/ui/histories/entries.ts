// A baked history as History's entries (timeline/model.ts Entry): the start, the changes and the events in the order they happened, and a last line, today, that carries the model's
// snapshot so Undo can always come back to today. The last line of each day the story headlines carries the model at that day's end (Show on the figure). Pure.
import type { Entry } from '../timeline/model.ts';
import type { Baked } from './types.ts';
import { eventDetail } from '../timeline/event-words.ts';

export function entriesOf(b: Baked, name: string): Omit<Entry, 'id'>[] {
  const es: Omit<Entry, 'id'>[] = b.entries.map((e) => ({
    kind: e.kind, label: e.kind === 'start' ? name : e.label, day: e.day, t: e.t,
    ...(e.detail ? { detail: e.kind === 'event' ? eventDetail(e.evId, e.detail) ?? e.detail : e.detail } : {}), ...(e.sev ? { sev: e.sev } : {}), ...(e.evId ? { evId: e.evId } : {}), ...(e.keys ? { keys: e.keys } : {}), ...(e.action ? { action: true } : {}),
    ...(e.step ? { step: e.step } : {}),
    ...(e.params !== undefined ? { params: e.params } : {}),
    // (a moment the story headlines: the model at its day's end, to show on the figure; the past, so Undo walks past it)
    ...(e.snap ? { snap: e.snap, past: true } : {}),
  }));
  es.push({ kind: 'jump', label: `Day ${b.snap.day}, today`, day: b.snap.day, t: b.snap.t, snap: b.snap });
  return es;
}
