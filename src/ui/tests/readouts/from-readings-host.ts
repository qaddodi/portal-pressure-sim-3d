// "Work backward from readings" (2D from-readings.js, copied whole: copied/from-readings.copied.js) as the 3D app opens it. The module and the library of 537 scenarios it ranks load on the first
// tap, never before; the refinement runs in its own worker (copied/inverse-worker.copied.js), not the engine's. "Open as patient" saves the scenario as "Yours" on this device (the copied
// yours-store), tells the engine the whole saved list (its `yours` message, as 2D main.js syncYours does) and loads it like any other patient (patients/index.ts loadPatient).
import { engine } from '../../../engine/index.ts';
import { loadPatient } from '../../patients/index.ts';
import { noteYours } from '../../patients/yours-labels.ts';
import { useShell } from '../../shell/store.ts';
import { YOURS_NOTE } from '../../../engine/hales/portal/yours.js';

interface Flow { open(anchor: HTMLElement): void; close(): void; dispose(): void }
let flow: Promise<Flow> | null = null;

/** The fit's worker: a module worker made by the bundler from this URL. */
export const makeWorker = (): Worker => new Worker(new URL('./copied/inverse-worker.copied.js', import.meta.url), { type: 'module' });

/** main.js openYours: save the scenario as "Yours", give the engine the saved list, open the patient. Rejects when the model cannot make it (the flow says so). */
export async function openYours(f: string, p: Record<string, number>, readings: Record<string, number>): Promise<void> {
  const { saveYours } = await import('./copied/yours-store.copied.js') as unknown as { saveYours(f: string, p: unknown, r: unknown): { list: unknown[]; rec: { id: string; label: string } | null } };
  const { list, rec } = saveYours(f, p, readings);
  if (!rec) throw new Error('not a patient the model can make');
  await engine().request({ type: 'yours', list } as never);
  noteYours(rec.id, rec.label);
  if (!(await loadPatient(rec.id))) throw new Error('the patient could not be loaded');
  useShell.getState().say(`${rec.label}. ${YOURS_NOTE}`);
}

/** The flow, made once (it keeps the entered readings for the page's life, so the sheet can be closed and opened where it was left). */
export function fromReadings(): Promise<Flow> {
  flow ??= import('./copied/from-readings.copied.js').then((m) => (m as unknown as { createFromReadings(ctx: unknown): Flow }).createFromReadings({ makeWorker, openYours }));
  return flow;
}
/** Open it under `anchor` (a sheet on a phone). */
export function openFromReadings(anchor: HTMLElement): void { void fromReadings().then((f) => f.open(anchor)).catch((e) => console.error(e)); }
/** Have the module ready before the first tap (2D warmUp). */
export const warmFromReadings = (): void => { void fromReadings().catch(() => { flow = null; }); };
