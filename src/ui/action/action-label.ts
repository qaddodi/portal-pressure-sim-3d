// The History label of an engine action (the 2D doAction's table). Pure, so the histories' player (ui/histories) words an action as the page does.
import { TREAT_WORDS } from '../treat/treat.generated.ts';

export type Action = { kind: string; [k: string]: unknown };

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
