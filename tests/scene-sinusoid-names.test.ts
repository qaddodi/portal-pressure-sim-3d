// The sinusoid's names (2D: sinusoid-view.js layoutEnds / layoutTags / layoutTall, fen-place.js, label-explain.js hitLabel): where each stands on a wide and a tall screen, level, inside the
// screen and clear of each other, tied to what it names; a tap on a name takes its card. Pure numbers: no DOM, no GPU.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import { type NameKey, type NamePlacement, END_NAMES, SV_NOTE, SV_TARGET, explainHit, targetOf } from '../src/scene/sinusoid/names.ts';
import { restScale } from '../src/scene/sinusoid/portrait.ts';
import { UM } from '../src/scene/sinusoid/layout.ts';
import type { SinusoidTargets } from '../src/scene/lobule/model.ts';

const targets = (o: Partial<SinusoidTargets> = {}): SinusoidTargets => ({ por: 1, col: 0, bm: 0, mv: 1, act: 0, lum: 1, pinch: 0, v: 1, filt: 1, prot: 1, ...o });
/** A name's size in px as a 12 px capitals label would be: 8 px a letter, 16 px a line, the readings a line each. */
const measure = (_k: NameKey, name: string, value: string): [number, number] => {
  const lines = [...name.split('\n'), ...(value ? value.split(' · ') : [])];
  return [Math.max(...lines.map((l) => l.replace('~', ' ').length)) * 8 + 16, lines.length * 16 + 8];
};
const TEXT = { inValue: '17.0~mmHg', outValue: '3.0~mmHg', sin: '10.0~mmHg', fen: '100%~open', lymph: '0.5~L/day · Protein 91%', lymphTall: '0.5~L/day · Protein 91%' };
function layout(W: number, H: number, opt: { act?: number; lit?: string[] } = {}) {
  const v = new SinusoidView(createShared());
  v.setVisible(true); v.snapTargets(targets({ act: opt.act ?? 0 })); v.update(0);
  const portrait = W < H * 0.95;
  v.setPortrait(portrait);
  const free = { l: 12, t: 90, r: W - 12, b: H - 80 }, short = portrait ? free.r - free.l : free.b - free.t, k = restScale(short);
  const C: [number, number] = [(free.l + free.r) / 2, (free.t + free.b) / 2];
  const names = v.names({ W, H, C, k, free, insTop: 70, text: TEXT, lit: new Set(opt.lit ?? []), measure });
  return { names, W, H, C, k, free, portrait, v };
}
const by = (ns: NamePlacement[], key: NameKey) => ns.find((n) => n.key === key)!;
const box = (n: NamePlacement) => ({ x0: n.cx - n.w / 2, x1: n.cx + n.w / 2, y0: n.cy - n.hh / 2, y1: n.cy + n.hh / 2 });
const overlap = (a: NamePlacement, b: NamePlacement) => { const p = box(a), q = box(b); return p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1; };

test('wide: the 2D names across the screen, level, on screen, each key once, none on another', () => {
  for (const [W, H] of [[1440, 900], [1024, 768], [844, 390]] as const) {
    const L = layout(W, H);
    const keys = L.names.map((n) => n.key).sort();
    assert.deepEqual(keys, ['bc', 'disse', 'fen', 'hep', 'hsc', 'in', 'kup', 'lymph', 'out', 'sin'], `${W}x${H}`);
    for (const n of L.names) assert.ok(n.cx - n.w / 2 >= -1 && n.cx + n.w / 2 <= W + 1, `${W}x${H}: ${n.key} inside the screen (${n.cx.toFixed(0)}±${(n.w / 2).toFixed(0)})`);
    assert.equal(by(L.names, 'in').name, END_NAMES[0]); assert.equal(by(L.names, 'out').name, END_NAMES[1]);
    assert.ok(by(L.names, 'in').cx < L.C[0] && by(L.names, 'out').cx > L.C[0], 'the portal venule at the left end, the central vein at the right');
    assert.ok(Math.abs(by(L.names, 'in').cy - L.C[1]) < 1 && Math.abs(by(L.names, 'out').cy - L.C[1]) < 1, 'the ends on the axis');
  }
});

test('wide: the fenestrae pill is clear of the stellate cell\'s name (2D keeps 2 x 16 px at least) and has a callout down to the lining', () => {
  const L = layout(1440, 900), fen = by(L.names, 'fen'), hsc = by(L.names, 'hsc');
  assert.ok(Math.abs(fen.cx - hsc.cx) - fen.w / 2 - hsc.w / 2 >= 32 - 1e-6, `gap ${Math.abs(fen.cx - hsc.cx) - fen.w / 2 - hsc.w / 2}`);
  assert.ok(fen.cy < L.C[1] && hsc.cy < L.C[1], 'the upper plate (2D: y < 0 is up on a wide screen)');
  assert.ok(by(L.names, 'lymph').cy > L.C[1] && by(L.names, 'hep').cy > L.C[1], 'the lymph and the hepatocyte in the lower plate');
  assert.ok(fen.leader, 'a pill above its pore has a leader');
  assert.ok(Math.abs(fen.leader!.x2 - fen.leader!.x1) < 40, 'the leader drops nearly straight');
  assert.ok(by(L.names, 'lymph').leader, 'the lymph is tied up to the space of Disse');
  assert.ok(!overlap(by(L.names, 'fen'), by(L.names, 'hsc')) && !overlap(by(L.names, 'lymph'), by(L.names, 'hep')));
});

test('wide: the activated stellate cell is named so, and a narrower room still places every name', () => {
  assert.equal(by(layout(1440, 900, { act: 1 }).names, 'hsc').name, 'Activated stellate cell');
  assert.equal(by(layout(1440, 900).names, 'hsc').name, 'Stellate cell');
  const narrow = layout(700, 520);
  assert.equal(narrow.names.length, 10);
});

