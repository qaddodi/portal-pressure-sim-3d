// Patients: loading one, restarting it, and the name the shell shows. The same message the 2D app sends (main.js loadPreset): one `preset` request; the model's first frames of
// the new patient replace the old at once (a `jump` frame, nothing blends across it); the timeline starts over with the patient's name; Compare ends on a restart (restartPatient).
import { engine, useEngine } from '../../engine/index.ts';
import { setParams } from '../../engine/store.ts';
import { presetStarted } from '../action/params.ts';
import { useShell } from '../shell/store.ts';
import { UI } from '../strings.generated.ts';
import { PATIENT_FAILED } from '../shell/words.ts';
import { timeline, patientLabel } from '../timeline/index.ts';
import { useCompare } from '../compare/store.ts';
import { isYours, syncYours } from '../readings/yours.ts';

let loadGen = 0;

/** Load a patient. Patients tapped in quick succession: the engine loads them in order, so only the last one's answer is applied (2D loadPreset's presetGen). */
export async function loadPatient(id: string): Promise<boolean> {
  const yours = isYours(id);   // (a patient made from readings on this device: the engine is told the saved list first)
  if (!yours && !UI.presets.some((p) => p.id === id)) return false;
  const gen = ++loadGen;
  let params: unknown;
  try {
    if (yours) await syncYours();
    params = (await engine().request<{ type: 'presetLoaded'; id: string; params: unknown }>({ type: 'preset', id })).params;
  } catch (e) {
    if (gen === loadGen) useShell.getState().say(PATIENT_FAILED, 'bad');
    console.error(e);
    return false;
  }
  if (gen !== loadGen) return false;
  setParams(params); presetStarted(id, params as Parameters<typeof presetStarted>[1]);   // (the patient's own settings: the engine store keeps them, and Treat's change history starts from them)
  useEngine.setState({ presetId: id });
  useShell.setState({ patientId: id });
  timeline.reset(patientLabel(id));
  return true;
}

/** Restart: the current patient from its first moment, every change and the clock cleared, Compare ended (2D restartPatient). */
export async function restartPatient(): Promise<boolean> {
  useCompare.getState().stop();
  const id = useEngine.getState().presetId || 'healthy';
  if (!(await loadPatient(id))) return false;
  useShell.getState().say(`Restarted: ${patientLabel(id) || 'patient'}.`);
  return true;
}
