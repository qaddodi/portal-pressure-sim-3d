// What the app's own stores say right now, as one plain object (the readers' source for the parts that are not in the DOM). The only place the screen report imports
// the app; the readers and rules take this object, so a Node test hands them a made-up one.
import { latest, useEngine } from '../../../engine/index.ts';
import { useShell } from '../../shell/store.ts';
import { useUi } from '../../ui-store.ts';
import { useDeck } from '../../../state/deck.ts';
import { useSettings } from '../../../state/settings.ts';
import { useLens } from '../../../scene/lenses/store.ts';
import { usePick, cel } from '../../../scene/api.ts';
import { viewAt } from '../../deck/presenter-machine.ts';
import { resolveLook } from '../../../looks/looks.ts';
import { clock } from '../../../clock/frame.ts';
import { caughtCount, caughtList } from '../caught.ts';

export interface AppSnapshot {
  build: string; look: string;
  device: string; vp: { w: number; h: number; safe: { top: number; right: number; bottom: number; left: number } }; dpr: number;
  mode: 'free' | 'deck'; view: string; sheet: string | null; patient: string | null; lens: string; picked: string | null;
  deck: { id: string | null; number: number; of: number; words: string; data: string | null; title: string | null; page: number | string; pages: number } | null;
  readings: Record<string, number | null>;
  camera: { moving: boolean; placed: boolean; orbitDeg: number; zoom: number; pan: [number, number]; stage: { w: number; h: number } };
  engine: { status: string; frames: number; crash: string | null; running: boolean; day: number | null };
  clock: { awake: boolean; framesDrawn: number; worstMs: number; p95Ms: number; holds: string[] };
  free: { x: number; y: number; w: number; h: number };
  errors: { count: number; last: string[] };
  memory: { gpuMB: number | null; heapMB: number | null; renderer: string | null };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** The GPU's share, estimated from the drawing buffer (width x height x 4 bytes, tripled for the depth and the antialias samples). An estimate, named so in the report. */
function memoryNow(): AppSnapshot['memory'] {
  let gpuMB: number | null = null;
  const renderer: string | null = null;
  try {
    // The canvas's own size only: asking it for a context here would make a second one (tests/webgl-budget.test.ts).
    const c = document.querySelector('canvas');
    if (c) gpuMB = r1((c.width * c.height * 4 * 3) / 1048576);
  } catch { /* a page that will not say */ }
  const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return { gpuMB, heapMB: heap ? r1(heap.usedJSHeapSize / 1048576) : null, renderer };
}

export function appSnapshot(): AppSnapshot {
  const sh = useShell.getState(), ui = useUi.getState(), eng = useEngine.getState(), deck = useDeck.getState(), st = clock.stats();
  const talk = sh.mode === 'deck' && ui.stops.length;
  const view = talk ? viewAt(ui.stops, ui.pos) : null;
  const hand = cel.rig.handView;
  return {
    build: String(import.meta.env.VITE_BUILD ?? 'dev'), look: resolveLook(useSettings.getState().look, matchMedia('(prefers-color-scheme: dark)').matches),
    device: ui.device, vp: ui.vp, dpr: devicePixelRatio,
    mode: sh.mode, view: sh.view, sheet: sh.sheet, patient: eng.presetId ?? sh.patientId, lens: useLens.getState().lens, picked: usePick.getState().picked,
    deck: view ? { id: deck.deckId, number: view.number, of: view.of, words: view.words, data: view.data, title: view.slide?.title ?? null, page: ui.page, pages: ui.pageCount } : null,
    readings: { hvpg: eng.hvpg, whvp: eng.whvp, fhvp: eng.fhvp, pv: eng.pv, ivc: eng.ivc, ra: eng.ra },
    camera: { moving: cel.rig.isMoving, placed: cel.rig.placed, orbitDeg: r1((cel.rig.orbitAngle * 180) / Math.PI), zoom: Math.round(hand.k * 1000) / 1000, pan: [Math.round(hand.x), Math.round(hand.y)], stage: cel.rig.stageSize },
    engine: { status: eng.status, frames: eng.frames, crash: eng.crash, running: !!latest.frame?.running, day: latest.frame ? Math.round(latest.frame.day * 10) / 10 : null },
    clock: { awake: st.awake, framesDrawn: st.framesDrawn, worstMs: r1(st.max), p95Ms: r1(st.p95), holds: st.holds },
    free: ui.boxes.free,
    errors: { count: caughtCount(), last: caughtList().slice(-3).map((c) => `${c.site}: ${c.message}`) },
    memory: memoryNow(),
  };
}
