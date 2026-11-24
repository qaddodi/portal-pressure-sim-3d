// The placed gut is one surface (layer.ts GUT_GROUP): where one part hands over to the next, the two parts must lay the same colour at the same point, or the join reads as a seam.
// Mohammad's iPhone, 24 Nov (capture 065ff1bd, Schistosomiasis, anatomy view, zoomed on the pylorus): "a HARD VERTICAL EDGE" where the stomach meets the duodenum's funnel, the stomach side darker and pinker.
// Root cause: each part painted its fill in its own box with its own tones. The funnel's patch carried only the stomach's gradient and layer, and its own volume radial, inner shade and rim light (in the gut's box and
// tones) laid a step of 30/255 at the cut; the funnel met the bowel and the bowel the colon each in a new box (20 to 37/255). The fix (the mock's round 13): the funnel wears the stomach's WHOLE look by its `tos`
// (organ-art.ts gutLook: every tone, and the box the gradient and volume run in), the tubes share one box (layer.ts oneGutBox) and the gut's depth term is baked as one part (prepare.ts joinParts).
// Measured with the shader's JS twin (tests/anatomy/gut-colour.ts): at each point by a join, part A's fill against what part B's material lays at that same point, so the look's step is measured apart from the
// surface's own turn (the hand-off of the normals is anatomy-smooth.test.ts's).
// (placed only: run with PPS_ANATOMY=placed; with the switch off the gut is 2D's pillows and nothing here applies)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { BufferGeometry } from 'three';
import { organsReady, setOrganData, ORGAN_MESHES } from '../src/scene/organs/meshes.ts';
import { setArtData, gutLook } from '../src/scene/organs/organ-art.ts';
import { OrganLayer } from '../src/scene/organs/layer.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { PALETTES } from '../src/scene/palette.ts';
import { GUT_SEGMENTS, PYL_CUT } from '../src/scene/organs/gut-tubes.ts';
import { ORGAN_FS } from '../src/scene/organs/organ-shader.ts';
import { PLACED } from '../src/scene/anatomy/source.ts';
import { UNITS_PER_SCENE } from '../src/scene/frame2d.ts';
import { fillAt } from './anatomy/gut-colour.ts';

const b = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
setArtData(JSON.parse(readFileSync(new URL('../public/anatomy/organ-art.json', import.meta.url), 'utf8')));

/** The bar: the largest step (any channel, out of 255, on the page) a join may show. Before the fix: 29.7 (stomach to funnel), 37.1 (funnel to bowel), 19.1 (bowel to colon), on Light with depth on. */
const BAR = 3;
const LOOKS = ['light', 'dark'] as const;
/** The oesophagus's tone up the stomach: the most it may change per figure unit (a ramp, not a step). */
const ESO_BAR = 2;

type Layer = InstanceType<typeof OrganLayer>;
let one: Layer | null = null;
/** The organs, built once for every test here (a build is seconds). */
async function built(): Promise<Layer> {
  await organsReady;
  return (one ??= new OrganLayer(createShared(), ORGAN_MESHES));
}
function settle(layer: Layer, look: keyof typeof PALETTES): void {
  layer.applyLook(PALETTES[look]);
  layer.setBody({ spleenScale: 1, splenicRx: 0, bleed: { active: false, total: 0 }, cirrhosis: 0, congestion: 0, tint: 0 } as never, true);
  layer.update(0); layer.update(5000);
}
/** The vertices of `gb` nearest each picked vertex of `ga` (within `within`), front-facing. */
function pairs(ga: BufferGeometry, pick: (i: number) => boolean, gb: BufferGeometry, within: number): [number, number][] {
  const PA = ga.getAttribute('position'), PB = gb.getAttribute('position'), NA = ga.getAttribute('shadeN') ?? ga.getAttribute('normal'), out: [number, number][] = [];
  for (let i = 0; i < PA.count; i++) {
    if (!pick(i) || NA.getZ(i) <= 0.2) continue;
    let bj = -1, bd = within;
    for (let j = 0; j < PB.count; j++) { const d = Math.hypot(PB.getX(j) - PA.getX(i), PB.getY(j) - PA.getY(i), PB.getZ(j) - PA.getZ(i)); if (d < bd) { bd = d; bj = j; } }
    if (bj >= 0) out.push([i, bj]);
  }
  return out;
}

test('placed: across every gut join the two parts lay the same colour at the same point (Light and Dark, depth on and off)', { skip: !PLACED }, async () => {
  const layer = await built();
  const o = (id: string) => layer.byId.get(id)!;
  const geo = (id: string) => o(id).toonMesh.geometry;
  const st = geo('stomach'), dz = geo('duodenum'), bw = geo('bowel'), cl = geo('colon');
  const cutA = st.getAttribute('cutA'), SP = st.getAttribute('position'), T = dz.getAttribute('position').count, ring = GUT_SEGMENTS + 1;
  const joins: [string, string, BufferGeometry, string, [number, number][]][] = [
    ['stomach>duodenum', 'stomach', st, 'duodenum', pairs(st, (i) => cutA.getX(i) >= 0.5 && SP.getX(i) <= PYL_CUT + 0.015, dz, 0.02)],
    ['duodenum>bowel', 'duodenum', dz, 'bowel', pairs(dz, (i) => i >= T - 3 * ring, bw, 0.01)],
    ['bowel>colon', 'bowel', bw, 'colon', pairs(bw, () => true, cl, 0.01)],
  ];
  for (const [name, , , , p] of joins) assert.ok(p.length >= 8, `${name}: the join is found (${p.length} points)`);
  const worst: string[] = [];
  for (const look of LOOKS) {
    settle(layer, look);
    for (const depth of [1, 0]) for (const [name, A, ga, B, p] of joins) {
      const gb = geo(B), TB = gb.getAttribute('tos');
      let w = 0;
      for (const [i, j] of p) {
        const ca = fillAt(o(A).toon, ga, i, depth).onPage, cb = fillAt(o(B).toon, ga, i, depth, TB ? TB.getX(j) : 0).onPage;
        w = Math.max(w, ...ca.map((v, k) => Math.abs(v - cb[k]!) * 255));
      }
      worst.push(`${look} depth ${depth} ${name} ${w.toFixed(1)}`);
      assert.ok(w <= BAR, `${look}, depth ${depth}: ${name} steps by ${w.toFixed(1)}/255 (bar ${BAR})`);
    }
  }
  console.log(worst.join('\n'));
});

