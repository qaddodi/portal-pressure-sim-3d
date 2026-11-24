// The talk's patient: a slide that names one (`model`: a preset and its parameter changes, the 2D deck's `preset` and `params`) has it loaded when the slide comes up;
// a slide that names none keeps the patient it is on. A start remembers the patient the person was on and leaving puts that patient back (the 2D app's `saved`).
import { engine, useEngine } from '../../engine/index.ts';
import { useUi } from '../ui-store.ts';
import { useShell } from '../shell/store.ts';
import { loadPatient } from '../menu/patients.ts';
import { patient, setParams } from '../../engine/store.ts';
import { timeline, patientLabel } from '../timeline/index.ts';
import { snapsOf } from '../../decks/hp/calc.ts';
import { MORPH_ONE_MS } from '../../decks/hp/slide-motion.ts';
import { sendParams } from '../../engine/params-send.ts';
import { deepMerge } from '../../engine/hales/portal/scenario.js';
import { presetBase, presetStarted, rebase } from '../action/params.ts';
import type { SlideModel } from '../../decks/schema.ts';
import type { Stop, Pos } from '../deck/presenter-machine.ts';

import { clock } from '../../clock/frame.ts';
export const modelAt = (stops: Stop[], pos: Pos): SlideModel | null => { const s = stops[pos.stop]; return s?.kind === 'slide' ? s.slide.model ?? null : null; };

/** The first slide's patient (the title and the outline stand on it). */
export const firstModel = (stops: Stop[]): SlideModel | null => { for (const s of stops) if (s.kind === 'slide') return s.slide.model ?? null; return null; };

/** The parameters a slide asks for on the patient that is already loaded: the preset's own settings with the slide's changes merged on, not the current ones (Plan 32 gate 3). */
export function slideParams(slide: object, base: unknown = presetBase()): unknown {
  return base && typeof base === 'object' ? deepMerge(structuredClone(base) as Record<string, unknown>, slide as Record<string, unknown>) : slide;
}
let token = 0;
/** Loads a slide's patient; the newest ask wins (a second tap meanwhile drops the first). A first patient is put in under the start's cover; a later one blends in:
 *  its state is computed on the second engine and the live figure eases from the old patient's colours and values to the new one's (the slide deck's way, decks/hp/link.ts), never a cut and never a dim. */
export async function applyModel(m: SlideModel, blend = false): Promise<boolean> {
  const mine = ++token;
  if (useEngine.getState().presetId !== m.preset) {
    if (blend) {
      try {
        const [own, end] = await snapsOf(m.params ? [{ preset: m.preset }, { params: m.params }] : [{ preset: m.preset }]).then((r) => [r[0]!, r[r.length - 1]!] as const);
        if (mine !== token) return false;
        engine().send({ type: 'morph', snap: end.snap, ms: MORPH_ONE_MS });
        setParams(end.params); presetStarted(m.preset, own.params); if (m.params) rebase();   // (the new patient's own settings are the base; the slide's changes are the talk's, not his)
        useEngine.setState({ presetId: m.preset }); useShell.setState({ patientId: m.preset }); timeline.reset(patientLabel(m.preset));   // (what loadPatient does for a new patient, less the cut)
        return true;
      } catch { if (mine !== token) return false; /* the second engine is down: the patient is put in whole, below */ }
    }
    const ok = (await loadPatient(m.preset)) && mine === token;
    if (ok && m.params) { sendParams(m.params, { settle: true }); rebase(); }   // (the new patient's own settings are the base; the slide's changes are the talk's, not his)
    return ok;
  }
  if (!m.params) return true;
  sendParams(slideParams(m.params), { settle: true, replace: true });   // (the slide's patient is the preset's own settings plus the slide's: never the leftover of a slider on the last one)
  rebase();
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
      const blend = seen !== null;   // (the first slide's patient is in before the talk is seen)
      seen = m; void applyModel(m, blend);
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
  if (s.params) sendParams(s.params, { settle: true, replace: true });   // (the base stays the loaded preset's own settings: what he had changed before the talk is still his, listed in Treat)
  useShell.setState({ patientId: s.preset });
}
