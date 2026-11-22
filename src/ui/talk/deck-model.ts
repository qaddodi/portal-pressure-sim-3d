// The talk's patient: a slide that names one (`model`: a preset and its parameter changes, the 2D deck's `preset` and `params`) has it loaded when the slide comes up;
// a slide that names none keeps the patient it is on. A start remembers the patient the person was on and leaving puts that patient back (the 2D app's `saved`).
import { engine, useEngine } from '../../engine/index.ts';
import { useUi } from '../ui-store.ts';
import { dipIn, dipOut } from '../shell/figure-dip.ts';
import { viewAt } from '../deck/presenter-machine.ts';
import { useShell } from '../shell/store.ts';
import { loadPatient } from '../menu/patients.ts';
import { patient } from '../../engine/store.ts';
import { sendParams } from '../../engine/params-send.ts';
import type { SlideModel } from '../../decks/schema.ts';
import type { Stop, Pos } from '../deck/presenter-machine.ts';

import { clock } from '../../clock/frame.ts';
export const modelAt = (stops: Stop[], pos: Pos): SlideModel | null => { const s = stops[pos.stop]; return s?.kind === 'slide' ? s.slide.model ?? null : null; };

/** The first slide's patient (the title and the outline stand on it). */
export const firstModel = (stops: Stop[]): SlideModel | null => { for (const s of stops) if (s.kind === 'slide') return s.slide.model ?? null; return null; };

let token = 0;
/** Loads a slide's patient; the newest ask wins (a second tap meanwhile drops the first). */
export async function applyModel(m: SlideModel, dip = false): Promise<boolean> {
  const mine = ++token;
  if (useEngine.getState().presetId !== m.preset) {
    // a new patient is put in under a dimmed figure (2D `dip`): it dims, the patient changes unseen, and the figure comes back as someone else, never a morph between two people
    const who = {};
    if (dip) await dipIn(who);
    const ok = (await loadPatient(m.preset)) && mine === token;
    if (ok && m.params) sendParams(m.params, { settle: true });
    if (dip) { if (ok) await new Promise((r) => clock.after(r, 180)); await dipOut(who); }   // (the new patient's first frames are drawn before the dim lifts)
    return ok;
  }
  if (!m.params) return true;
  sendParams(m.params, { settle: true });
  return true;
}

export function linkModel(): () => void {
  let seen: SlideModel | null = null;
  const sync = () => {
    const { stops, pos } = useUi.getState();
    if (!stops.length) return;
    // (the outline stands on the first slide's patient, as 2D's does: it is in under the start's cover, never dipped in)
    const m = modelAt(stops, pos) ?? (seen === null ? firstModel(stops) : null);
    if (m && m !== seen) {
      // (the first slide's patient is in before the talk is seen; one behind a case or question card is covered by it)
      const dip = seen !== null && viewAt(stops, pos).words !== 'case';
      seen = m; void applyModel(m, dip);
    }
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
  if (s.params) sendParams(s.params, { settle: true, replace: true });
  useShell.setState({ patientId: s.preset });
}
