// A baked history as History's entries (timeline/model.ts Entry): the start, the changes and the events in the order they happened, and a last line, today, that carries the model's
// snapshot so Undo can always come back to today. Pure.
import type { Entry } from '../timeline/model.ts';
import type { Baked } from './types.ts';

export function entriesOf(b: Baked, name: string): Omit<Entry, 'id'>[] {
  const es: Omit<Entry, 'id'>[] = b.entries.map((e) => ({
    kind: e.kind, label: e.kind === 'start' ? name : e.label, day: e.day, t: e.t,
    ...(e.detail ? { detail: e.detail } : {}), ...(e.sev ? { sev: e.sev } : {}), ...(e.evId ? { evId: e.evId } : {}), ...(e.keys ? { keys: e.keys } : {}), ...(e.action ? { action: true } : {}),
    ...(e.params !== undefined ? { params: e.params } : {}),
  }));
  es.push({ kind: 'jump', label: `Day ${b.snap.day}, today`, day: b.snap.day, t: b.snap.t, snap: b.snap });
  return es;
}
