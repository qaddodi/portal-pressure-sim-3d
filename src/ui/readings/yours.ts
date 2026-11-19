// "Yours": the patients From readings makes (2D main.js syncYours / openYours / forgetYours). The saved records live on this device (copied/yours-store.copied.js); the engine is
// told the whole list (the worker's `yours` message registers exactly those as presets) before one is loaded.
import { engine } from '../../engine/index.ts';
import { readYours, saveYours, removeYours } from './copied/yours-store.copied.js';

interface Rec { id: string; label: string }
const list = (): Rec[] => readYours() as Rec[];

/** Whether `id` is a patient made from readings that this device still holds. */
export const isYours = (id: string | null | undefined): boolean => !!id && id.startsWith('yours-') && list().some((r) => r.id === id);
/** Its name ("Cirrhosis 60% + Portal vein clot 40%"), or '' when it is not one. */
export const yoursName = (id: string | null | undefined): string => (id && id.startsWith('yours-') ? list().find((r) => r.id === id)?.label ?? '' : '');

let told = '';
/** Tell the engine the saved list (once per list: a reload starts a new worker, which knows none). */
export async function syncYours(records: unknown[] = list()): Promise<void> {
  const sig = JSON.stringify(records);
  if (sig === told) return;
  await engine().request({ type: 'yours', list: records });
  told = sig;
}
/** Save the scenario (family f at settings p, made from `readings`) as a patient of this device and tell the engine. Returns its record, or null when the model cannot make it. */
export async function keepYours(f: string, p: unknown, readings: unknown): Promise<Rec | null> {
  const { list: all, rec } = saveYours(f, p, readings) as { list: unknown[]; rec: Rec | null };
  if (!rec) return null;
  await syncYours(all);
  return rec;
}
export const forgetYours = (id: string): Promise<void> => syncYours(removeYours(id) as unknown[]);
