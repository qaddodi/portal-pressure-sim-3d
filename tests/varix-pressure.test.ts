// Mohammad, 25 Nov: "The varices need to more prominent/thick with such high pressure" (Schistosomiasis / NCPH, varices 17.2 mmHg, drawn barely as wide as the left gastric vein that feeds them).
// The root: a strand's width followed only the varix's SIZE (mm), which tops out at 7 mm; a 6 mm varix is 0.8 of it, so the strands stood at 1.0 times the feeding vein's drawn radius whatever the pressure.
// Now the varix's wall pressure thickens them on top (shape.ts varixPressRamp / varixPressK: nothing under 10 mmHg, whole by 15, about twice the feeding vein), eased (coil.ts CoilState.prs), the strands still on the
// oesophagus's wall and clear of one another, and a band still closes them to the same thin cord. Node only. Run: node --test tests/varix-pressure.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { NETWORK_BY_ID } = await import('../src/scene/vessels/network.ts');
const { REST, coursesOf, VARIX_THICK, varixThickK, varixPressRamp, varixPressK, VARIX_PRESS_FROM, VARIX_PRESS_FULL, VARIX_PRESS_THICK } = await import('../src/scene/vessels/shape.ts');
const { varixSize, varixSpreadK, CoilState } = await import('../src/scene/vessels/coil.ts');
const { widthSwell } = await import('../src/scene/vessels/live-width.ts');
const { aroundEso, wallR } = await import('../src/scene/anatomy/eso-wall.ts');
const { factorSpan } = await import('../src/scene/vessels/tubes.ts');

const v = NETWORK_BY_ID.get('C1a')!;
const at = (d: number, prs: number, bands = 0) => coursesOf(v, { ...REST, spr: varixSpreadK(varixSize('VAR', d)), prs, bands, strandsOn: true }).filter((c) => c.radius > 0);
/** The feeding (left gastric) vein's drawn radius at a varix of `d` mm: its own width times the shader's swell. */
const feeder = (d: number): number => v.radius * widthSwell(v.widthKind, v.baseD, d);
const widest = (d: number, prs: number, bands = 0): number => Math.max(...at(d, prs, bands).map((c) => c.radius)) * widthSwell(v.widthKind, v.baseD, d);
// (the engine's varix wall pressure and size at the schistosomiasis preset, 25 Nov: ptm 16.7 mmHg, 5.996 mm)
const SCHISTO = { d: 6.0, ptm: 16.74 };

test('the ramp: nothing at and under 10 mmHg, whole at and over 15, rising between, and 0 for a missing pressure', () => {
  assert.equal(varixPressRamp(VARIX_PRESS_FROM), 0);
  assert.equal(varixPressRamp(5), 0);
  assert.equal(varixPressRamp(VARIX_PRESS_FULL), 1);
  assert.equal(varixPressRamp(30), 1);
  assert.equal(varixPressRamp(undefined), 0);
  assert.equal(varixPressRamp(NaN), 0);
  let last = 0;
  for (let p = 10; p <= 15; p += 0.5) { const r = varixPressRamp(p); assert.ok(r >= last, `${p} mmHg`); last = r; }
  assert.equal(varixPressK(0), 1);
  assert.ok(Math.abs(varixPressK(1) - VARIX_PRESS_THICK) < 1e-12);
});

test('at the schistosomiasis varix (6 mm, 16.7 mmHg) the widest strand is about twice the feeding vein, where the size alone gave it the same width', () => {
  const was = widest(SCHISTO.d, 0), now = widest(SCHISTO.d, varixPressRamp(SCHISTO.ptm));
  assert.ok(was / feeder(SCHISTO.d) < 1.2, `before: ${(was / feeder(SCHISTO.d)).toFixed(2)} times the feeding vein`);
  assert.ok(now / feeder(SCHISTO.d) >= 1.9 && now / feeder(SCHISTO.d) <= 2.2, `now: ${(now / feeder(SCHISTO.d)).toFixed(2)} times the feeding vein`);
});

