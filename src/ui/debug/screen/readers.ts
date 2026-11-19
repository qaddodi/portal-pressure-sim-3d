// The screen report's readers for the 3D app: one reader per part of what is on the screen, each handed the same two plain objects (the app's stores, app.ts; the page's
// layout, raw.ts) and writing one JSON part and the words for it. Part names and the page part's fields are the 2D report's, so a 2D and a 3D report compare.
// THE ONE RULE FOR READERS (the 2D app's): a reader takes the painter's own record and works nothing out a second way. No DOM and no app import here: a Node test hands in
// made-up objects.
import { registerReader } from '../core/registry.copied.js';
import type { AppSnapshot } from './app.ts';
import type { RawDom, RawCard, RawLabel } from './raw.ts';

export interface Ctx { app: AppSnapshot; dom: RawDom; env: Record<string, unknown>; detail: 'summary' | 'full'; parts: Record<string, any> }

const r1 = (v: number) => Math.round(v * 10) / 10;
const box = (x: { x: number; y: number; w: number; h: number }) => [Math.round(x.x), Math.round(x.y), Math.round(x.x + x.w), Math.round(x.y + x.h)];

// ── page ──
registerReader({
  id: 'page', owner: 'src/ui/shell/Shell.tsx', order: 10,
  read: ({ app }: Ctx) => ({
    app: '3d', commit: app.build, vw: app.vp.w, vh: app.vp.h, device: app.device, dpr: app.dpr, look: app.look, view: app.view, mode: app.mode,
    patient: app.patient, lens: app.lens, picked: app.picked, deck: app.deck?.id ?? null, slide: app.deck ? app.deck.number : null, sheet: app.sheet,
  }),
  text: (p: any) => [`Screen ${p.vw}×${p.vh} @${p.dpr}x (${p.device}), look ${p.look}, view ${p.view}, patient ${p.patient ?? 'unknown'}, lens ${p.lens}, ${p.deck ? `deck ${p.deck}, slide ${p.slide}` : 'free play (no deck)'}, build ${p.commit}.${p.sheet ? ` A ${p.sheet} sheet is open.` : ''}${p.picked ? ` Picked ${p.picked}.` : ''}`],
});

// ── camera ──
registerReader({
  id: 'camera', owner: 'src/scene/camera/rig.ts', order: 20,
  read: ({ app }: Ctx) => ({ moving: app.camera.moving, placed: app.camera.placed, orbitDeg: app.camera.orbitDeg, zoom: app.camera.zoom, pan: app.camera.pan, stage: app.camera.stage, free: box(app.free) }),
  text: (c: any) => [`Camera ${c.placed ? (c.moving ? 'moving' : 'still') : 'not placed yet'}: orbit ${c.orbitDeg}°, hand zoom ${c.zoom}×, pan ${c.pan[0]}, ${c.pan[1]}; free room [${c.free.join(', ')}] on a ${Math.round(c.stage.w)}×${Math.round(c.stage.h)} stage.`],
});

// ── cards ──
export function cardPart(c: RawCard, ctx: { vp: { w: number; h: number }; fontsLoaded: boolean }) {
  const t = c.texts;
  const size = (role: string) => { const s = t.filter((x) => x.role === role).map((x) => x.px); return s.length ? Math.min(...s) : null; };
  const edge = t.length ? { bottom: Math.max(...t.map((x) => x.bottom)), right: Math.max(...t.map((x) => x.right)), left: Math.min(...t.map((x) => x.left)), top: Math.min(...t.map((x) => x.top)) } : null;
  return {
    id: c.id, phase: c.phase, box: box(c), opacity: c.opacity, title: size('title'), body: size('body'), minPx: t.length ? Math.min(...t.map((x) => x.px)) : null,
    scrollsY: c.scrollsY, scrollsX: c.scrollsX, overflowFlag: c.overflowFlag, fontsLoaded: ctx.fontsLoaded,
    textEdge: edge ? [Math.round(edge.left), Math.round(edge.top), Math.round(edge.right), Math.round(edge.bottom)] : null,
    small: t.filter((x) => x.px < 12).slice(0, 4).map((x) => ({ text: x.text, px: x.px })),
    lines: t.length,
  };
}
registerReader({
  id: 'cards', owner: 'src/ui/cards/CardFrame.tsx', order: 30,
  read: ({ dom, app }: Ctx) => ({ n: dom.cards.length, cards: dom.cards.map((c) => cardPart(c, { vp: app.vp, fontsLoaded: dom.fontsLoaded })), strip: dom.strip ? box(dom.strip) : null }),
  text: (p: any) => p.n ? p.cards.map((c: any) => `Card ${c.id} (${c.phase}) at [${c.box.join(', ')}], opacity ${c.opacity}; title ${c.title ?? '-'} px, words ${c.body ?? '-'} px, smallest ${c.minPx ?? '-'} px${c.scrollsY ? '; it SCROLLS' : ''}${c.scrollsX ? '; it scrolls SIDEWAYS' : ''}.`) : ['No card is up.'],
});

// ── labels ──
export function labelPart(l: RawLabel) { return { name: l.name, kind: l.kind, on: l.on, alpha: l.opacity, box: box(l), tone: l.tone || undefined }; }
registerReader({
  id: 'labels', owner: 'src/scene/labels/LabelLayer.tsx', order: 50,
  read: ({ dom, detail }: Ctx) => {
    const shown = dom.labels.filter((l) => l.on || l.opacity > 0.02);
    return { n: shown.length, shown: (detail === 'full' ? shown : shown.slice(0, 40)).map(labelPart) };
  },
  text: (p: any) => [`${p.n} label${p.n === 1 ? '' : 's'} up${p.n ? `: ${p.shown.slice(0, 12).map((l: any) => `${l.name || l.kind} (${Math.round(l.alpha * 100)}%)`).join(', ')}${p.n > 12 ? ', ...' : ''}` : ''}.`],
});

