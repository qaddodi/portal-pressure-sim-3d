// The TIPS needle's hit and the tract (owner, 22 Nov 2026: "a weird circle appears from the tip of the needle; the tract doesn't dilate").
// Root causes: (1) 2D's two-ring "portal hit" was ported as flat RingGeometry discs, which in 3D float in the liver: every needle (the TIPS catheter's, the EUS-PPG and EUS-glue scope's) now shows the hit as
// blood flashing back along the needle itself; (2) nothing drew the tract until the model took the shunt at `apply`, at full width: the tract is now drawn from the needle's hit and widens with the balloon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './device-clock.ts';
import { fadeFrames } from './device-clock.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { route3d } from '../src/scene/procedures/route3d.ts';
import { ProcCatheter, CATHETER_IDLE } from '../src/scene/devices/catheters/proc-catheter.ts';
import { flashbackEnv, flashbackFront } from '../src/scene/devices/flashback.ts';
import { TRACT_NEEDLE_MM, TRACT_STENT_MM, tractDiameter, tractTimes } from '../src/scene/procedures/tract.ts';
import { specOf } from '../src/scene/procedures/copied/proc-anim.js';
import { drawnDiameter, setDrawnDiameter, drawnDiameterVersion } from '../src/engine/tract-override.ts';
import { EDGE_COUNT, fillVesselData, indexOf } from '../src/engine/vessel-data.ts';
import { NETWORK_BY_ID, presenceOf } from '../src/scene/vessels/network.ts';

const src = (p: string): string => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('no needle draws its hit as a flat ring: the catheter, the glue cast and the scope hold no flash rings', () => {
  for (const p of ['src/scene/devices/catheters/proc-catheter.ts', 'src/scene/devices/glue-cast.ts', 'src/scene/devices/probes/scope.ts']) {
    const code = src(p).replace(/\/\/.*$/gm, '');
    assert.ok(!/\bflashes\b|\bflashRings\b/.test(code), `${p} still holds flash rings`);
  }
  assert.ok(!/RingGeometry/.test(src('src/scene/devices/glue-cast.ts')));
});

test('the flashback eases in and out of the hit\'s window and runs back along the needle', () => {
  assert.equal(flashbackEnv(0), 0); assert.ok(flashbackEnv(0.4) > 0.99); assert.ok(flashbackEnv(1) < 1e-9);
  let prev = -1; for (let i = 0; i <= 20; i++) { const v = flashbackFront(i / 20); assert.ok(v >= prev - 1e-12); prev = v; }
  assert.equal(flashbackFront(0), 0); assert.equal(flashbackFront(0.5), 1);
});

test('TIPS catheter: the hit shows the needle\'s blood sleeve (tinted), and nothing when the hit is over', () => {
  const c = new ProcCatheter(route3d('tips')!, createShared());
  const base = { ...CATHETER_IDLE, u: 0.5, opacity: 1, needle: 0.9, wire: 0.95 };
  c.set({ ...base, flash: 0.4 }); fadeFrames();
  const part = (c as unknown as { flashback: { group: { visible: boolean } } }).flashback;
  assert.equal(part.group.visible, true);
  assert.equal('flashes' in c, false);
  c.set({ ...base, flash: 0 }); fadeFrames();
  assert.equal(part.group.visible, false);
});

test('the TIPS timeline: no tract before the hit, a needle\'s width as it lands, the stent\'s width after the balloon, held (never narrowed) to the model\'s apply', () => {
  for (const kind of ['tips', 'tipscoil']) {
    const T = tractTimes((specOf(kind) as { T: unknown }).T)!;
    assert.ok(T, kind);
    assert.equal(tractDiameter(T, T.flash0 - 1), 0);
    const hit = tractDiameter(T, T.flash0 + 700);
    assert.ok(Math.abs(hit - TRACT_NEEDLE_MM) < 1e-6, `${kind} thin at the hit: ${hit}`);
    assert.ok(tractDiameter(T, T.flash0 + 1) > 0 && tractDiameter(T, T.flash0 + 1) < TRACT_NEEDLE_MM);
    let prev = 0;
    for (let t = T.flash0; t <= T.inflate1 + 3000; t += 50) { const d = tractDiameter(T, t); assert.ok(d >= prev - 1e-9, `${kind} never narrows (t ${t})`); prev = d; }
    assert.ok(Math.abs(tractDiameter(T, T.inflate1) - TRACT_STENT_MM) < 1e-6, 'the balloon dilates to the stent');
    assert.ok(Math.abs(tractDiameter(T, T.inflate1 + 4000) - TRACT_STENT_MM) < 1e-6, 'held through the balloon\'s deflation');
    assert.ok(Math.abs(tractDiameter(T, T.inflate1, 10) - 10) < 1e-6, 'a 10 mm stent is dilated to 10');
    const mid = tractDiameter(T, (T.inflate0 + T.inflate1) / 2);
    assert.ok(mid > TRACT_NEEDLE_MM + 1 && mid < TRACT_STENT_MM - 1, `widens with the balloon: ${mid}`);
  }
  assert.equal(tractTimes((specOf('brto') as { T: unknown }).T), null, 'only the TIPS procedures dilate a tract');
});

