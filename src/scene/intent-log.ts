// N2: the last 60 seconds of what asked the figure to change, kept in a small ring so a bug report can carry it and a node run can play it back. Every `setLayer` / `clearLayer`
// (intent.ts) and a few inputs (the view, the open sheet, the slide) are noted with their page time. intent-replay.ts plays a log back in node (`npm run debug -- packet replay <file>`).
import { clock } from '../clock/frame.ts';
import type { LayerName } from './intent.ts';

export type LogEntry =
  | { t: number; op: 'set' | 'clear'; layer: LayerName; patch?: Record<string, unknown> }
  | { t: number; op: 'input'; what: string };

export const LOG_MS = 60_000;
export const LOG_MAX = 120;
const MAX_ITEMS = 24;
const ring: LogEntry[] = [];

/** A patch as plain data a packet can carry: long lists cut, the since reference (a list of numbers) reduced to its length. */
export function plain(patch: Record<string, unknown>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (v === undefined) continue;
    if (k === 'sinceRef') o[k] = v == null ? null : { n: (v as ArrayLike<number>).length };
    else if (Array.isArray(v)) o[k] = v.slice(0, MAX_ITEMS);
    else o[k] = v;
  }
  return o;
}

function push(e: LogEntry): void {
  ring.push(e);
  const cut = e.t - LOG_MS;
  let drop = 0;
  while (drop < ring.length - 1 && ring[drop]!.t < cut) drop++;
  if (ring.length - drop > LOG_MAX) drop = ring.length - LOG_MAX;
  if (drop > 0) ring.splice(0, drop);
}
const stamp = (): number => Math.round(clock.now());
export const logLayer = (op: 'set' | 'clear', layer: LayerName, patch?: Record<string, unknown>): void => push({ t: stamp(), op, layer, ...(patch ? { patch: plain(patch) } : {}) });
export const logInput = (what: string): void => push({ t: stamp(), op: 'input', what: what.slice(0, 80) });
/** The ring as it is now, oldest first (a copy). */
export const intentLog = (): LogEntry[] => ring.map((e) => ({ ...e }));
export const clearIntentLog = (): void => { ring.length = 0; };

