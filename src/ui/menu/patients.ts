// Loading a patient from the menu, a deep link or the search: one message to the engine, then the shell and the engine store say who it is. The same message the
// 2D app sends (main.js loadPreset). The model's frames of the new patient replace the old at once (a `jump` frame: nothing blends across it).
import { engine, useEngine } from '../../engine/index.ts';
import { setParams } from '../../engine/store.ts';
import { presetStarted } from '../action/params.ts';
import { useShell } from '../shell/store.ts';
import { UI } from '../strings.generated.ts';
import { PATIENT_FAILED } from '../shell/words.ts';

export async function loadPatient(id: string): Promise<boolean> {
  if (!UI.presets.some((p) => p.id === id)) return false;
  try {
    const r = await engine().request<{ type: 'presetLoaded'; id: string; params: unknown }>({ type: 'preset', id });
    setParams(r.params); presetStarted(id, r.params);
  } catch (e) { useShell.getState().say(PATIENT_FAILED, 'bad'); console.error(e); return false; }
  useEngine.setState({ presetId: id });
  useShell.setState({ patientId: id });
  return true;
}
