// The Circuit's line widths are 2D's own (stage-tubes.js widthAt at t = 1, circBoost): the map's lines were drawn with the body's radius, which on the map's scale (1 scene unit to
// 1 / MAP_K figure units, not 1 to 300) is about half as wide against the lanes, so the Circuit on an iPhone drew hairlines (20 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { circuitWidthMap, circuitBranchWidth, CIRC_ARTERY, CIRC_BED, MIN_PX } from '../src/scene/circuit/width.ts';
import { circBoostOf, mapPxPerUnit, MAP_K } from '../src/scene/circuit/map.ts';
import { circuitWidth } from '../src/scene/vessels/vessel-object.ts';
import { treeCircW } from '../src/scene/circuit/tubes.ts';
import { halfWidthPx } from '../src/scene/circuit/cap-width.ts';
import { vesselPx, NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { ART_CIRC, circuitShot } from '../src/scene/circuit/shots.ts';
import { buildCaptions, type CapCtx } from '../src/scene/circuit/captions.ts';
import { CIRCUIT_D, CIRCUIT_NODES, LANE_CAPTIONS } from '../src/scene/circuit/data.copied.ts';
import { courseOf } from '../src/scene/circuit/paths.ts';

test('2D\'s widths on the map: a vein clamp(vesselPx * 0.95, 6, 15) and the boost, an artery 3, a bed 8 and the boost, a branch at least 1.2', () => {
  assert.equal(circuitWidthMap(0, 12, 1), Math.min(15, vesselPx(12) * 0.95));
  assert.equal(circuitWidthMap(0, 0.5, 1), 6, 'a thin vein is held at 6');
  assert.equal(circuitWidthMap(0, 40, 1), 15, 'a wide one at 15');
  assert.equal(circuitWidthMap(0, 12, 1.6), Math.min(15, vesselPx(12) * 0.95) * 1.6);
  assert.equal(circuitWidthMap(1, 5, 1.75), CIRC_ARTERY, 'an artery is never boosted');
  assert.equal(circuitWidthMap(1, 5, 1, 0.6), CIRC_ARTERY * 0.6);
  assert.equal(circuitWidthMap(2, 1, 1.5), CIRC_BED * 1.5);
  assert.equal(circuitBranchWidth(1, 3, 1.7, 1, 0.2), 1.2);
  assert.equal(circuitBranchWidth(0, 12, 1, 1, 0.5), Math.min(15, vesselPx(12) * 0.95) * 0.5);
});

test('the boost is 2D\'s: 10 / (15 sc) between 1 and 1.75', () => {
  assert.equal(circBoostOf(1), 1);
  assert.ok(Math.abs(circBoostOf(0.4) - 10 / 6) < 1e-12);
  assert.equal(circBoostOf(0.1), 1.75);
  assert.equal(circBoostOf(0), 1.75);
});

test('a phone: the upright map\'s trunk is about ten CSS px wide, as 2D draws it, not a hairline', () => {
  // the art box turned upright is 700 x 1260 map units; a 390 x 520 room keeps it whole at the smaller of the two scales
  const sc = Math.min(390 / 700, 520 / 1260), boost = circBoostOf(sc);
  const trunk = circuitWidthMap(0, 12, boost) * sc, bed = circuitWidthMap(2, 1, boost) * sc, artery = circuitWidthMap(1, 5, boost) * sc;
  assert.ok(trunk > 8 && trunk < 12, `trunk ${trunk}`);
  assert.ok(bed > 4.5, `bed ${bed}`);
  assert.ok(artery < 2 && artery > 1, `artery ${artery}`);
  // the old tube: the body's radius on the map, 1 / 300 scene units to a figure unit against MAP_K, was this fraction of it
  const old = (vesselPx(12) / 300 / MAP_K) * sc;
  assert.ok(trunk > 1.8 * old, `old ${old}`);
});

test('the camera\'s scale: the shader\'s own rule gives map pixels per unit', () => {
  // 600 CSS px high, fov 14 degrees: P11 = 1 / tan(7 deg); a camera at distance d sees 2 d tan(7 deg) scene units over the height
  const p11 = 1 / Math.tan((7 * Math.PI) / 180), d = 5;
  const sc = mapPxPerUnit(600, p11, d);
  assert.ok(Math.abs(sc - (600 / (2 * d * Math.tan((7 * Math.PI) / 180))) * MAP_K) < 1e-9);
  assert.equal(mapPxPerUnit(600, p11, 0), 0);
});

test('the shader carries the rule: the same constants, the units the map is in, the vessel\'s own start', () => {
  const sh = readFileSync(new URL('../src/scene/vessels/shaders.ts', import.meta.url), 'utf8');
  assert.match(sh, /clamp\(1\.3 \* max\(2\.6, 2\.0 \* pow\(max\(d, 0\.1\), 0\.72\)\) \* 0\.95, 6\.0, 15\.0\) \* circBoost/);
  assert.match(sh, /return 0\.5 \* wc \* CIRC_MAPK/);
  assert.match(sh, /vU = mix\(300\.0, 1\.0 \/ CIRC_MAPK, circShare\)/);
  assert.doesNotMatch(sh.replace(/mix\(300\.0, 1\.0 \/ CIRC_MAPK, circShare\)/, ''), /\* 300\.0/, 'no figure-unit factor is left fixed at 300');
  assert.deepEqual([...circuitWidth(0)], [-1, 1, 0, MIN_PX.vein]);
  assert.deepEqual([...circuitWidth(1, 0.6)], [CIRC_ARTERY * 0.6, 0, 0, MIN_PX.artery]);
  assert.deepEqual([...circuitWidth(2)], [CIRC_BED, 1, 0, MIN_PX.bed]);
  assert.match(sh, /wc = max\(wc, circW\.w \* circPerPx\)/, 'no line is under its least width on the screen');
});

test('a liver branch follows its host: the uniform is the host\'s width times its share, held at 1.2', () => {
  const [w, boost, min] = treeCircW(0, 12, 1, 0.5);
  assert.equal(w, Math.min(15, vesselPx(12) * 0.95) * 0.5); assert.equal(boost, 1); assert.equal(min, 1.2);
  assert.equal(treeCircW(0, 12, 1, 0.5)[3], MIN_PX.branch);
  assert.deepEqual([...treeCircW(1, 3, 0.6, 0.5)], [CIRC_ARTERY * 0.6 * 0.5, 0, 1.2, MIN_PX.branch]);
});

test('the figure frames the map\'s drawn box, not the 8% taller view box (2D uprightFitOf)', () => {
  const wide = circuitShot(false), up = circuitShot(true);
  assert.ok(Math.abs(wide.half[0] - ((ART_CIRC[2] - ART_CIRC[0]) * MAP_K) / 2) < 1e-9);
  assert.ok(Math.abs(wide.half[1] - ((ART_CIRC[3] - ART_CIRC[1]) * MAP_K) / 2) < 1e-9);
  assert.ok(Math.abs(up.half[0] - wide.half[1]) < 1e-9 && Math.abs(up.half[1] - wide.half[0]) < 1e-9);
});

test('a name keeps off its vessel by half the drawn width: wider as the map is drawn wider, a vein plain where a station has no vessel of its own', () => {
  const sc = 0.4;
  const conf = halfWidthPx('CONF', sc), plain = halfWidthPx('INT', sc);
  assert.ok(conf > 4 && conf < 7, String(conf));
  assert.ok(Math.abs(conf - (0.5 * circuitWidthMap(NETWORK_BY_ID.get('PV_TRUNK')!.widthKind, NETWORK_BY_ID.get('PV_TRUNK')!.baseD, circBoostOf(sc)) * sc)) < 1e-9);
  assert.ok(plain > 0);
  const ctx = (over: Partial<CapCtx>): CapCtx => ({
    proj: (x, y) => [x * 0.7, y * 0.7], upright: false, vp: { w: 1200, h: 800 }, measure: (t, size) => t.length * size * 0.55,
    stationOn: () => true, laneDrawn: (id) => id in LANE_CAPTIONS, view: { x0: 0, y0: 0, x1: 1000, y1: 600 }, liverOpen: false, zoomed: false, compact: false,
    laneCourse: (id) => (CIRCUIT_D[id] ? courseOf(CIRCUIT_D[id]!) : null), station: (id) => CIRCUIT_NODES[id]?.at ?? null,
    res: {}, scale: 0.7, resWidth: () => 5, resLane: () => courseOf(CIRCUIT_D['A_SMA']!), must: new Set(), ...over,
  });
  const mine = buildCaptions(ctx({ halfW: () => 9 })).items.find((i) => i.id === 'CONF');
  assert.equal(mine?.vw, 9);
  assert.equal(buildCaptions(ctx({})).items.find((i) => i.id === 'CONF')?.vw, 5, 'absent: the old 5');
});

test('no line is a hairline: a floor in CSS px for every kind, whatever the zoom', () => {
  const sc = 0.3, boost = circBoostOf(sc), perPx = 1 / sc;
  for (const [kind, d, min] of [[0, 1, MIN_PX.vein], [1, 5, MIN_PX.artery], [2, 1, MIN_PX.bed]] as const) assert.ok(circuitWidthMap(kind, d, boost, 1, perPx) * sc >= min - 1e-9, `kind ${kind}`);
  assert.ok(circuitBranchWidth(1, 3, boost, 0.6, 0.2, perPx) * sc >= MIN_PX.branch - 1e-9);
  assert.equal(circuitWidthMap(0, 12, 1, 1, 0), circuitWidthMap(0, 12, 1), 'no floor asked: as before');
});

test('the Circuit holds nothing faint: the tip fades let go, the bands run full width and soft, free ends are round', async () => {
  const sh = readFileSync(new URL('../src/scene/vessels/shaders.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(sh, /circT \* \(1\.0 - fadeKeep\)/, 'the artery\'s fades no longer hold in the Circuit');
  assert.match(sh, /bool capCarved\(float across, bool hull\)/);
  assert.match(sh, /if \(capCarved\(across, vHull > 0\.5\)\) discard;/);
  const layer = readFileSync(new URL('../src/scene/circuit/map-layer.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(layer, /float iy = /, 'the bands are not cut off across the map');
  assert.match(layer, /\/ BAND_SOFT \+ 0\.5/);
  const sc = readFileSync(new URL('../src/scene/scene.ts', import.meta.url), 'utf8');
  assert.match(sc, /setCircCap\(free\(v\.from, v\.id\) \? 1 : 0, free\(v\.to, v\.id\) && v\.id !== ARTERIOLE_HOST \? 1 : 0\)/);
  const cap = readFileSync(new URL('../src/scene/circuit/CircuitCaptions.tsx', import.meta.url), 'utf8');
  assert.match(cap, /CIRCUIT_TREES/, 'a caption keeps off the sinusoid bundle');
});
