// The scope ring and its lens (audit 22 Nov, area E item 7): the 2D rule (scope-lens-rule.js, copied as it is) picks the slides in every deck, the ring is the scene's GPU quad in world units that eases in and out,
// the gate keeps it up through a patient loading, and the lens opens in free space. Pure: no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { copiedOf } from '../src/decks/hp/deck.ts';
import { stopsOf, viewAt } from '../src/ui/deck/presenter-machine.ts';
import { wantOf } from '../src/ui/scope/scope-want.ts';
import { stepGate, newGate, GONE_MS } from '../src/ui/scope/scope-gate.ts';
import { captionOf } from '../src/ui/scope/scope-caption.ts';
import { RING, BADGE_R, badgeAt, scopeLensFor, scopeGrows, placeLens, lensFits, lensCentre, coneLines, ringHit } from '../src/scene/disease/copied/scope-lens-rule.js';
import { ScopeRing, RING_VS, RING_FS, RING_Z, type ScopeRingScreen } from '../src/scene/disease/scope-ring.ts';
import { UNITS_PER_SCENE as U, x3, y3 } from '../src/scene/frame2d.ts';
import type { Deck } from '../src/decks/schema.ts';

const ids = UI.decks.map((d) => d.id);
const decks: { id: string; deck: Deck }[] = [];
for (const id of ids) { const deck = await loadBuiltin(id); if (deck && copiedOf(id)) decks.push({ id, deck }); }

/** The position that shows slide `i` itself (past its case card, when it has one). */
function slidePos(deck: Deck, i: number) {
  const stops = stopsOf(deck), stop = stops.findIndex((s) => s.kind === 'slide' && s.slide === deck.slides[i]);
  let beat = 0;
  if (viewAt(stops, { stop, beat }).words === 'case') beat = 1;
  return { stops, pos: { stop, beat } };
}

test('every slide the 2D rule picks gets the ring, in every deck; no other does', () => {
  let picked = 0, slides = 0;
  const per: Record<string, number> = {};
  for (const { id, deck } of decks) {
    const src = copiedOf(id)!.slides;
    deck.slides.forEach((s, i) => {
      const c = src[i]!, { stops, pos } = slidePos(deck, i), w = wantOf(stops, pos, id);
      slides++;
      const rule = !!scopeLensFor(c);
      if (viewAt(stops, pos).words === 'case') return;   // (a case card that could not be left: nothing measured yet)
      assert.equal(w.want, rule, `${id}/${s.id}: the ring follows the 2D rule`);
      assert.equal(w.grows, rule && !!scopeGrows(c), `${id}/${s.id}: grows`);
      assert.equal(w.auto, rule && (c as { procedure?: unknown }).procedure === 'evl', `${id}/${s.id}: the lens opens by itself on the EVL slides and nowhere else`);
      if (rule) { picked++; per[id] = (per[id] ?? 0) + 1; }
    });
  }
  assert.ok(slides >= 508, `slides read (${slides})`);
  assert.ok(picked >= 20, `the rule picks slides across the decks (${picked})`);
  assert.ok((per['variceal-bleed'] ?? 0) >= 8, `the variceal bleed deck has the ring on its varix slides (${per['variceal-bleed']})`);
  assert.ok(Object.keys(per).length >= 4, `in several decks: ${Object.keys(per).join(', ')}`);
});

test('the rule: an author says no, a card that is the scope, a visual or a table never; a lapse grows the varices', () => {
  assert.equal(scopeLensFor({ cam: 'varices' }), true);
  assert.equal(scopeLensFor({ cam: 'varices', scopeLens: false }), false);
  assert.equal(scopeLensFor({ cam: 'varices', tool: { kind: 'scope' } }), false);
  assert.equal(scopeLensFor({ cam: 'varices', visual: 'table' }), false);
  assert.equal(scopeLensFor({ cam: 'play', scopeLens: true }), true);
  assert.equal(scopeLensFor({ cam: 'play', labels: ['VAR'] }), true);
  assert.equal(scopeLensFor({ cam: 'play', calipers: ['varix'] }), true);
  assert.equal(scopeLensFor({ cam: 'play', mark: { edges: ['C1a'] } }), true);
  assert.equal(scopeLensFor({ cam: 'play' }), false);
  assert.equal(scopeGrows({ lapse: {} }), true);
  assert.equal(scopeGrows({ cam: 'varices' }), false);
});

