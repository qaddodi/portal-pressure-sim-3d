// A figure label is drawn as the 2D app draws it (owner, 19 Nov: "the labeling system font outline etc should also reflect the 2D app"):
// no backing, a small name, a large bold reading, a halo in the look's own colour, a thin leader to a small ring, uppercase spaced organ names.
// The numbers are copied from the 2D source by scripts/copy-label-names.mjs (compared with it when PPS_2D_DIR names a checkout); these tests hold
// the 3D side to the copied numbers: sizes, line, gaps, halo, ring, per-look ink, and a stylesheet that carries no figure of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { LABEL_NAMES } from '../src/scene/labels/names.copied.ts';
import { LS, fontPx, fluid, roleOf, lineSize, boxSize, stationRuns, organRun, baselineAt, haloPx, typeVars, lookVars } from '../src/scene/labels/type.ts';
import { LabelController, NO_STATE, type LabelDeps } from '../src/scene/labels/controller.ts';
import { STATIONS } from '../src/scene/labels/stations.ts';
import { LOOKS, LOOK_IDS } from '../src/looks/looks.ts';

const PHONE = { w: 390, h: 844 }, LAPTOP = { w: 1440, h: 900 };
const measure = (t: string, size: number, _w: number, track = 0) => t.length * size * 0.5 + track * t.length;

test('type sizes are the 2D roles: names 12 to 14 px, readings 16 to 22, units and organ captions 12, by the screen\'s short side', () => {
  assert.equal(roleOf(LS.NAME.size), 'lab'); assert.equal(roleOf(LS.VALUE.size), 'val'); assert.equal(roleOf(LS.UNIT.size), 'cap');
  assert.equal(roleOf(LS.ORGAN.size), 'cap'); assert.equal(roleOf(LS.REVERSED.size), 'lab');
  assert.equal(fluid(PHONE), 0); assert.equal(fluid(LAPTOP), 1);
  assert.equal(fontPx(LS.NAME.size, PHONE), 12); assert.equal(fontPx(LS.NAME.size, LAPTOP), 14);
  assert.equal(fontPx(LS.VALUE.size, PHONE), 16); assert.equal(fontPx(LS.VALUE.size, LAPTOP), 22);
  assert.equal(fontPx(LS.ORGAN.size, PHONE), 12); assert.equal(fontPx(LS.ORGAN.size, LAPTOP), 12);
  const mid = fontPx(LS.VALUE.size, { w: 600, h: 900 });
  assert.ok(mid > 16 && mid < 22, 'between a phone and a laptop it grows with the short side');
});

test('a station line: name small, reading large, a gap that scales with the label size, height 1.24 of its tallest run, then the 2D padding', () => {
  const runs = stationRuns('Portal vein', true, false);
  assert.deepEqual(runs.map((r) => r.kind), ['name', 'val']);
  assert.equal(runs[1].text, '00.0', 'laid out at its widest, so a ticking value keeps its box');
  const { w, h } = lineSize(runs, LAPTOP, measure);
  const nameW = measure('Portal vein', 14, 0), valW = measure('00.0', 22, 0);
  assert.ok(Math.abs(w - (nameW + valW + LS.NAME_TO_VALUE * LS.LABEL_K)) < 1e-9);
  assert.ok(Math.abs(h - 22 * LS.LINE_H) < 1e-9, 'as tall as its tallest run (the reading)');
  const b = boxSize(runs, LAPTOP, measure);
  assert.equal(b.w, w + 2 * LS.PAD.x); assert.equal(b.h, h + 2 * LS.PAD.y);
  assert.ok(Math.abs(baselineAt(b.h, b.padY) - (LS.PAD.y + LS.BASELINE * h)) < 1e-9);
  const rev = lineSize(stationRuns('Portal vein', true, true), LAPTOP, measure).w;
  assert.ok(Math.abs(rev - (w + measure('⟲', 14, 0) + LS.REVERSED.gap * LS.LABEL_K)) < 1e-9, 'the reversal mark follows the reading');
});

test('an organ name is uppercase, small, spaced, and centred on its organ with its own padding', () => {
  const r = organRun('Stomach');
  assert.equal(r.text, 'STOMACH'); assert.equal(r.track, LS.ORGAN.track); assert.equal(r.weight, LS.ORGAN.weight);
  const b = boxSize([r], LAPTOP, measure, true);
  assert.equal(b.padX, LS.ORGAN.padX); assert.equal(b.padY, LS.ORGAN.padY);
  assert.ok(Math.abs(b.w - (measure('STOMACH', 12, 0, LS.ORGAN.track * 12) + 2 * LS.ORGAN.padX)) < 1e-9);
});

test('the layer carries the 2D sizes, weights, gaps, halo, ring and leader as properties, and the halo grows with the label size', () => {
  const v = typeVars(LAPTOP);
  assert.equal(v['--lb-f-name'], '14px'); assert.equal(v['--lb-f-val'], '22px'); assert.equal(v['--lb-f-organ'], '12px');
  assert.equal(v['--lb-w-name'], '600'); assert.equal(v['--lb-w-val'], '650');
  assert.equal(haloPx(), Math.max(2, 3 * LS.LABEL_K)); assert.equal(v['--lb-halo-w'], '4.5px');
  assert.equal(v['--lb-ring'], `${Math.round((LS.RING.r * 2 + LS.RING.stroke) * 100) / 100}px`);
  assert.equal(v['--lb-lead-w'], '1px'); assert.equal(v['--lb-g-val'], '6px');
  assert.equal(typeVars(PHONE)['--lb-f-val'], '16px');
});