test('placed: up the stomach the oesophagus\'s tone comes in as a ramp, never a step (Light and Dark)', { skip: !PLACED }, async () => {
  const layer = await built();
  const m = layer.byId.get('stomach')!.toon, g = layer.byId.get('stomach')!.toonMesh.geometry, E = g.getAttribute('eso'), I = g.index!;
  for (const look of LOOKS) {
    settle(layer, look);
    const u = m.uniforms as Record<string, { value: { x?: number; y?: number; z?: number; r?: number; g?: number; b?: number } }>;
    const v = (k: string): number[] => { const x = u[k]!.value; return 'r' in x ? [x.r!, x.g!, x.b!] : [x.x!, x.y!, x.z!]; };
    const d = Math.max(...[0, 1, 2].map((k) => Math.max(Math.abs(v('eso1')[k]! - v('o1')[k]!), Math.abs(v('eso2')[k]! - v('o2')[k]!))));
    let w = 0;
    // (per figure unit of the edge, an edge under a unit counting as one: a ramp spreads its change over its width, a step lays all of it across one short edge. Before the fix the oesophagus's right edge was a cut,
    //  4.2/255 across an edge 0.2 units long, by the cardia)
    const P = g.getAttribute('position');
    for (let t = 0; t < I.count; t += 3) for (let e = 0; e < 3; e++) {
      const a = I.getX(t + e), c = I.getX(t + ((e + 1) % 3)), len = Math.hypot(P.getX(a) - P.getX(c), P.getY(a) - P.getY(c)) * UNITS_PER_SCENE;
      w = Math.max(w, (Math.abs(E.getX(a) - E.getX(c)) * d * 255) / Math.max(1, len));
    }
    assert.ok(w <= ESO_BAR, `${look}: the oesophagus's tone changes by ${w.toFixed(1)}/255 per figure unit (bar ${ESO_BAR})`);
  }
});

test('placed: the funnel\'s fill is the organ painter with the stomach\'s look mixed in by tos, every tone of it (no tone left in the gut\'s own)', { skip: !PLACED }, () => {
  const fs = gutLook(ORGAN_FS), body = fs.slice(fs.indexOf('void main() {'));
  for (const k of ['o1', 'o2', 'ogLight', 'ogDark', 'volLight', 'volShade', 'volGeo', 'volShadeAt', 'shadeSteps', 'rimK', 'layer']) {
    assert.ok(new RegExp(`uniform \\w+ ${k}S;`).test(fs), `${k}S declared`);
    assert.equal(body.replace(new RegExp(`mix\\(${k}, ${k}S, vTos\\)`, 'g'), '').match(new RegExp(`\\b${k}\\b`)), null, `${k} is read only through its mix`);
  }
  assert.equal(body.replace(/mix\(vBox, vBoxS, vTos\)/g, '').match(/\bvBox\b/), null, 'the box the fill runs in is mixed too');
});

test('placed: the funnel\'s stomach tones are the stomach\'s own uniforms, and the stomach\'s cut lies under the funnel', { skip: !PLACED }, async () => {
  const layer = await built();
  const s = layer.byId.get('stomach')!, d = layer.byId.get('duodenum')!;
  for (const k of ['o1', 'o2', 'ogDark', 'volGeo', 'layer']) assert.equal(d.toon.uniforms[`${k}S`], s.toon.uniforms[k], `${k}S is the stomach's ${k}`);
  // (the cut is a clean discard, as the mock's: it lies inside the funnel's front view, which the stencil keeps the stomach from drawing over, so no edge of it is ever seen and no half-faded strip lies beside it)
  const g = s.toonMesh.geometry, P = g.getAttribute('position'), C = g.getAttribute('cutA'), I = g.index!, dg = d.toonMesh.geometry, DP = dg.getAttribute('position'), DI = dg.index!;
  const inside = (x: number, y: number): boolean => {
    for (let t = 0; t < DI.count; t += 3) {
      const a = DI.getX(t), b = DI.getX(t + 1), c = DI.getX(t + 2), ax = DP.getX(a), ay = DP.getY(a), bx = DP.getX(b), by = DP.getY(b), cx = DP.getX(c), cy = DP.getY(c);
      const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by), d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy), d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return true;
    }
    return false;
  };
  let n = 0, out = 0;
  for (let t = 0; t < I.count; t += 3) for (let e = 0; e < 3; e++) {
    const a = I.getX(t + e), c = I.getX(t + ((e + 1) % 3));
    if ((C.getX(a) < 0.5) === (C.getX(c) < 0.5)) continue;
    n++;
    if (!inside((P.getX(a) + P.getX(c)) / 2, (P.getY(a) + P.getY(c)) / 2)) out++;
  }
  assert.ok(n > 10, `the cut is found (${n} edges)`);
  assert.equal(out, 0, `${out} of the cut's ${n} edges lie outside the funnel`);
});
