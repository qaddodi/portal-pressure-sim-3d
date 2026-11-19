// Loading a patient from the menu, a deep link or the search: one message to the engine, then the shell and the engine store say who it is. The same message the
// 2D app sends (main.js loadPreset). The model's frames of the new patient replace the old at once (a `jump` frame: nothing blends across it).
import { engine, useEngine } from '../../engine/index.ts';
import { useShell } from '../shell/store.ts';
import { UI } from '../strings.generated.ts';

export async function loadPatient(id: string): Promise<boolean> {
  if (!UI.presets.some((p) => p.id === id)) return false;
  try {
    await engine().request({ type: 'preset', id });
  } catch (e) { useShell.getState().say('That patient did not load.', 'bad'); console.error(e); return false; }
  useEngine.setState({ presetId: id });
  useShell.setState({ patientId: id });
  return true;
}
