// The engine's own actions (a fluid, a band, a paracentesis…), sent as the 2D app's doAction does (main.js): the action goes to the worker and lands in History under
// its own name. Treat's Env and the cards' Act both use this one, so an action is recorded wherever it is pressed.
import { engine } from '../../engine/boot.ts';
import { timeline } from '../timeline/index.ts';

type Action = { kind: string; [k: string]: unknown };

const FLUID_LABEL: Record<string, string> = { crystalloid: '1 L crystalloid', prbc: '1 unit PRBC', albumin: 'Albumin infusion' };

/** The History label of an action (the 2D doAction's table), or '' when it has none. */
export function actionLabel(a: Action): string {
  switch (a.kind) {
    case 'infuse': return FLUID_LABEL[String(a.fluid)] ?? '';
    case 'hemorrhage': return `Hemorrhage ${a.mL} mL`;
    case 'band': return 'Band ligation';
    case 'valsalva': return 'Valsalva';
    case 'rupture': return 'Varix ruptured (manual)';
    case 'stopBleed': return 'Bleeding stopped';
    case 'paracentesis': return `Paracentesis ${(((a.mL as number) || 0) / 1000).toFixed(1)} L${a.albumin ? ' + albumin' : ''}`;
    default: return '';
  }
}

export function sendAction(a: Action): void {
  engine().send({ type: 'action', action: a });
  const label = actionLabel(a);
  if (label) timeline.recordAction(label);
}
