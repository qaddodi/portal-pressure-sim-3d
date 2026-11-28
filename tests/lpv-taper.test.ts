// The left portal vein narrows and fades out early in the left lobe (Mohammad, 25 Nov: "taper a bit more and fade earlier ... going too far into the left lobe same caliber doesn't look good"),
// and the umbilical vein and the meso-Rex shunt still leave it at its full width (fades.ts PLACED_LIVER_FADE, shape.ts LIVER_TAPER).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { coursesOf, LIVER_TAPER, REST } from '../src/scene/vessels/shape.ts';
import { radiusAtU } from '../src/scene/vessels/tubes.ts';
import { fadeOf, hostRanges, PLACED_LIVER_FADE_HOST } from '../src/scene/vessels/fades.ts';
import { JUNCTION_CHAINS } from '../src/engine/hales/portal/topology.js';
import { lastPieceOf, piecesOf } from '../src/scene/anatomy/whole-pieces.ts';

// (the left portal vein's last piece, whatever the engine's junction table makes of it: the paraumbilical vein and the Meso-Rex bypass each cut it)
const LPV_END = lastPieceOf('PVH_L');

// (the vein's width at a share of the WHOLE vein, read off whichever piece holds it: a taper written along the host, so no junction row moves it)
function widthAt(host: string, share: number): number {
  const id = piecesOf(host).find((p) => share <= hostRanges(host)[p]![1] + 1e-9)!, [p, q] = hostRanges(host)[id]!;
  const c = coursesOf(NETWORK.find((x) => x.id === id)!, REST)[0]!;
  return radiusAtU(c, Math.min(1, Math.max(0, (share - p) / (q - p))), 1) / c.radius;
}

test('the left portal vein tapers and is gone by three quarters of its run into the lobe; its branches leave it whole', () => {
  const [fadeFrom, fadeTo] = PLACED_LIVER_FADE_HOST.PVH_L!;
  const f = fadeOf(LPV_END, false)!;
  assert.ok(f.mode === 1 && f.a1 === 0, `fades out`);
  assert.ok(fadeTo <= 0.8, `the fade ends by ${fadeTo} of the vein`);
  assert.ok(widthAt('PVH_L', 1) <= 0.45, `narrows to ${widthAt('PVH_L', 1).toFixed(2)} at its tip`);
  for (let u = 0.02; u <= 1; u += 0.02) assert.ok(widthAt('PVH_L', u) <= widthAt('PVH_L', u - 0.02) + 1e-9, 'narrows progressively');
  // (the approved look, 25 Nov: it has narrowed to under 0.7 of its width by the time it is gone, however many pieces the engine's table cuts it into)
  assert.ok(widthAt('PVH_L', fadeTo) < 0.7, `at the end of its fade it is ${widthAt('PVH_L', fadeTo).toFixed(2)} of its width`);
  // (it is whole before the taper begins, and the taper begins where the fade does)
  assert.ok(Math.abs(LIVER_TAPER.PVH_L!.from - fadeFrom) < 1e-9, 'the taper starts where the fade starts');
  assert.ok(widthAt('PVH_L', fadeFrom) > 0.98, 'whole where the taper begins');
  // (the umbilical vein's bypass and the meso-Rex shunt leave the host at the table's shares, before the taper starts)
  const chain = (JUNCTION_CHAINS as { host: string; at: number[]; taps: [string, number][][] }[]).find((c) => c.host === 'PVH_L')!;
  for (const id of ['C3', 'REX']) {
    const at = chain.at[chain.taps.findIndex((t) => t.some(([e]) => e === id))]!;
    assert.ok(at < fadeFrom, `${id} leaves at ${at.toFixed(2)} of the vein, before the taper and the fade start (${fadeFrom})`);
    assert.ok(widthAt('PVH_L', at) > 0.98, `${id} leaves a whole vein`);
  }
});

test('the taper is the host\'s, not a piece\'s: pieces meet at one width, and a piece that starts inside the taper starts narrowed', () => {
  const ids = piecesOf('PVH_L'), r = hostRanges('PVH_L');
  assert.ok(ids.length >= 1);
  for (let i = 1; i < ids.length; i++) {
    const a = coursesOf(NETWORK.find((x) => x.id === ids[i - 1])!, REST)[0]!, b = coursesOf(NETWORK.find((x) => x.id === ids[i])!, REST)[0]!;
    assert.ok(Math.abs(radiusAtU(a, 1, 1) - radiusAtU(b, 0, 1)) < 1e-6, `${ids[i - 1]} and ${ids[i]} meet at one width`);
  }
  for (const id of ids) { const [p, q] = r[id]!; assert.equal(coursesOf(NETWORK.find((x) => x.id === id)!, REST)[0]!.along !== undefined, q > LIVER_TAPER.PVH_L!.from, `${id} wears the taper only if it reaches it`); }
});