test('a slide written for 3D (no copied 2D slide) is asked the same rule', () => {
  const deck = { id: 'native', title: 't', slides: [{ id: 'a', kicker: '', title: '', line: '', notes: '', shot: 'varices' }, { id: 'b', kicker: '', title: '', line: '', notes: '', shot: 'play', scene: { labels: ['VAR'] } }, { id: 'c', kicker: '', title: '', line: '', notes: '', shot: 'play' }] } as unknown as Deck;
  const stops = stopsOf(deck), at = (i: number) => wantOf(stops, { stop: stops.findIndex((s) => s.kind === 'slide' && s.slide === deck.slides[i]), beat: 0 }, deck.id);
  assert.equal(at(0).want, true); assert.equal(at(1).want, true); assert.equal(at(2).want, false);
  assert.equal(wantOf(stops, { stop: 0, beat: 0 }, deck.id).want, false, 'the title stop has no ring');
});

test('the gate: on at once, off only after the varices have been gone for the wait, never under an open lens, a balloon takes it at once', () => {
  const on = { want: true, grows: false, present: true, gastric: false, open: false };
  let r = stepGate(newGate(), on, 0);
  assert.equal(r.gate.has, true);
  // a size crossing the cut-off with the beat: the ring stays through the wait
  r = stepGate(r.gate, { ...on, present: false }, 100);
  assert.equal(r.gate.has, true); assert.ok(r.wake && r.wake > 0 && r.wake <= GONE_MS);
  r = stepGate(r.gate, { ...on, present: true }, 400);
  assert.equal(r.gate.goneAt, null, 'the wait starts again');
  r = stepGate(r.gate, { ...on, present: false }, 500);
  r = stepGate(r.gate, { ...on, present: false }, 500 + GONE_MS + 1);
  assert.equal(r.gate.has, false, 'gone after the wait');
  // an open lens holds the ring
  let g = stepGate(newGate(), on, 0).gate;
  g = stepGate(g, { ...on, present: false, open: true }, 10).gate;
  const held = stepGate(g, { ...on, present: false, open: true }, 10 + GONE_MS + 5);
  assert.equal(held.gate.has, true);
  // a balloon: at once, and it shuts a lens
  const b = stepGate(stepGate(newGate(), on, 0).gate, { ...on, gastric: true, open: true }, 5);
  assert.equal(b.gate.has, false); assert.equal(b.close, true);
  // a slide where the varices grow: the ring stands from the first frame with none yet
  assert.equal(stepGate(newGate(), { ...on, grows: true, present: false }, 0).gate.has, true);
  // a slide that does not want it: never, and a lens left open shuts
  const n = stepGate(stepGate(newGate(), on, 0).gate, { ...on, want: false, open: true }, 1);
  assert.equal(n.gate.has, false); assert.equal(n.close, true);
  assert.equal(stepGate(newGate(), { ...on, want: false }, 0).gate.has, false);
});

test('the gate after banding: the varices are gone (present turns false) and the ring and the open lens stay for the whole slide visit', () => {
  const on = { want: true, grows: false, present: true, gastric: false, open: false };
  let g = stepGate(newGate(), on, 0).gate;
  g = stepGate(g, { ...on, present: false, open: true }, 3000).gate;
  for (let t = 4000; t < 30000; t += 1000) { const r = stepGate(g, { ...on, present: false, open: true }, t); g = r.gate; assert.equal(r.gate.has, true, `still standing at ${t}`); assert.equal(r.close, false); }
});

