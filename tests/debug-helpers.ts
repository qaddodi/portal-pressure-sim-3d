// Made-up pages for the debug tests: an app snapshot and a raw DOM read, the way a phone with one teaching card up would give them. Each test changes only what it is about.
import type { AppSnapshot } from '../src/ui/debug/screen/app.ts';
import type { RawDom, RawCard } from '../src/ui/debug/screen/raw.ts';

export const app = (over: Partial<AppSnapshot> = {}): AppSnapshot => ({
  build: 'test', look: 'light', device: 'phone-portrait', vp: { w: 390, h: 844, safe: { top: 0, right: 0, bottom: 0, left: 0 } }, dpr: 3,
  mode: 'deck', view: 'anatomic', sheet: null, patient: 'csph', lens: 'pressure', picked: null,
  deck: { id: 'hvpg', number: 3, of: 9, words: 'teach', data: null, title: 'Wedge', page: 0, pages: 1 },
  readings: { hvpg: 11.1, whvp: 16.2, fhvp: 5.1, pv: 17.6, ivc: 4.6, ra: 4 },
  camera: { moving: false, placed: true, orbitDeg: 0, zoom: 1, pan: [0, 0], stage: { w: 390, h: 844 } },
  engine: { status: 'ready', frames: 10, crash: null, running: false, day: 0 }, clock: { awake: false, framesDrawn: 5, worstMs: 8, p95Ms: 4, holds: [] },
  free: { x: 0, y: 0, w: 390, h: 300 }, errors: { count: 0, last: [] }, memory: { gpuMB: 20, heapMB: 40, renderer: null },
  ...over,
});

export const card = (over: Partial<RawCard> = {}): RawCard => ({
  id: 'teach', phase: 'in', x: 16, y: 400, w: 358, h: 300, opacity: 1, scrollsY: false, scrollsX: false, overflowFlag: false,
  texts: [
    { role: 'kicker', px: 13, text: 'Step 2', left: 32, top: 416, right: 100, bottom: 432 },
    { role: 'title', px: 24, text: 'Wedge', left: 32, top: 440, right: 120, bottom: 470 },
    { role: 'body', px: 17.4, text: 'The balloon blocks the vein.', left: 32, top: 476, right: 340, bottom: 640 },
  ], ...over,
});

export const dom = (over: Partial<RawDom> = {}): RawDom => ({
  cards: [card()], readouts: [{ label: 'HVPG', value: 11.1, sev: 'danger' }, { label: 'PPG', value: 13, sev: 'danger' }], strip: null, labels: [],
  cues: [{ el: 'div.dk-row', tone: 'wedge', text: 'WHVP 16.2', named: false }], fontsLoaded: true,
  a11y: { lang: 'en', live: true, figureName: 'Portal circulation', figureDescription: 'Cirrhosis.', reduced: false, focusable: 12, unnamed: [] }, ...over,
});
