// The preload ladder: what a person opens a little after the first picture is read in, one rung at a time, each in its own quiet slot, so the first tap on it costs nothing visible. Nothing here is needed for
// the first picture; a rung that fails is left for its first use (the lazy retry, boot/lazy-retry.ts, tries it again then). The scene queues its own two rungs before these (the micro views, then the weld plan).
//   rungs, in order:  the instrument modules (Doppler, Endoscopy, HVPG/IR, FibroScan, Profile, Trials: dock/lazy.ts LOADERS, evaluated, nothing mounted), a talk's charts (the tool card),
//                     the shared chart context, then the instruments' GL programs on it (boot/warm-programs.ts).
// A rung runs inside a slot the caller hands in (`slot(go)` calls go() when nobody is watching motion; the one background-work slot, clock/idle.ts: quietSlot) and never when the person asked the browser to save data (boot/data-saver.ts: Save-Data, a 2g link): those parts are then fetched on use and kept, as ever.
import { loadToolCard } from '../ui/talk/tool-card-load.ts';
import { need, LOADERS } from '../ui/tests/dock/lazy.ts';
import { sharedContext } from '../ui/charts/gl.ts';
import { PROGRAM_SETS, warmSet } from './warm-programs.ts';
import { lowData } from './data-saver.ts';
import { spanAsync } from './spans.ts';

import { clock } from '../clock/frame.ts';
import { whenQuietOnce } from '../clock/idle.ts';
import { stamp } from './timeline.ts';

export interface Rung { id: string; run: () => unknown }
export type Slot = (go: () => void) => void;

/** The instruments in the order they are likely opened. Every key of LOADERS is here (tests/warm-ladder.test.ts), so a new instrument fails until it is added. */
export const MODULE_ORDER = ['doppler', 'endoscopy', 'hvpg', 'fibroscan', 'profile', 'trials'] as const satisfies readonly (keyof typeof LOADERS)[];

export const RUNGS: readonly Rung[] = [
  ...MODULE_ORDER.map((id): Rung => ({ id: `module:${id}`, run: () => need(id) })),   // (need(): shared with the tabs, so a tap during the rung waits on the same load)
  { id: 'module:talk', run: () => loadToolCard() },   // (a talk's charts)
  { id: 'programs:charts', run: () => { sharedContext(); } },   // (the one shared chart context, with the chart program)
  ...PROGRAM_SETS.map((set): Rung => ({ id: `programs:${set.name}`, run: () => warmSet(set) })),
];

/** Runs the rungs in order, one per slot, and returns the ids it ran. Stops at the first rung's turn that finds Save-Data on; a rung that throws or rejects does not stop the next. */
export async function runLadder(rungs: readonly Rung[] = RUNGS, slot: Slot = quietSlot, o: { lowData?: () => boolean; time?: <T>(id: string, fn: () => Promise<T>) => Promise<T> } = {}): Promise<string[]> {
  const saving = o.lowData ?? lowData, time = o.time ?? ((id, fn) => spanAsync(`ladder:${id}`, fn));
  const ran: string[] = [];
  for (const r of rungs) {
    await new Promise<void>((go) => slot(go));
    if (saving()) break;
    ran.push(r.id);
    try { await time(r.id, async () => { await r.run(); }); } catch { /* left for its first use */ }
  }
  return ran;
}

/** The loading plan's one background slot (clock/idle.ts): a rung starts only when no hold is live and no finger is down, in a task of its own (an idle callback, or a MessageChannel task on Safari, never a blind timer).
 *  The wait limit is a starvation valve only: a rung is a module load, not about the picture, so after 20 s of unbroken motion it goes anyway. */
export const quietSlot: Slot = (go) => { whenQuietOnce(go, { tag: 'ladder', maxWaitMs: 20000 }); };

export function warmLater(delayMs = 3000): void {
  if (typeof window === 'undefined') return;
  const go = () => clock.after(() => { void runLadder().then(() => stamp('instruments')); }, delayMs);
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
}