// ── figure ──
registerReader({
  id: 'figure', owner: 'src/scene/Stage.tsx', order: 60,
  read: ({ app }: Ctx) => ({ patient: app.patient, lens: app.lens, picked: app.picked, status: app.engine.status, day: app.engine.day, running: app.engine.running, readings: Object.fromEntries(Object.entries(app.readings).map(([k, v]) => [k, v == null ? null : r1(v)])) }),
  text: (f: any) => [`Figure: ${f.patient ?? 'no patient'} under the ${f.lens} lens, model ${f.status}${f.running ? ' and running' : ''}; HVPG ${f.readings.hvpg ?? '-'}, WHVP ${f.readings.whvp ?? '-'}, FHVP ${f.readings.fhvp ?? '-'}, portal vein ${f.readings.pv ?? '-'} mmHg.`],
});

// ── the deck (what the presenter says is up) ──
registerReader({
  id: 'deck', owner: 'src/ui/deck/presenter-machine.ts', order: 65,
  read: ({ app }: Ctx) => (app.deck ? { id: app.deck.id, slide: app.deck.number, of: app.deck.of, words: app.deck.words, data: app.deck.data, title: app.deck.title, page: app.deck.page, pages: app.deck.pages } : null),
  text: (d: any) => [`Talk ${d.id}: stop ${d.slide} of ${d.of}, ${d.words} card${d.data ? ` and the ${d.data} card` : ''}${d.title ? `, "${d.title}"` : ''}${d.pages > 1 ? `, page ${typeof d.page === 'number' ? d.page + 1 : d.pages} of ${d.pages}` : ''}.`],
});

// ── accessibility ──
registerReader({
  id: 'a11y', owner: 'src/ui/a11y/describe.ts', order: 85,
  read: ({ dom }: Ctx) => ({ lang: dom.a11y.lang, live: dom.a11y.live, figureName: dom.a11y.figureName, figureDescription: dom.a11y.figureDescription, reduced: dom.a11y.reduced, controls: dom.a11y.focusable, unnamed: dom.a11y.unnamed.slice(0, 12), cues: { n: dom.cues.length, bare: dom.cues.filter((c) => !c.text && !c.named).slice(0, 12).map((c) => ({ el: c.el, tone: c.tone })) } }),
  text: (a: any) => [`Accessibility: lang ${a.lang || 'missing'}, live region ${a.live ? 'present' : 'MISSING'}, figure ${a.figureName ? 'named' : 'UNNAMED'}${a.figureDescription ? ` and described ("${a.figureDescription}")` : ', not yet described'}; Reduce Motion ${a.reduced ? 'on' : 'off'}; ${a.controls} controls, ${a.unnamed.length} without a name; ${a.cues.n} colour cues, ${a.cues.bare.length} with no words behind them.`],
});

// ── the play bar's readouts ──
registerReader({
  id: 'readouts', owner: 'src/ui/shell/PlayBar.tsx', order: 70,
  read: ({ dom }: Ctx) => (dom.readouts.length ? { items: dom.readouts.map((r) => ({ label: r.label, value: r.value, sev: r.sev })) } : null),
  text: (p: any) => [`Readouts: ${p.items.map((r: any) => `${r.label} ${r.value ?? '-'}${r.sev ? ` (${r.sev})` : ''}`).join(', ')}.`],
});

// ── health (volatile: changes between two runs of one state) ──
registerReader({
  id: 'health', owner: 'src/clock/frame.ts', order: 90, volatile: true,
  read: ({ app }: Ctx) => ({ errors: app.errors.count, lastErrors: app.errors.last, gpuMB: app.memory.gpuMB, heapMB: app.memory.heapMB, renderer: app.memory.renderer, frames: app.clock.framesDrawn, awake: app.clock.awake, worstMs: app.clock.worstMs, p95Ms: app.clock.p95Ms, holds: app.clock.holds, engineFrames: app.engine.frames, crash: app.engine.crash }),
  text: (h: any) => [`Health: ${h.errors} caught error${h.errors === 1 ? '' : 's'}${h.gpuMB != null ? `, GPU about ${h.gpuMB} MB (the drawing buffer; an estimate)` : ''}${h.heapMB != null ? `, JS heap ${h.heapMB} MB` : ''}, worst frame ${h.worstMs} ms, p95 ${h.p95Ms} ms, ${h.awake ? `drawing (asked by ${h.holds.join(', ') || '-'})` : 'idle (nothing drawn)'}.${h.crash ? ` ENGINE CRASHED: ${h.crash}` : ''}`],
});

// ── the words on the cards (what a reader of the screen reads; the wording rules judge them) ──
registerReader({
  id: 'words', owner: 'src/ui/cards/CardLayer.tsx', order: 35,
  read: ({ dom, detail }: Ctx) => {
    const lines = dom.cards.filter((c) => c.phase === 'in').flatMap((c) => c.texts.map((t) => t.text));
    return lines.length ? { n: lines.length, lines: detail === 'full' ? lines : lines.slice(0, 60) } : null;
  },
  text: (w: any) => [`${w.n} line${w.n === 1 ? '' : 's'} of words on the cards.`],
});
