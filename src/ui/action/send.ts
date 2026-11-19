// The engine's own actions (a fluid, a band, a paracentesis…), sent as the 2D app's doAction does (main.js): the action goes to the worker and lands in History under
// its own name. Treat's Env and the cards' Act both use this one, so an action is recorded wherever it is pressed.
import { engine } from '../../engine/boot.ts';
import { live } from '../../engine/store.ts';
import { timeline } from '../timeline/index.ts';
import { useShell } from '../shell/store.ts';
import { TREAT_WORDS } from '../treat/treat.generated.ts';

type Action = { kind: string; [k: string]: unknown };

const FLUID_LABEL: Record<string, string> = { crystalloid: '1 L crystalloid', prbc: '1 unit PRBC', albumin: 'Albumin infusion' };

/** The History label of an action (the 2D doAction's table), or '' when it has none. */
export function actionLabel(a: Action): string {
  switch (a.kind) {
    case 'infuse': return FLUID_LABEL[String(a.fluid)] ?? '';
    case 'hemorrhage': return `Hemorrhage ${a.mL} mL`;
    case 'band': return TREAT_WORDS.procedures.band.label;
    case 'valsalva': return 'Valsalva';
    case 'rupture': return 'Varix ruptured (manual)';
    case 'stopBleed': return 'Bleeding stopped';
    case 'paracentesis': return `Paracentesis ${(((a.mL as number) || 0) / 1000).toFixed(1)} L${a.albumin ? ' + albumin' : ''}`;
    default: return '';
  }
}

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

export function sendAction(a: Action): void {
  const sh = useShell.getState();
  const ans = actionAnswer(a, live.frame as Seen, sh.mode === 'deck');
  if (ans.say) sh.say(ans.say);
  if (!ans.send) return;
  engine().send({ type: 'action', action: a });
  const label = actionLabel(a);
  if (label) timeline.recordAction(label);
}
