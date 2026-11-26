// The engine's own actions (a fluid, a band, a paracentesis…), sent as the 2D app's doAction does (main.js): the action goes to the worker and lands in History under
// its own name. Treat's Env and the cards' Act both use this one, so an action is recorded wherever it is pressed.
import { engine } from '../../engine/boot.ts';
import { live } from '../../engine/store.ts';
import { timeline } from '../timeline/index.ts';
import { useShell } from '../shell/store.ts';
import { actionLabel, type Action } from './action-label.ts';
import { talkOn } from '../../state/deck.ts';
import { record } from '../tests/feed.ts';

export { actionLabel };

export const BANDS_MAX = 4;   // (the engine's cap, engine.band)
const FLUID_SAYS: Record<string, string> = { crystalloid: '1 L crystalloid running (≈25% stays intravascular).', prbc: '1 unit of packed red cells running.', albumin: 'Albumin given: plasma oncotic pressure rises.' };
type Seen = { metrics?: { varix?: { present?: boolean } } | null; bands?: number } | null;

/** What an action answers with, and whether it goes to the model (the 2D doAction's own rules and words): a band with no varices, or a fifth band, is said and not sent;
 *  a fluid, a Valsalva and a paracentesis say what was done. `quiet`: a talk's own bands say nothing (the talk says it). */
export function actionAnswer(a: Action, f: Seen, quiet = false): { send: boolean; say: string | null } {
  if (a.kind === 'band') {
    if (f?.metrics && !f.metrics.varix?.present) return { send: false, say: 'No varices to band.' };
    const placed = Math.round(f?.bands || 0);
    if (placed >= BANDS_MAX) return { send: false, say: quiet ? null : `${BANDS_MAX} bands are already on the varices.` };
    return { send: true, say: quiet ? null : `Band (EVL) placed: ${placed + 1} of ${BANDS_MAX}.` };
  }
  if (a.kind === 'infuse') return { send: true, say: FLUID_SAYS[String(a.fluid)] ?? null };
  if (a.kind === 'valsalva') return { send: true, say: 'Valsalva: intrathoracic and intra-abdominal pressures rise for 10 s.' };
  if (a.kind === 'paracentesis') return { send: true, say: `Paracentesis: up to ${(((a.mL as number) || 0) / 1000).toFixed(1)} L drained${a.albumin ? ' with albumin' : ' without albumin'}.` };
  return { send: true, say: null };
}

/** the actions that move a reading at once: the day record makes them a step (a tap drops the ascites the same day; a band is counted by the feed itself) */
export const STEPS = (a: Action): boolean => a.kind === 'paracentesis' || a.kind === 'infuse';

export function sendAction(a: Action): void {
  const sh = useShell.getState();
  const ans = actionAnswer(a, live.frame as Seen, talkOn());
  if (ans.say) sh.say(ans.say);
  if (!ans.send) return;
  engine().send({ type: 'action', action: a });
  if (STEPS(a)) record.markStep();
  const label = actionLabel(a);
  if (label) timeline.recordAction(label);
}
