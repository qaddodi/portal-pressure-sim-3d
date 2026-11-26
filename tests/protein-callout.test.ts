// Rule (Mohammad, 26 Nov: "for sinusoid view, just callout the sinusoid somewhere with a leader and then move the protein legend to be a callout with a circle next to it"; then "do NOT have it ride
// on a protein particle ... just somewhere in the sinusoid" and "circle beside the word so a learner knows what we're pointing at"): a key entry that names a thing the
// figure draws is a CALLOUT on the
// figure, a name standing in a plate with a leader to a FIXED spot of that thing and the entry's circle beside its word; the top bar keeps only keys that name a scale. This pins the general rule
// (every entry of SINUSOID_CALLOUTS, at every screen size), the Sinusoid's own callout, that nothing follows a particle, and that no legend bar for the sinusoid comes back.
// Pure numbers and source reading, node only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import { namesFree, readings } from '../src/scene/sinusoid/captions.ts';
import { type NameKey, type NamePlacement } from '../src/scene/sinusoid/names.ts';
import { SINUSOID_CALLOUTS, calloutOf } from '../src/scene/sinusoid/legend.ts';
import { regionTree } from '../src/scene/sinusoid/region.ts';
import { MARK_GAP, MARK_PX } from '../src/scene/sinusoid/legend.ts';
import { isPortrait, restScale } from '../src/scene/sinusoid/portrait.ts';
import { freeRoom, layoutClass } from '../src/ui/shell/room.ts';
import type { SinusoidTargets } from '../src/scene/lobule/model.ts';

const targets = (o: Partial<SinusoidTargets> = {}): SinusoidTargets => ({ por: 1, col: 0, bm: 0, mv: 1, act: 0, lum: 1, pinch: 0, v: 1, filt: 1, prot: 1, ...o });
const measure = (_k: NameKey, name: string, value: string): [number, number] => {
  const lines = [...name.split('\n'), ...(value ? value.split(' · ') : [])];
  return [Math.max(...lines.map((l) => l.replace('~', ' ').length)) * 8 + 16, lines.length * 16 + 8];
};
const TEXT = readings({ P1: 17.2, P2: 10, P3: 3.9, lymph: 0.5, lyProt: 0.91 }, 1);
const SIZES: [string, number, number][] = [
  ['Mac 1440x900', 1440, 900], ['Mac 1280x800', 1280, 800], ['iPad landscape', 1024, 768], ['iPad portrait', 768, 1024], ['iPhone 390x844', 390, 844], ['iPhone SE', 375, 667], ['iPhone landscape', 844, 390],
];
function lay(W: number, H: number) {
  const v = new SinusoidView(createShared());
  v.setVisible(true); v.snapTargets(targets()); v.update(0);
  const vp = { w: W, h: H, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
  const room = freeRoom(vp, layoutClass(W < 700 || (W < 900 && H > W)));
  const portrait = isPortrait(W, H); v.setPortrait(portrait);
  const free = namesFree(room, { w: W, h: H }), short = portrait ? room.w : room.h, k = restScale(short);
  const C: [number, number] = [room.x + room.w / 2, room.y + room.h / 2];
  const names = v.names({ W, H, C, k, free, insTop: 56, text: TEXT, lit: new Set(), measure });
  return { v, names, free, k, C, portrait };
}
const box = (n: NamePlacement) => ({ x0: n.cx - n.w / 2, x1: n.cx + n.w / 2, y0: n.cy - n.hh / 2, y1: n.cy + n.hh / 2 });

test('the general rule: every key entry of the sinusoid is a callout, at every screen size: a name off the lumen, in the room, with a short leader that ends in the lumen, each at the same spot every time', () => {
  assert.ok(SINUSOID_CALLOUTS.length >= 1);
  for (const [label, W, H] of SIZES) {
    const L = lay(W, H), keys = SINUSOID_CALLOUTS.map((c) => c.key);
    for (const key of keys) {
      const n = L.names.find((x) => x.key === key);
      assert.ok(n, `${label}: ${key} is named`);
      const b = box(n!), hw = L.k * 5 * 1.03, axis = L.portrait ? L.C[0] : L.C[1];
      const centre = L.portrait ? n!.cx : n!.cy;
      assert.ok(Math.abs(centre - axis) > hw * 0.5, `${label}: ${key} stands off the lumen's middle, in a plate (${centre.toFixed(0)} against the axis ${axis.toFixed(0)})`);
      assert.ok(b.x0 >= L.free.l - 1 && b.x1 <= L.free.r + 1 && b.y0 >= L.free.t - 1 && b.y1 <= L.free.b + 1, `${label}: ${key} inside the room`);
      assert.ok(n!.leader, `${label}: ${key} has a leader`);
      const end = L.portrait ? n!.leader!.x2 : n!.leader!.y2;
      assert.ok(Math.abs(end - axis) < hw, `${label}: ${key}'s leader ends in the lumen (${end.toFixed(0)} against the axis ${axis.toFixed(0)}, half width ${hw.toFixed(0)})`);
      // close to the sinusoid: the leader is short (Mohammad, 26 Nov: "the callout for protein should be closer to the sinusoid"): across the Disse, the lining and the lumen's
      // lower half, and the room the box needs
      const len = Math.hypot(n!.leader!.x2 - n!.leader!.x1, n!.leader!.y2 - n!.leader!.y1), lim = (3.4 + 0.8 + 5) * L.k + (L.portrait ? n!.w : n!.hh) + 40;
      assert.ok(len <= lim, `${label}: ${key}'s leader is short (${len.toFixed(0)} px against ${lim.toFixed(0)})`);
    }
    // (a fixed spot: laid out again, the leader ends where it did, whatever the blood is doing)
    const again = lay(W, H).names;
    for (const key of keys) assert.deepEqual(again.find((x) => x.key === key)!.leader, L.names.find((x) => x.key === key)!.leader, `${label}: ${key}'s leader is fixed`);
    // the callouts keep clear of every other name
    for (const key of keys) for (const o of L.names) {
      if (o.key === key) continue;
      const p = box(L.names.find((x) => x.key === key)!), q = box(o);
      if (L.free.b - L.free.t < 220) continue;   // (a room too short for eleven names: they stay in it)
      assert.ok(!(p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1), `${label}: ${key} and ${o.key} apart`);
    }
  }
});

test('the Protein callout\'s word is the key\'s word, and a tap on it explains it like every other name', () => {
  assert.equal(calloutOf('alb')?.word, 'Protein');
  const L = lay(1440, 900);
  assert.equal(L.names.find((n) => n.key === 'alb')!.name, 'Protein');
});

test('no sinusoid legend bar comes back: nothing the app makes wears .sv-legend, and the top bar draws no Protein word', () => {
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${d}${e.name}/`) : [`${d}${e.name}`]);
  const own = walk('src/').filter((f) => /\.(tsx?|js)$/.test(f) && !f.includes('/engine/') && !f.includes('/debug/'));
  for (const f of own) {
    const t = readFileSync(f, 'utf8');
    assert.doesNotMatch(t, /className=\{?[`'"][^`'"]*\bsv-legend\b/, `${f} makes an sv-legend`);
    assert.doesNotMatch(t, /ProteinLegend|legendOn|SINUSOID_KEY/, `${f} brings back the Protein legend`);
  }
});

