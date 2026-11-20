// The lobule as a flat plate (WP5, atlas-look-plan.md §5): the tissue is the 2D app's own painter on one flat plate, the vessels lie in one plane on it,
// the end-on vessels are flat discs, the neighbouring lobules are 2D's field out of focus, and the camera looks at it face on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pinned2D } from './two-d-pin.ts';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { lobuleShot, LOBULE_R, LOBULE_CAMS } from '../src/scene/lobule/shots.ts';
import { PLATE_PX, PLATE_S, paintPlate, plateKey, plateShape } from '../src/scene/lobule/plate.ts';
import { FIELD_TILE_R, fieldKey, fieldQuantizer, paintFieldTile } from '../src/scene/lobule/field.ts';
import { lookColours } from '../src/scene/lobule/lz-colours.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';
import { fadeAt, fadeOuter, FADE_MID } from '../src/scene/lobule/from2d/lobule-look.generated.js';

/** A 2D context that records what is drawn (every method a no-op that counts), enough for the 2D painters. */
function recorder(w = 64, h = 64) {
  const calls: Record<string, number> = {};
  const t = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const base: Record<string, unknown> = {
    canvas: { width: w, height: h },
    getTransform: () => ({ ...t }),
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => { Object.assign(t, { a, b, c, d, e, f }); calls.setTransform = (calls.setTransform ?? 0) + 1; },
    createRadialGradient: () => ({ addColorStop: () => { calls.stop = (calls.stop ?? 0) + 1; } }),
    getImageData: (_x: number, _y: number, W: number, H: number) => ({ data: new Uint8ClampedArray(W * H * 4) }),
  };
  const ctx = new Proxy(base, {
    get(o, k: string) { if (k in o) return o[k]; return (..._a: unknown[]) => { calls[k] = (calls[k] ?? 0) + 1; }; },
    set(o, k: string, v) { o[k] = v; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const net = buildLobule();
const G = plateShape(net);
const H = { congU: 0, septU: 0, fibSin: 0, act: 0, fibPre: 0, fibPost: 0 };
const SICK = { congU: 0.8, septU: 1, fibSin: 0.8, act: 0.9, fibPre: 0.7, fibPost: 0.6 };
const sins = net.courses.filter((c) => c.kind === 's0').map((c) => ({ c, r: 0.0095 }));

const PIN2D = pinned2D('src/ui/lobule-zoom-field.js');
test('the copies of the 2D painter are current (scripts/copy-lobule.mjs --check against the 2D checkout at the pin)', { skip: PIN2D.skip }, () => {
  assert.doesNotThrow(() => execFileSync('node', ['scripts/copy-lobule.mjs', '--from', PIN2D.repo, '--check'], { stdio: 'pipe' }));
});

test('the plate is 2D\'s painter: every hepatocyte a rounded cell with a membrane and a nucleus, the limiting plate a hairline, in every look', () => {
  for (const look of LOOK_IDS) {
    const { ctx, calls } = recorder();
    paintPlate(ctx, PLATE_PX, G, sins, 0.07, H, look);
    assert.equal(calls.roundRect, net.cells.length, `${look}: one rounded cell per hepatocyte`);
    assert.equal(calls.arc, net.cells.length, `${look}: a nucleus in each`);
    assert.ok((calls.stroke ?? 0) >= net.cells.length + 1, `${look}: membranes and the limiting plate`);
  }
});

test('disease is painted as 2D paints it: zone 3 drops out with congestion, nutmeg, collagen bands, the tracts\' and the central vein\'s collars, stellate cells', () => {
  const a = recorder(), b = recorder();
  paintPlate(a.ctx, PLATE_PX, G, sins, 0.07, H, 'light');
  paintPlate(b.ctx, PLATE_PX, G, sins, 0.07, SICK, 'light');
  assert.ok((b.calls.roundRect ?? 0) === net.cells.length, 'every cell still drawn (the dead ones paler and smaller)');
  assert.ok((b.calls.stroke ?? 0) > (a.calls.stroke ?? 0), 'fibres along the bands');
  assert.ok((b.calls.fill ?? 0) > (a.calls.fill ?? 0) * 1.5, 'collagen, nutmeg and stellate cells add many fills');
  assert.ok((b.calls.ellipse ?? 0) > 20, 'stellate cells and fibroblast nuclei');
  assert.ok((b.calls.stop ?? 0) >= 3, 'the nutmeg\'s radial gradient');
});

test('the plate\'s shape is the 3D network in the painter\'s units, with 2D\'s cirrhosis jitter kept for every cell', () => {
  assert.equal(G.R, PLATE_S); assert.equal(G.cells.length, net.cells.length);
  for (const k of G.cells) for (const j of [k.jx, k.jy, k.ja]) assert.ok(j >= -0.5 && j <= 0.5);
  assert.equal(G.lobules[0]!.corners.length, 6);
  assert.equal(G.septaPC.length, 3);
});

test('a state is painted at 1/32 steps: an easing model asks for a few paintings, never one a frame', () => {
  assert.equal(plateKey(H, 'light'), plateKey({ ...H, congU: 0.01 }, 'light'));
  assert.notEqual(plateKey(H, 'light'), plateKey({ ...H, congU: 0.05 }, 'light'));
  assert.notEqual(plateKey(H, 'light'), plateKey(H, 'dark'), 'a new look paints again');
});

test('the lobule is seen face on, as 2D shows it', () => {
  for (const c of LOBULE_CAMS) if (c !== 'sinusoid') { const s = lobuleShot(c); assert.equal(s.yaw, 0); assert.equal(s.pitch, 0); }
});

test('the neighbours are 2D\'s field tile: a repeat two lobules wide and two high, painted with the look\'s liver, veins and septa', () => {
  const { ctx, calls } = recorder();
  const made: [number, number][] = [];
  const out = paintFieldTile('light', { su: 0.5, pre: 0.5, post: 0.5, sin: 0.5, cong: 0.5 }, (w, h) => { made.push([w, h]); return { width: w, height: h, getContext: () => ctx } as unknown as HTMLCanvasElement; });
  assert.deepEqual(made, [[Math.round(6 * FIELD_TILE_R), Math.round(2 * Math.sqrt(3) * FIELD_TILE_R)]]);
  assert.ok(out.cv);
  assert.ok((calls.quadraticCurveTo ?? 0) > 100, 'rounded plates and curved sinusoids');
  assert.ok((calls.putImageData ?? 0) === 1, 'blurred once, as 2D\'s quiet copy');
});

test('the field\'s state follows 2D\'s eighths with hysteresis, and its fade is 2D\'s (clear to 1.1 R, at most half faded at a screen corner)', () => {
  const q = fieldQuantizer();
  const a = q({ septU: 0.5, fibPre: 0, fibPost: 0, fibSin: 0, congU: 0 });
  const b = q({ septU: 0.56, fibPre: 0, fibPost: 0, fibSin: 0, congU: 0 });
  assert.equal(a.su, 0.5); assert.equal(b.su, 0.5, 'a wobble on a step does not repaint');
  assert.notEqual(fieldKey(a, 'light'), fieldKey(a, 'dark'));
  assert.equal(fadeAt(1, 1.1, 3.2), 0);
  const r1 = fadeOuter(1.1, 10);
  assert.ok(Math.abs(fadeAt(10, 1.1, r1) - 0.5) < 1e-9, 'the farthest corner at EDGE_FADE');
  assert.equal(FADE_MID, 0.72);
});

test('every look\'s lobule colours are worked out (var() and all), never black by accident', () => {
  for (const look of LOOK_IDS) {
    const L = lookColours(look);
    for (const n of ['--og-liver-1', '--og-liver-2', '--lz-septum', '--collagen', '--vein-portal', '--vein-systemic', '--artery', '--bile-duct', '--lz-plate-line', '--lz-nodule-ink', '--lz-nutmeg', '--lz-zone-1', '--vessel-casing']) {
      assert.ok(L.text(n) && !L.text(n).includes('var('), `${look} ${n}: ${L.text(n)}`);
      assert.ok(L.rgb01(n).some((x) => x > 0.02) || n === '--vessel-casing', `${look} ${n} is a colour`);
    }
  }
  assert.ok(LOBULE_R > 0);
});