test('the lens opens by itself, once for each visit, after the camera has held still, and a lens the viewer shut stays shut', () => {
  const src = readFileSync(new URL('../src/ui/scope/ScopeLens.tsx', import.meta.url), 'utf8');
  assert.match(src, /if \(!L\.auto \|\| L\.autoDone \|\| L\.open\) return;/, 'only the slides that ask, once, never over an open lens');
  assert.match(src, /clock\.now\(\) - L\.ringMoved < STILL_MS/, 'the camera is held still for STILL_MS first');
  assert.match(src, /L\.autoDone = true;\s*openRef\.current\(\)/, 'it asks the lens to open once, by the lens\'s own open (placeLens keeps it off the cards, and open() refuses a ring that is not there)');
  assert.match(src, /clock\.cancel\(L\.autoT\); L\.autoT = null; L\.autoDone = false;/, 'a new visit to the slide asks again');
  assert.doesNotMatch(src.slice(src.indexOf('const close = ')), /autoDone = false/, 'shutting the lens never re-arms it');
});

test('the caption: the grade, the bleed, the bands', () => {
  assert.equal(captionOf({ metrics: { varix: { present: false } } }), 'No varices');
  assert.equal(captionOf({ metrics: { varix: { present: true, grade: { label: 'Small' } } } }), 'Small varices');
  assert.equal(captionOf({ metrics: { varix: { present: true, grade: { label: 'Large' } } }, bleed: { active: true, site: 'VAR' } }), 'Large varices · bleeding');
  assert.equal(captionOf({ metrics: { varix: { present: true, grade: { label: 'Large' } } }, bands: 2 }), 'Large varices · banded');
  assert.equal(captionOf(null), 'No varices');
});

test('the lens opens in free space beside the ring, clear of the cards and the bleed; it keeps its place while it fits', () => {
  const ring = { x: 600, y: 300, r: 30 }, bounds = { l: 0, t: 0, r: 1000, b: 700 };
  const card = { l: 700, t: 0, r: 1000, b: 700 }, bleed = { l: 560, t: 380, r: 700, b: 520 };
  const L = placeLens(ring, bounds, [card, bleed], 100)!;
  assert.ok(L && lensFits(L.x, L.y, L.r, bounds, [card, bleed]), 'free');
  assert.ok(L.x + L.r <= card.l, 'left of the card');
  // the camera carries the ring: the lens keeps its direction and gap
  const A = { ux: (L.x - ring.x) / Math.hypot(L.x - ring.x, L.y - ring.y), uy: (L.y - ring.y) / Math.hypot(L.x - ring.x, L.y - ring.y), R: L.r, gap: Math.hypot(L.x - ring.x, L.y - ring.y) - ring.r - L.r };
  const c = lensCentre({ x: 0, y: 0 }, ring, A);
  assert.ok(Math.abs(c.x - L.x) < 1.5 && Math.abs(c.y - L.y) < 1.5);
  const z = lensCentre({ x: 0, y: 0 }, { x: 600, y: 300, r: 60 }, A);
  assert.ok(Math.hypot(z.x - 600, z.y - 300) > Math.hypot(c.x - 600, c.y - 300), 'a zoom takes the lens further out so they never overlap');
  assert.equal(coneLines({ x: 0, y: 0, r: 5 }, { x: 0, y: 0, r: 20 }), null, 'one circle holds the other');
  assert.equal(ringHit(600, 300, { x: 600, y: 300, r: 3, bx: 610, by: 290, br: 1 }), true);
  assert.equal(ringHit(600 + 40, 300, { x: 600, y: 300, r: 3, bx: 700, by: 290, br: 1 }), false);
});

