// The talk's patient: a slide that names one (`model`: a preset and its parameter changes, the 2D deck's `preset` and `params`) has it loaded when the slide comes up;
// a slide that names none keeps the patient it is on. A start remembers the patient the person was on and leaving puts that patient back (the 2D app's `saved`).
import { engine, useEngine } from '../../engine/index.ts';
import { useUi } from '../ui-store.ts';
import { useShell } from '../shell/store.ts';
import { loadPatient } from '../menu/patients.ts';
import { patient } from '../../engine/store.ts';
import type { SlideModel } from '../../decks/schema.ts';
import type { Stop, Pos } from '../deck/presenter-machine.ts';

export const modelAt = (stops: Stop[], pos: Pos): SlideModel | null => { const s = stops[pos.stop]; return s?.kind === 'slide' ? s.slide.model ?? null : null; };

let token = 0;
/** Loads a slide's patient; the newest ask wins (a second tap meanwhile drops the first). */
export async function applyModel(m: SlideModel): Promise<boolean> {
  const mine = ++token;
  if (useEngine.getState().presetId !== m.preset) { if (!(await loadPatient(m.preset)) || mine !== token) return false; }
  else if (!m.params) return true;
  if (m.params) engine().send({ type: 'setParams', params: m.params, settle: true });
  return true;
}

export function linkModel(): () => void {
  let seen: SlideModel | null = null;
  const sync = () => {
    const { stops, pos } = useUi.getState();
    if (!stops.length) return;
    const m = modelAt(stops, pos);
    if (m && m !== seen) { seen = m; void applyModel(m); }
  };
  sync();
  return useUi.subscribe((s, p) => { if (s.pos !== p.pos || s.stops !== p.stops) sync(); });
}

export interface Saved { preset: string | null; params: unknown }
/** The patient on the figure now, kept when a talk starts. */
export const captureSaved = (): Saved => ({ preset: useEngine.getState().presetId, params: patient.params ? structuredClone(patient.params) : null });
/** Puts the patient back (the preset and its parameters). */
export async function restoreSaved(s: Saved): Promise<void> {
  if (!s.preset) return;
  if (!(await loadPatient(s.preset))) return;
  if (s.params) engine().send({ type: 'setParams', params: s.params, settle: true });
  useShell.setState({ patientId: s.preset });
}