test('the Protein\'s circle stands beside its word in the caption itself (so it is measured and moves with the name), painted from the key\'s tokens', () => {
  const co = calloutOf('alb')!, tree = regionTree(co.word, '', null, { fill: co.mark.fill, edge: co.mark.edge, px: MARK_PX });
  assert.equal(tree.length, 1);
  const first = tree[0]!;
  assert.deepEqual(first.kids[0], { tag: 'i', cls: 'sv-mark', style: { '--key-fill': `var(${co.mark.fill})`, '--key-edge': `var(${co.mark.edge})`, '--mark-px': `${MARK_PX}px` }, kids: [] }, 'the circle first');
  assert.equal(first.kids[1], 'Protein', 'then the word');
  assert.equal(regionTree('Lymph', '').length, 1);
  assert.deepEqual(regionTree('Lymph', '')[0]!.kids, ['Lymph'], 'a name that is not a key entry wears no circle');
  const src = readFileSync('src/scene/sinusoid/SinusoidCaptions.tsx', 'utf8');
  assert.match(src, /const co = calloutOf\(key\);/);
  assert.match(src, /regionTree\(name, value, explain === key \? SV_NOTE\[key\] \?\? null : null, co \? \{ fill: co\.mark\.fill, edge: co\.mark\.edge, px: MARK_PX \} : null\)/);
  assert.ok(MARK_PX >= 8 && MARK_GAP > 0);
});

test('nothing rides on a protein particle: no follower, no picker, no circle at a leader\'s end', () => {
  const src = readFileSync('src/scene/sinusoid/SinusoidCaptions.tsx', 'utf8');
  assert.doesNotMatch(src, /ProteinFollow|protein-pick|\.albumin|spriteCount|follow\./);
  assert.doesNotMatch(src, /createElement\('i'\)[^;]*sv-mark/, 'the circle is written inside the caption, not as a mark at the leader\'s end');
  assert.throws(() => readFileSync('src/scene/sinusoid/protein-pick.ts', 'utf8'), /ENOENT/);
});

test('the Sinusoid is no callout: its name and its pressure stand INSIDE the lumen with no leader, as they always did, at every screen size', () => {
  for (const [label, W, H] of SIZES) {
    const L = lay(W, H), sin = L.names.find((n) => n.key === 'sin')!;
    assert.ok(sin, `${label}: named`);
    assert.equal(sin.leader, null, `${label}: no leader`);
    assert.match(sin.value, /^\d/, `${label}: with its pressure`);
    const axis = L.portrait ? L.C[0] : L.C[1], centre = L.portrait ? sin.cx : sin.cy, hw = L.k * 5 * 0.97;
    assert.ok(Math.abs(centre - axis) < hw, `${label}: its middle is inside the lumen (${centre.toFixed(0)} against ${axis.toFixed(0)})`);
  }
  assert.equal(calloutOf('sin'), undefined, 'the Sinusoid is not a key entry');
});