test('a drawn diameter is the floor under the engine\'s: it draws the tract before the model has it, and the engine takes over at its own width with no step', () => {
  const k = indexOf('TIPS'), mk = (d: number) => { const D = new Float32Array(EDGE_COUNT).fill(5); D[k] = d; return { Pf: new Float32Array(500), Qf: new Float32Array(EDGE_COUNT), D }; };
  const out = new Float32Array(EDGE_COUNT * 4), v0 = drawnDiameterVersion();
  setDrawnDiameter('TIPS', 3);
  assert.ok(drawnDiameterVersion() > v0);
  assert.equal(fillVesselData(mk(0) as never, out)[k * 4 + 2], 3, 'drawn before the model has it');
  assert.equal(fillVesselData(mk(8) as never, out)[k * 4 + 2], 8, 'the engine\'s wider diameter wins: no shrink at apply');
  setDrawnDiameter('TIPS', 8);
  assert.equal(fillVesselData(mk(0) as never, out)[k * 4 + 2], 8, 'dilated to the stent\'s width when the model takes over');
  // the presence rule sees it too: the tract is shown while it is drawn
  const e = NETWORK_BY_ID.get('TIPS')!;
  const f = { D: mk(0).D, Q: new Float32Array(EDGE_COUNT), Qf: new Float32Array(EDGE_COUNT) } as never;
  assert.equal(presenceOf(e, f, { collaterals: false, circuit: false }), 'shown');
  setDrawnDiameter('TIPS', 0);
  assert.equal(drawnDiameter('TIPS'), 0);
  assert.equal(presenceOf(e, f, { collaterals: false, circuit: false }), 'hidden');
});

// The grey octagonal knob on the TIPS wire (owner, 22 Nov: "wtf is this circle in tips"). Root cause: the needle's bevel cone was built on the Z axis but laid along the route as an X-axis part (`orient` turns +X), so it
// stood end-on to the viewer; and its apex radius was an absolute 0.01 against a needle of 0.0015, an inverted cone: a wide 8-sided disc where the needle ends. Every part laid by `orient` must have its length on +X.
import { NEEDLE_APEX_K, NEEDLE_POINT_LEN, needlePoint, needleRadius } from '../src/scene/devices/catheters/proc-catheter.ts';
test('the needle\'s point lies along +X (base at the origin, apex ahead), never end-on', () => {
  const rc = route3d('tips')!.rc, r = needleRadius(rc);
  const g = needlePoint(rc, r); g.computeBoundingBox();
  const b = g.boundingBox!;
  assert.ok(Math.abs(b.min.x) < 1e-6 && Math.abs(b.max.x - rc * NEEDLE_POINT_LEN) < 1e-6, `length on +X: ${b.min.x}..${b.max.x}`);
  assert.ok(b.max.y - b.min.y <= 2 * r + 1e-6 && b.max.z - b.min.z <= 2 * r + 1e-6, 'no wider than the needle');
  const pos = g.getAttribute('position'); let atApex = 0;
  for (let i = 0; i < pos.count; i++) if (pos.getX(i) > rc * NEEDLE_POINT_LEN - 1e-6) { atApex++; assert.ok(Math.hypot(pos.getY(i), pos.getZ(i)) <= r * NEEDLE_APEX_K + 1e-6, 'the apex is narrower than the base'); }
  assert.ok(atApex > 0, 'the apex is ahead of the base');
});

// The TIPS needle was thick and the sheath over it thin (owner, 25 Nov): the needle was 0.42 of the shaft's radius (0.0015 against 0.0033), nearly half the sheath's width. Now a fine needle (no thicker than 0.3 of the
// shaft, as fine as the wire) with a long bevel, and the TIPS kit's sheath 1.5 times the shaft's radius, still held inside its drawn lumen (SHEATH_MAX_SHARE); every other route keeps its shaft.
import { SHEATH_K, SHEATH_MAX_SHARE, sheathK, SHEATH_KINDS } from '../src/scene/devices/catheters/proc-catheter.ts';
test('the TIPS needle is fine and its sheath is visibly wider than the needle, in every kit route', () => {
  for (const kind of ['tips', 'tipscoil', 'tipscoilin', 'dips'] as const) {
    const r3 = route3d(kind)!, rc = r3.rc, nr = needleRadius(rc);
    assert.ok(nr <= 0.3 * rc + 1e-9 && nr >= 0.0009, `${kind}: needle radius ${nr} against shaft ${rc}`);
    assert.ok(sheathK(kind) === SHEATH_K && SHEATH_K * rc >= 3.5 * nr, `${kind}: the sheath ${(SHEATH_K * rc).toFixed(4)} is at least 3.5 needles wide (${nr})`);
    const r = r3.route; let worst = 0;
    for (let i = 0; i <= 60; i++) worst = Math.max(worst, Math.min(SHEATH_K * rc, SHEATH_MAX_SHARE * r3.lumen(r.start + ((r.free - r.start) * i) / 60)) / r3.lumen(r.start + ((r.free - r.start) * i) / 60));
    assert.ok(worst <= SHEATH_MAX_SHARE + 1e-9, `${kind}: the sheath stays within ${SHEATH_MAX_SHARE} of the lumen`);
  }
  for (const kind of ['hvpg', 'brto', 'bato', 'ivcread']) assert.ok(!SHEATH_KINDS.has(kind) && sheathK(kind) === 1, `${kind} keeps its shaft`);
});