test('the ring is one quad in world units drawn by the GPU: it faces the camera, its line is never under a pixel and a half, nothing is drawn by the page', () => {
  assert.ok(!RING_VS.includes('${') && !RING_FS.includes('${'), 'the shader source is complete');
  assert.ok(RING_VS.includes('viewMatrix') && RING_VS.includes('modelMatrix'), 'placed in the world, turned to the camera');
  assert.ok(RING_FS.includes('fwidth'), 'a line is held to the pixel');
  assert.ok(RING_FS.includes('uSolid') && RING_FS.includes('16.0'), '16 dashes that close into a line');
  const r = new ScopeRing();
  assert.deepEqual(r.state(), { alpha: 0, solid: 0, visible: false }, 'not drawn until asked for');
  r.set(true, false);
  const seen: number[] = [];
  for (let i = 0; i < 80; i++) { r.step(0.016); seen.push(r.state().alpha); }
  assert.ok(seen[0]! > 0 && seen[0]! < 0.3, `it eases in, never pops (${seen[0]})`);
  assert.ok(seen.every((a, i) => i === 0 || a >= seen[i - 1]!), 'monotone');
  assert.equal(r.state().alpha, 1);
  assert.equal(r.state().solid, 0, 'dashed while closed');
  r.set(true, true);
  for (let i = 0; i < 80; i++) r.step(0.016);
  assert.equal(r.state().solid, 1, 'solid while its lens is open');
  r.setFade(0.5); assert.equal(r.state().alpha, 0.5, 'the body dissolving takes it with it');
  r.setFade(0); assert.equal(r.state().visible, false);
  r.setFade(1);
  r.set(false, false);
  for (let i = 0; i < 120; i++) r.step(0.016);
  assert.deepEqual(r.state(), { alpha: 0, solid: 0, visible: false }, 'it eases out');
  r.dispose();
});

test('the ring on the screen: its radius is the 2D ring\'s in the figure\'s units, whatever the zoom; the badge is on its upper-right edge; the bleed patch is a rectangle', () => {
  const r = new ScopeRing(), body = new Group();
  body.add(r.group); body.updateMatrixWorld(true);
  for (const sc of [100, 400, 1500]) {
    const out: ScopeRingScreen = { x: 0, y: 0, r: 0, bx: 0, by: 0, br: 0, bleed: { l: 0, t: 0, r: 0, b: 0 } };
    const project = (p: Vector3, o: { x: number; y: number }) => { o.x = 500 + p.x * sc; o.y = 400 - p.y * sc; return o; };
    const res = r.screen(project, (p) => body.localToWorld(p.clone()), new Vector3(1, 0, 0), out)!;
    assert.ok(res, 'on the screen');
    assert.ok(Math.abs(res.x - (500 + x3(RING.x) * sc)) < 1e-6 && Math.abs(res.y - (400 - y3(RING.y) * sc)) < 1e-6, 'centre');
    assert.ok(Math.abs(res.r - (RING.r / U) * sc) < 1e-6, `radius at ${sc}`);
    assert.ok(Math.abs(res.br - (BADGE_R / U) * sc) < 1e-6, 'badge radius');
    const b = badgeAt();
    assert.ok(res.bx > res.x && res.by < res.y, 'badge at the upper right');
    assert.ok(Math.abs(res.bx - (500 + x3(b.x) * sc)) < 1e-6);
    assert.ok(res.bleed.r > res.bleed.l && res.bleed.b > res.bleed.t);
    assert.ok(res.bleed.t > res.y, 'the bleed patch is below the ring');
  }
  assert.equal(RING_Z, 0.36, 'the ring stands in the plane the bleed leaves the varix in');
  r.dispose();
});

// ── the lens draws the scope (22 Nov, the owner's screenshot of 288976dd: a flat red disc) ──
import { readFileSync } from 'node:fs';
import { scopeFrame } from '../src/ui/tests/endo/frame.ts';
import { FieldMotion } from '../src/ui/tests/endo/motion.ts';
import { paletteOf } from '../src/ui/charts/palette.ts';
import { curveOf } from '../src/scene/labels/stations.ts';
import { scopeClaims, clearParam, circleBox, unionBox } from '../src/scene/labels/scope-claims.ts';
import { VARIX_CALIPERS } from '../src/scene/labels/figure-cards.ts';