test('the strands rise with the pressure at every size, from nothing at 10 mmHg to the full factor at 15, and a pressure under 10 changes nothing (the size-only drawing)', () => {
  for (const d of [3.75, 5, 6, 7.25]) {
    let last = 0;
    for (const p of [8, 10, 11, 12, 13, 14, 15, 18]) { const w = widest(d, varixPressRamp(p)); assert.ok(w >= last - 1e-12, `${d} mm at ${p} mmHg`); last = w; }
    assert.ok(Math.abs(widest(d, varixPressRamp(10)) - widest(d, 0)) < 1e-12);
    assert.ok(Math.abs(widest(d, 1) / widest(d, 0) - VARIX_PRESS_THICK) < 1e-9, `${d} mm full pressure is ${VARIX_PRESS_THICK} times`);
  }
  // (at rest the strands are the old drawing: share times VARIX_THICK times the size factor)
  assert.ok(Math.abs(Math.max(...at(7.25, 0).map((c) => c.radius)) - v.radius * 0.55 * VARIX_THICK * varixThickK(1)) < 1e-9);
});

test('at full pressure every strand still lies its own drawn radius off the oesophagus wall and clear of the next one round the tube (no overlap), at every size', () => {
  for (const d of [3.75, 5, 6, 7.25]) {
    const sw = widthSwell(v.widthKind, v.baseD, d), cs = at(d, 1);
    for (const c of cs) {
      const n = c.pts.length, want = c.radius * sw;
      for (let j = Math.round(n * 0.35); j <= Math.round(n * 0.65); j++) {
        const out = aroundEso(c.pts[j]!).out;
        assert.ok(out >= want * 0.97 && out <= want * 1.3 + 1e-4, `${d} mm: centreline ${out.toFixed(4)} off the wall, drawn radius ${want.toFixed(4)}`);
      }
    }
    // (the strands sit at thirds of a turn round the tube: the chord between two neighbours' centres is over the sum of their drawn radii)
    const j = Math.round(cs[0]!.pts.length * 0.5);
    const rho = cs.map((c) => { const a = aroundEso(c.pts[j]!); return wallR(a.s, a.th) + a.out; });
    const rr = cs.map((c) => c.radius * sw);
    for (let a = 0; a < cs.length; a++) {
      const b = (a + 1) % cs.length, A = aroundEso(cs[a]!.pts[j]!), B = aroundEso(cs[b]!.pts[j]!);
      const pa = [rho[a]! * Math.cos(A.th), rho[a]! * Math.sin(A.th)], pb = [rho[b]! * Math.cos(B.th), rho[b]! * Math.sin(B.th)];
      const gap = Math.hypot(pa[0]! - pb[0]!, pa[1]! - pb[1]!) - rr[a]! - rr[b]!;
      assert.ok(gap > 0, `${d} mm: strands ${a} and ${b} overlap by ${(-gap).toFixed(4)}`);
    }
  }
});

test('the strands keep meeting the coronary vein and the drain at the same width at every pressure, and a band still closes them to the same thin cord', () => {
  const endR = (c: ReturnType<typeof at>[number], u: number) => c.radius * factorSpan(c.taper ?? [1, 1], c.taperSpan ?? [0.3, 0.3], u);
  const ref = at(6, 0);
  for (const prs of [0.3, 1]) {
    const cs = at(6, prs);
    cs.forEach((c, i) => { for (const u of [0, 1]) assert.ok(Math.abs(endR(c, u) - endR(ref[i]!, u)) < 1e-9, `prs ${prs} strand ${i} end ${u}`); });
  }
  const a = at(7.25, 0, 4).map((c) => c.radius), b = at(7.25, 1, 4).map((c) => c.radius);
  assert.equal(a.length, b.length);
  a.forEach((r, i) => assert.ok(Math.abs(r - b[i]!) < 1e-12, `a banded cord is one width at any pressure (${r} vs ${b[i]})`));
  assert.ok(Math.max(...b) < Math.max(...at(7.25, 1).map((c) => c.radius)) * 0.5, 'four bands leave thin cords at full pressure too');
});

test('the thickening eases: the state moves toward the pressure over about a second and settles on it, and a changed pressure reports it as moving', () => {
  const c = new CoilState();
  assert.equal(c.step(0, 1, 16, true, 0), false);
  assert.equal(c.prs, 0);
  assert.equal(c.step(0, 1, 16, false, 1), true);
  assert.ok(c.prs > 0 && c.prs < 0.2, `first step eases (${c.prs})`);
  let moving = true;
  for (let i = 0; i < 600 && moving; i++) moving = c.step(0, 1, 16, false, 1);
  assert.equal(c.prs, 1);
  assert.equal(c.step(0, 1, 16, false, 1), false, 'settled');
  assert.equal(c.step(0, 1, 16, true, 0), true);
  assert.equal(c.prs, 0, 'an instant step (a new patient) goes straight to the pressure');
});
