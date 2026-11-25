// The lobule's words are 2D's (lobule-zoom-labels.js): three zone names with the Zones layer, the stations with their readings, the lymph only with its layer, each tract name on the side its vessel faces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { APOTHEM, ZONE_Q, ZONE_WORDS, buildLobuleCaptions, labelledTriad, readingText, sidesToward, stationAt } from '../src/scene/lobule/captions.ts';
import { solve } from '../src/scene/labels/solver.ts';

const net = buildLobule();
// the plate as the camera shows it: 600 px across, y down as 2D's
const proj = (x: number, y: number): [number, number] => [400 + x * 300, 300 + y * 300];
const ctx = (layers = { zones: true, lymph: false }, hide = false) => ({ proj, vp: { w: 800, h: 600 }, measure: (t: string) => t.length * 6, net, layers, hide });

test('zone names: 2D\'s words, on the radius to the bottom edge at 0.83, 0.51 and 0.20 of the apothem, only with the Zones layer', () => {
  assert.deepEqual(ZONE_WORDS, [['Zone 1', 'periportal'], ['Zone 2', 'midzonal'], ['Zone 3', 'centrilobular']]);
  assert.deepEqual([...ZONE_Q], [0.83, 0.51, 0.2]);
  const on = buildLobuleCaptions(ctx());
  for (let i = 0; i < 3; i++) {
    const it = on.items.find((x) => x.id === `z:${i + 1}`)!;
    assert.ok(it, `zone ${i + 1}`);
    assert.ok(Math.abs(it.ax - 400) < 1e-6 && Math.abs(it.ay - (300 + APOTHEM * ZONE_Q[i]! * 300)) < 1e-6);
    assert.equal(it.forms[0]!.text, `${ZONE_WORDS[i]![0]} ${ZONE_WORDS[i]![1]}`);
    assert.equal(on.meta.get(`z:${i + 1}`)!.target, `lobule:zone${i + 1}`);
  }
  assert.equal(buildLobuleCaptions(ctx({ zones: false, lymph: false })).items.filter((x) => x.id.startsWith('z:')).length, 0);
});

test('stations: the portal venule, sinusoids and central vein carry a pressure; the arteriole and ductule are named; the lymph only with its layer', () => {
  const c = buildLobuleCaptions(ctx());
  const by = (id: string) => c.meta.get(id)!;
  assert.deepEqual(['triad', 'sin', 'cv', 'ha', 'bd'].map((k) => by(k).read), ['P1', 'P2', 'P3', null, null]);
  assert.equal(by('triad').forms[0]!.name, 'Portal venule');
  assert.equal(by('ha').forms[0]!.name, 'Hepatic arteriole');
  assert.equal(by('bd').forms[0]!.name, 'Bile ductule');
  assert.equal(c.meta.has('lymph'), false);
  const ly = buildLobuleCaptions(ctx({ zones: true, lymph: true }));
  assert.equal(ly.meta.get('lymph')!.forms[0]!.name, 'Hepatic lymph');
  assert.equal(ly.meta.get('lymph')!.read, 'lymph');
});

test('the labelled tract is the lowest on the canvas, and its small vessels name themselves on the side they face', () => {
  const tri = labelledTriad({ proj, net });
  const ys = net.triads.map((t) => proj(t.x, t.y)[1]);
  assert.equal(ys[tri], Math.max(...ys));
  const c = buildLobuleCaptions(ctx(), );
  for (const k of ['ha', 'bd'] as const) {
    const it = c.items.find((x) => x.id === k)!, v = proj(net.triads[tri]![k === 'ha' ? 'x' : 'x'], net.triads[tri]!.y);
    const want = sidesToward(it.ax - v[0], it.ay - v[1]);
    assert.deepEqual(it.dirs, want);
  }
  // the dot of each small vessel is on the vessel
  const at = stationAt(net, tri, 'ha'); assert.deepEqual(at, net.triads[tri]!.ha);
});

test('readings: pressures to a decimal with the minus sign, the lymph as mL a day, "?" when the lobule is unmeasured', () => {
  const m = { P1: 12.34, P2: -0.04, P3: 5, lymph: 2.2 };
  assert.equal(readingText('P1', m, false), '12.3');
  assert.equal(readingText('P2', m, false), '0.0');
  assert.equal(readingText('P3', { ...m, P3: -3.26 }, false), '−3.3');
  assert.equal(readingText('lymph', m, false), '3,170');
  assert.equal(readingText('P1', m, true), '?');
  assert.equal(readingText(null, m, false), '');
});

test('the solver places every caption of the open lobule, none on another', () => {
  const c = buildLobuleCaptions(ctx({ zones: true, lymph: true }));
  const out = solve({ items: c.items, view: { x0: 0, y0: 50, x1: 800, y1: 600 }, blockers: [], lines: [] });
  assert.equal(out.dropped.length, 0, out.dropped.join());
  const boxes = out.placed.map((p) => { const it = c.items.find((x) => x.id === p.id)!; return { id: p.id, x0: it.ax + p.dx, y0: it.ay + p.dy, x1: it.ax + p.dx + p.w, y1: it.ay + p.dy + p.h }; });
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i]!, b = boxes[j]!;
    assert.ok(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0, `${a.id} and ${b.id} overlap`);
  }
});

test('on a slide a lobule pressure carries its unit, in free play the legend says it once', async () => {
  const { readingText, readingSig } = await import('../src/scene/lobule/captions.ts');
  const m = { P1: 12.34, P2: 9.8, P3: 3.2, lymph: 1200 };
  assert.equal(readingText('P1', m, false), '12.3');
  assert.equal(readingText('P1', m, false, true), '12.3 mmHg');
  assert.equal(readingText('P3', m, true, true), '?');
  // capture 2a54261a (Where is the resistance 4 and 6): "Lymph 3,580" was a number with no unit on a slide
  assert.equal(readingText('lymph', m, false), '1,728,000');
  assert.equal(readingText('lymph', m, false, true), '1,728,000 mL/day');
  assert.notEqual(readingSig(m, true), readingSig(m, false), 'the layout is solved again for the wider words');
});

// Lobule 3, capture 52ef8e63: "Zone 3 receives the least oxygen" printed no oxygen. With the oxygen lens each zone's name carries the saturation its colour is read from.
test('with the oxygen lens each zone reads its saturation after its name; with another lens the zones are names alone', () => {
  const on = buildLobuleCaptions({ ...ctx(), oxygen: true });
  assert.deepEqual([1, 2, 3].map((i) => on.meta.get(`z:${i}`)!.read), ['O1', 'O2', 'O3']);
  for (const i of [1, 2, 3]) {
    const m = on.meta.get(`z:${i}`)!;
    assert.deepEqual(m.forms.map((f) => f.value), [true, true, false, false], 'widest forms carry the reading; the plain names are the fall back');
    assert.equal(m.forms[0]!.name, `${ZONE_WORDS[i - 1]![0]} ${ZONE_WORDS[i - 1]![1]}`);
  }
  const model = { P1: 12, P2: 8, P3: 4, lymph: 0, oxy: [0.97, 0.9, 0.62] };
  assert.deepEqual(['O1', 'O2', 'O3'].map((r) => readingText(r as 'O1', model, false)), ['97% O₂', '90% O₂', '62% O₂']);
  assert.equal(readingText('O3', { ...model, oxy: undefined }, false), '—');
  assert.equal(readingText('O3', model, true), '?');
  assert.deepEqual([1, 2, 3].map((i) => buildLobuleCaptions(ctx()).meta.get(`z:${i}`)!.read), [null, null, null]);
});