/** The last value a stylesheet gives `prop` to exactly `selector`, files read in the order the page loads them. */
function cascade(files: string[], selector: string, prop: string): string | null {
  let v: string | null = null;
  for (const f of files) {
    const css = readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!m[1]!.split(',').some((s) => s.trim() === selector)) continue;
      const d = m[2]!.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`));
      if (d) v = d[1]!.trim();
    }
  }
  return v;
}
const SHEETS = ['css2d/app-11-deck-visuals.css', 'deck-ui.css'];

test('the lens never changes its box by a transform: a chart measures its box by its rect, so a scaled disc drew the scope at a fraction of the lens', () => {
  for (const sel of ['.pz-lens', '.pz-lens.on', '.pz-lens-disc', '.pz-lens.on .pz-lens-disc', '.pz-lens .pz-lens-inst']) {
    for (const prop of ['transform', 'scale', 'zoom']) {
      const v = cascade(SHEETS, sel, prop);
      assert.ok(v == null || v === 'none' || v === '1' || !/scale|0?\.\d/.test(v), `${sel} { ${prop}: ${v} } would shrink the scope's box while the lens opens`);
    }
  }
  assert.match(cascade(SHEETS, '.pz-lens-disc', 'clip-path') ?? '', /^circle\(/, 'it grows out of the ring by a clip');
  assert.match(cascade(SHEETS, '.pz-lens.on .pz-lens-disc', 'clip-path') ?? '', /^circle\(100%/, 'and ends as the whole disc, shadow and all');
});

test('the scope is drawn whole at the lens\'s size: the clip, the bezel and the field it is shaded over', () => {
  const m = new FieldMotion();
  for (let t = 1000; t < 4000; t += 50) m.step({ d: 7.3, ratio: 1.2, bands: 0, snap: false }, t);
  for (const size of [140, 300]) {
    const f = scopeFrame({ field: m.state, over: { balloon: 0, jet: 0, pool: 0, seconds: 1, tearGrow: m.state.g } }, size, paletteOf('light'));
    assert.equal(f.w, size); assert.equal(f.h, size);
    const clip = f.shapes.find((s) => s.k === 'clip') as { r: number } | undefined, bezel = f.shapes.filter((s) => s.k === 'circle' && 'pen' in s);
    assert.ok(clip && Math.abs(clip.r - (size / 2 - 4)) < 1e-9, 'the lumen fills the lens');
    assert.ok(bezel.length >= 1, 'the bezel');
  }
});

test('the ruler across the varices stands clear of the ring and its badge, above it; the names and callouts keep off the ring and an open lens', () => {
  assert.ok(VARIX_CALIPERS.has('varix') && VARIX_CALIPERS.has('C1a'));
  const curve = curveOf('C1a')!, p = new Vector3(), centre = { x: x3(RING.x), y: y3(RING.y) }, clear = (RING.r + BADGE_R + 4) / U;
  const at = (t: number, o: { x: number; y: number }) => { curve.getPointAt(t, p); o.x = p.x; o.y = p.y; };
  const mid = { x: 0, y: 0 }; at(0.5, mid);
  assert.ok(Math.hypot(mid.x - centre.x, mid.y - centre.y) < clear, 'the middle of the varix vessel is inside the ring: the overlap the owner saw');
  const t = clearParam(at, centre, clear);
  const q = { x: 0, y: 0 }; at(t, q);
  assert.ok(Math.hypot(q.x - centre.x, q.y - centre.y) >= clear, 'the ruler is clear');
  assert.ok(q.y > centre.y, 'above the ring (the tear and the stream into the stomach are below it)');
  assert.ok(t > 0.5 && t < 0.8, `a short way along (${t})`);
  assert.equal(clearParam(at, { x: 99, y: 99 }, 0.1), 0.5, 'already clear: the middle, unmoved');
  // the claims
  assert.deepEqual(scopeClaims.boxes, []);
  const ring = unionBox(circleBox(100, 100, 30, 5), circleBox(130, 70, 10, 5));
  assert.ok(ring.x0 <= 65 && ring.x1 >= 145 && ring.y0 <= 65 && ring.y1 >= 135);
  scopeClaims.set([ring]); assert.equal(scopeClaims.boxes.length, 1);
  scopeClaims.set([]); assert.equal(scopeClaims.boxes.length, 0);
  scopeClaims.setWants(true); assert.equal(scopeClaims.wantsRing, true); scopeClaims.setWants(false);
});