test('tall: top to bottom, every name level, the stellate cell\'s side on the right and the Kupffer cell\'s on the left (2D layoutTall)', () => {
  for (const [W, H] of [[390, 844], [430, 932], [820, 1180]] as const) {
    const L = layout(W, H), n = (k: NameKey) => by(L.names, k);
    assert.deepEqual(L.names.map((x) => x.key).sort(), ['disse', 'fen', 'hep', 'hsc', 'in', 'kup', 'lymph', 'out', 'sin'], `${W}x${H}: no canaliculus unless a slide points at it`);
    assert.ok(n('in').cy < n('sin').cy && n('sin').cy < n('out').cy, 'portal venule at the top, the central vein below');
    assert.ok(Math.abs(n('in').cx - L.C[0]) < 1 && Math.abs(n('out').cx - L.C[0]) < 1, 'the ends on the axis');
    for (const k of ['fen', 'hsc', 'hep'] as const) assert.ok(n(k).cx > L.C[0], `${W}x${H}: ${k} in the right plate`);
    for (const k of ['disse', 'lymph', 'kup'] as const) assert.ok(n(k).cx < L.C[0], `${W}x${H}: ${k} in the left plate`);
    assert.ok(n('fen').cy < n('hsc').cy && n('hsc').cy < n('hep').cy, 'the right column runs fenestrae, stellate cell, hepatocyte');
    assert.ok(n('disse').cy < n('lymph').cy, 'the left column runs Disse, lymph');
    for (const x of L.names) assert.ok(x.cy - x.hh / 2 >= L.free.t - 1 && x.cy + x.hh / 2 <= L.free.b + 1, `${W}x${H}: ${x.key} inside the free room`);
    assert.equal(n('disse').name, 'Space of\nDisse'); assert.equal(n('hsc').name, 'Stellate\ncell');
    for (const k of ['fen', 'hsc', 'disse', 'lymph', 'kup'] as const) assert.ok(n(k).leader || Math.abs(n(k).cx - L.C[0]) < n(k).w, `${k} is tied to what it names`);
  }
});

test('tall: the right column\'s names do not overlap, nor the left\'s, at phone and tablet widths', () => {
  for (const [W, H] of [[390, 844], [430, 932], [820, 1180]] as const) {
    const L = layout(W, H);
    for (const col of [['fen', 'hsc', 'hep'], ['disse', 'lymph', 'kup']] as const) for (let i = 0; i < col.length; i++) for (let j = i + 1; j < col.length; j++) {
      assert.ok(!overlap(by(L.names, col[i]!), by(L.names, col[j]!)), `${W}x${H}: ${col[i]} and ${col[j]}`);
    }
  }
});

test('tall: the bile canaliculus is named only while a slide points at it, in the band between the ends\' names', () => {
  const none = layout(390, 844), lit = layout(390, 844, { lit: ['sinusoid:canaliculus'] });
  assert.ok(!none.names.some((n) => n.key === 'bc'));
  const bc = by(lit.names, 'bc');
  assert.ok(bc, 'named when lit');
  assert.equal(bc.name, 'Bile\ncanaliculus');
  assert.ok(bc.cy - bc.hh / 2 >= by(lit.names, 'in').cy && bc.cy + bc.hh / 2 <= by(lit.names, 'out').cy, 'between the ends');
  assert.ok(bc.cx !== lit.C[0], 'in a plate beside the vessel, not on it');
});

test('a tap on a name takes its card: every name has its note, bile only while it is named, ends too; a miss takes nothing', () => {
  const L = layout(390, 844, { lit: ['sinusoid:canaliculus'] });
  for (const n of L.names) {
    assert.ok(SV_NOTE[n.key], `${n.key} has a note`);
    const hit = explainHit(L.names, n.cx, n.cy);
    assert.ok(hit && hit.key === n.key, `${n.key} hit at its centre`);
    assert.equal(hit!.target, targetOf(n.key));
  }
  const fen = by(L.names, 'fen');
  assert.ok(explainHit(L.names, fen.cx + fen.w / 2 + 6, fen.cy)?.key === 'fen', '8 px of slop');
  assert.equal(explainHit(L.names, -50, -50), null);
  assert.equal(targetOf('hep'), 'sinusoid:hepatocyte'); assert.equal(targetOf('bc'), 'sinusoid:canaliculus'); assert.equal(targetOf('disse'), 'sinusoid:disse');
  assert.equal(SV_TARGET.sin, 'lumen');
  assert.ok(UM.lum > 0);
});

test('wide, panned up: a name whose tissue has left the free room stands aside instead of being held over other tissue (the lower plate\'s names never sit in the lumen over the Kupffer cell)', () => {
  const W = 1440, H = 900;
  const v = new SinusoidView(createShared());
  v.setVisible(true); v.snapTargets(targets()); v.update(0);
  const free = { l: 12, t: 90, r: W - 12, b: H - 80 }, k = restScale(free.b - free.t) * 2.2;
  // the axis well down the screen: the lower plate is under the room's foot
  const C: [number, number] = [W / 2, free.b - 3 * k];
  const names = v.names({ W, H, C, k, free, insTop: 70, text: TEXT, lit: new Set(), measure });
  const keys = new Set(names.map((n) => n.key));
  for (const kk of ['hep', 'bc', 'lymph'] as NameKey[]) assert.ok(!keys.has(kk), `${kk}: its tissue is off the room, so its name is not drawn`);
  assert.ok(keys.has('sin') && keys.has('in') && keys.has('out'), 'what is on screen keeps its name');
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) assert.ok(!overlap(names[i]!, names[j]!), `${names[i]!.key} clear of ${names[j]!.key}`);
});
