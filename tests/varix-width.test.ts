// Mohammad, 25 Nov: "the esophageal varices should be more sensitive to pressure and appear thicker with earlier pressure cuz even grade 3 seem not that full on anatomy view".
// The root: a strand's drawn width followed the varix's diameter only through the shader's swell (a vein's 2D width rule, 1.3 max(2.6, 2 d^0.72)), so a large varix was barely 1.6 times a threshold one,
// and the third column opened only from 4.75 mm. Now the strands thicken with the varix's size (shape.ts varixThickK, early growth) and open earlier (STRAND_OPEN_LAST), and they still lie on the
// oesophagus's wall at every size (their gap is their own drawn radius: shape.ts wallGap into coil.ts wrapEso). Node only. Run: node --test tests/varix-width.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PPS_ANATOMY = 'placed';
const { NETWORK_BY_ID } = await import('../src/scene/vessels/network.ts');
const { REST, coursesOf, VARIX_THICK, varixThickK, BANDED_CORD } = await import('../src/scene/vessels/shape.ts');
const { varixSize, varixSpreadK } = await import('../src/scene/vessels/coil.ts');
const { widthSwell } = await import('../src/scene/vessels/live-width.ts');
const { aroundEso, ESO_VARIX_GAP } = await import('../src/scene/anatomy/eso-wall.ts');
const { factorSpan } = await import('../src/scene/vessels/tubes.ts');

const v = NETWORK_BY_ID.get('C1a')!;
const at = (d: number, bands = 0) => coursesOf(v, { ...REST, spr: varixSpreadK(varixSize('VAR', d)), bands, strandsOn: true }).filter((c) => c.radius > 0);
/** The widest strand's drawn radius (built width times the shader's swell) at diameter `d` mm. */
const drawn = (d: number): number => Math.max(...at(d).map((c) => c.radius)) * widthSwell(v.widthKind, v.baseD, d);
/** One column's drawn width (no opening), the mapping itself. */
const column = (d: number): number => varixThickK(varixSize('VAR', d)) * widthSwell(v.widthKind, v.baseD, d);

test('the drawn strand rises with the diameter at every grade: none (2.5 mm), small (3.75), large (5), full (7.25); a large varix is at least twice a threshold one, a small one clearly above it', () => {
  const ds = [2.5, 3.75, 5, 7.25], r = ds.map(drawn), k = ds.map(column);
  for (let i = 1; i < ds.length; i++) {
    assert.ok(r[i]! > r[i - 1]! * 1.2, `widest strand ${ds[i]} mm (${r[i]!.toFixed(4)}) is plainly wider than at ${ds[i - 1]} mm (${r[i - 1]!.toFixed(4)})`);
    assert.ok(k[i]! > k[i - 1]!, 'and the column mapping rises');
  }
  assert.ok(k[2]! / k[0]! >= 2.0, `a column at the 5 mm cut-off is at least twice one at the 2.5 mm threshold (${(k[2]! / k[0]!).toFixed(2)})`);
  assert.ok(k[1]! / k[0]! >= 1.5, `a small varix's column is clearly above the threshold's (${(k[1]! / k[0]!).toFixed(2)})`);
  assert.ok(r[2]! / r[0]! >= 2.0 && r[3]! / r[2]! >= 1.4, `large / threshold ${(r[2]! / r[0]!).toFixed(2)}, full / large ${(r[3]! / r[2]!).toFixed(2)}`);
  // (a full varix is a fat cord on the oesophagus: its widest strand at least 60% of the tube's half-width there, about 0.03)
  assert.ok(r[3]! >= 0.018, `a full varix's strand is fat (${r[3]!.toFixed(4)})`);
});

test('the size thickening sits on VARIX_THICK and grows early: half of it by 3.5 mm, most of it at the 5 mm cut-off, all of it at 7 mm', () => {
  assert.ok(VARIX_THICK > 1.1 && VARIX_THICK < 1.5);
  const full = varixThickK(1) - 1;
  assert.equal(varixThickK(0), 1);
  assert.ok(varixThickK(varixSize('VAR', 3.5)) - 1 >= 0.5 * full);
  assert.ok(varixThickK(varixSize('VAR', 5)) - 1 >= 0.8 * full);
  const big = at(7.25), small = at(2.5);
  assert.ok(Math.abs(Math.max(...big.map((c) => c.radius)) - v.radius * 0.55 * VARIX_THICK * varixThickK(1)) < 1e-9, 'the widest strand is its share times VARIX_THICK times the size factor');
  assert.ok(small.length === 3 && big.length === 3);
});

test('the strands keep meeting the coronary vein and the drain at the same width at every size (the taper divides the thickening back out), and a band still narrows them to a cord', () => {
  const endR = (c: ReturnType<typeof at>[number], u: number) => c.radius * factorSpan(c.taper ?? [1, 1], c.taperSpan ?? [0.3, 0.3], u);
  const ref = at(7.25);
  for (const d of [2.5, 3.75, 5, 6]) {
    const cs = at(d);
    cs.forEach((c, i) => { for (const u of [0, 1]) assert.ok(Math.abs(endR(c, u) - endR(ref[i]!, u)) < 1e-9, `${d} mm strand ${i} end ${u}: ${endR(c, u)} vs ${endR(ref[i]!, u)}`); });
  }
  const open = Math.max(...at(7.25).map((c) => c.radius)), banded = at(7.25, 4).map((c) => c.radius);
  assert.ok(Math.max(...banded) < open * 0.5, 'four bands leave thin cords');
  const cord = v.radius * (1 - 0.14 * 4) * 0.5 * VARIX_THICK * varixThickK(1) * BANDED_CORD;
  assert.ok(banded.every((r) => r >= cord - 1e-12), 'never thinner than a cord');
});

test('at every size each strand lies its own drawn radius out from the oesophagus\'s wall, along its whole column: touching it, never in it, never off it', () => {
  for (const d of [2.5, 3.75, 5, 6, 7.25]) {
    const sw = widthSwell(v.widthKind, v.baseD, Math.min(d, 7));
    for (const c of at(d)) {
      const n = c.pts.length, want = c.radius * sw;
      // the middle of the column (where the strand has parted from the trunk and has its own width)
      for (let j = Math.round(n * 0.35); j <= Math.round(n * 0.65); j++) {
        const out = aroundEso(c.pts[j]!).out;
        assert.ok(out >= want * 0.97 && out <= want * 1.3 + 1e-4, `${d} mm: a strand's centreline ${out.toFixed(4)} off the wall, its drawn radius ${want.toFixed(4)}`);
      }
    }
  }
  assert.ok(Math.max(...at(7).map((c) => c.radius)) * widthSwell(v.widthKind, v.baseD, 7) <= ESO_VARIX_GAP + 1e-9, 'the gap at full size holds the widest strand drawn');
});