test('each look\'s label ink, halo, leader and ring are the 2D look\'s, and the 3D look\'s own text inks are the same colours', () => {
  const fold = (c: string) => c.toLowerCase().replace(/\s+/g, '');
  for (const id of LOOK_IDS) {
    const t = (LS.LOOKS as Record<string, Record<string, string>>)[id], v = lookVars(id, LAPTOP), look = LOOKS[id];
    assert.equal(v['--lb-halo'], t['label-halo']); assert.equal(v['--lb-leader'], t['leader']); assert.equal(v['--lb-rev'], t['flow-reversed']);
    assert.equal(v['--lb-name'], t['text-2']); assert.equal(v['--lb-val'], t['text']);
    assert.equal(fold(look.text), fold(t['text']), `${id}: the 3D look's text is the 2D look's`);
    assert.equal(fold(look.text2), fold(t['text-2']), `${id}: text 2`);
    assert.equal(fold(look.text3), fold(t['text-3']), `${id}: text 3`);
    assert.match(t['label-halo'], /^rgba\(/, `${id}: the halo is translucent, as 2D's`);
  }
  assert.match(lookVars('dark', PHONE)['--lb-organ'], /^color-mix\(in srgb, .* 68%, /, 'on a phone the organ names step back in ink');
  assert.equal(lookVars('dark', LAPTOP)['--lb-organ'], (LS.LOOKS as Record<string, Record<string, string>>).dark['text-3']);
  assert.throws(() => lookVars('nonsense', LAPTOP), /no label ink/);
});

test('the stylesheet draws a station without a backing and holds no size, weight, opacity or colour of its own for it', () => {
  const css = readFileSync('src/scene/labels/labels.css', 'utf8');
  const a = css.indexOf("/* ── a station's label"), b = css.indexOf('/* ── a reading card');
  const sec = css.slice(a, b);
  assert.ok(a > 0 && b > a);
  assert.ok(!/background:\s*var\(--(glass|surface)/.test(sec.replace(/\.lb-anchor[^}]*\}/, '')), 'no pill backing on a station');
  assert.ok(!/\bborder(-radius)?:/.test(sec.replace(/\.lb-anchor[^}]*\}/, '')), 'no pill border');
  assert.ok(!/(font-size|font-weight):\s*\d/.test(sec), 'sizes and weights come from the 2D values the layer writes');
  assert.ok(!/opacity:\s*0?\.\d/.test(sec), 'no opacity of its own (the dim value is alpha.ts\'s)');
  assert.match(sec, /-webkit-text-stroke: var\(--lb-halo-w\) var\(--lb-halo\); paint-order: stroke fill/, 'every letter has the look\'s halo, drawn under the fill');
  assert.match(sec, /\.lb\[data-region\] \.lb-name \{[^}]*letter-spacing: var\(--lb-track-organ\)/);
  const src = readFileSync('src/scene/labels/LabelLayer.tsx', 'utf8');
  assert.ok(!/lb-dot/.test(src + css), 'the coloured dot of the old pill is gone');
});

// ── on the figure: a ring on every station's vessel, a leader only when the words stand away ──
function controller(over: Partial<LabelDeps> = {}) {
  const deps: LabelDeps = {
    now: () => 0, project: () => ({ x: 0, y: 0 }), cameraMoving: () => false, free: () => ({ x0: 0, y0: 0, x1: 1, y1: 1 }), view: () => ({ x0: 0, y0: 0, x1: 1, y1: 1 }),
    blockers: () => [], measure, vp: () => LAPTOP, reversed: () => false, pressure: () => 10, reading: () => null, cathere: (_t: Vector3, _a: Vector3) => 0, ...over,
  };
  return new LabelController(deps);
}

test('a station\'s forms are its 2D line and padding, widest first: name and reading, short name and reading, reading alone', () => {
  const ctl = controller();
  const pv = STATIONS.find((s) => s.id === 'CONF')!;
  const forms = ctl.stationForms(pv);
  assert.ok(forms.length >= 2 && forms[0].w > forms[forms.length - 1].w);
  const full = boxSize(stationRuns(pv.name, true, false), LAPTOP, measure);
  assert.ok(Math.abs(forms[0].w - Math.ceil(full.w * 100) / 100) < 1e-9 && Math.abs(forms[0].h - Math.ceil(full.h * 100) / 100) < 1e-9);
  const alone = forms[forms.length - 1];
  assert.equal(alone.text, '');
  assert.ok(alone.w < forms[0].w);
  assert.ok(ctl.stationForms(pv, true)[0].w > forms[0].w, 'a reversed station has room for its mark');
  const organ = STATIONS.find((s) => s.kind === 'organ')!;
  assert.equal(ctl.stationForms(organ)[0].text, organ.name.toUpperCase());
  ctl.invalidateForms();
  const phone = controller({ vp: () => PHONE });
  assert.ok(phone.stationForms(pv)[0].h < forms[0].h, 'forms follow the screen: the reading is smaller on a phone');
});

test('the 2D label words and type numbers in the copied file are the ones the 3D labels use (no second copy)', () => {
  const src = readFileSync('src/scene/labels/type.ts', 'utf8');
  assert.ok(!/\b(11\.5|650|1\.24|0\.78)\b/.test(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'type.ts holds no 2D number: all come from LABEL_STYLE');
  assert.equal(LABEL_NAMES.LABEL_STYLE.NAME.size, 11.5);
});
