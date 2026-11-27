// "From readings" (Work backward), the 2D app's own flow (copied/from-readings.copied.js: its markup, words, steps, ranges and search, unchanged) in the 3D app's menu.
// The menu is the one menu shell (surface/Menu.tsx) on the 2D `.menu.fr-pop` (styles/from-readings.css): a popover under the gear, a sheet from the foot on a phone; it keeps its own form width.
// The flow builds its own DOM, as in 2D; this file
// only gives it the open menu's body, its refinement worker and "Open as patient". Its module (the search and its 537-patient library) loads when Settings first opens,
// so it is there by the time its row is tapped and the menu never opens empty.
import { useLayoutEffect, useRef } from 'react';
import { Menu } from '../surface/Menu.tsx';
import { useShell } from '../shell/store.ts';
import { loadPatient } from '../patients/index.ts';
import { YOURS_NOTE } from '../../engine/hales/portal/yours.js';
import { keepYours } from './yours.ts';
import { setPopoverHost } from './dom2d.ts';

export const FR_WORDS = { title: 'From readings', sub: 'Work backward', hint: 'Enter what you measured and see which lesions could give it' } as const;   // 2D menu.js: the door's words

interface Flow { open(anchor: unknown): void; dispose(): void }
let flow: Flow | null = null, loading: Promise<Flow> | null = null;

/** "Open as patient" (2D main.js openYours): saved on this device as Yours, the engine told, the patient loaded, and a line that says what it is. */
async function openYours(f: string, p: unknown, readings: unknown): Promise<void> {
  const rec = await keepYours(f, p, readings);
  if (!rec) throw new Error('not a patient the model can make');
  if (!(await loadPatient(rec.id))) throw new Error('the patient did not load');
  useShell.getState().say(`${rec.label}. ${YOURS_NOTE}`);
}

/** Loads the flow's module (once). Settings calls it as it opens. */
export function warmFromReadings(): Promise<Flow> {
  loading ??= import('./copied/from-readings.copied.js').then(({ createFromReadings }) => {
    flow = createFromReadings({ makeWorker: () => new Worker(new URL('./copied/inverse-worker.copied.js', import.meta.url), { type: 'module' }), openYours }) as Flow;
    return flow;
  });
  return loading;
}
/** Open it (the Settings row; the patient menu's door can call this too). */
export function openFromReadings(): void { void warmFromReadings().then(() => useShell.getState().open('readings')); }

function Body() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let gone = false;
    const start = (f: Flow) => { if (gone) return; setPopoverHost(el, () => useShell.getState().close()); f.open(null); };
    if (flow) start(flow); else void warmFromReadings().then(start);
    return () => { gone = true; setPopoverHost(null); };
  }, []);
  return <div ref={ref} className="fr-host" style={{ display: 'contents' }} />;
}

export function FromReadings() {
  return (
    <Menu id="readings" label={FR_WORDS.title} title={FR_WORDS.title} cls="fr-pop" align="end" from="settings">
      <Body />
    </Menu>
  );
}
