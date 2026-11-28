// The left portal vein narrows and fades out early in the left lobe (Mohammad, 25 Nov: "taper a bit more and fade earlier ... going too far into the left lobe same caliber doesn't look good"),
// and the umbilical vein and the meso-Rex shunt still leave it at its full width (fades.ts PLACED_LIVER_FADE, shape.ts LIVER_TAPER).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { coursesOf, REST } from '../src/scene/vessels/shape.ts';
import { factorSpan } from '../src/scene/vessels/tubes.ts';
import { fadeOf } from '../src/scene/vessels/fades.ts';
import { JUNCTION_CHAINS } from '../src/engine/hales/portal/topology.js';
import { lastPieceOf } from '../src/scene/anatomy/whole-pieces.ts';

// (the fade as the vein's own share, measured on the whole vein: fades.ts PLACED_LIVER_FADE)
const PLACED_LIVER_FADE_HOST = [0.447, 0.782] as const;
// (the left portal vein's last piece, whatever the engine's junction table makes of it: the paraumbilical vein and the Meso-Rex bypass each cut it)
const LPV_END = lastPieceOf('PVH_L');

test('the left portal vein tapers and is gone by three quarters of its run into the lobe; its branches leave it whole', () => {
  const v = NETWORK.find((x) => x.id === LPV_END)!, c = coursesOf(v, REST)[0]!;
  const w = (u: number) => factorSpan(c.taper ?? [1, 1], c.taperSpan ?? [0.3, 0.3], u);
  const f = fadeOf(LPV_END, false)!;
  assert.ok(f.mode === 1 && f.to <= 0.75 && f.a1 === 0, `fades out by ${f.to}`);
  assert.ok(w(1) <= 0.45, `narrows to ${w(1).toFixed(2)} at its tip`);
  for (let u = 0.05; u <= 1; u += 0.05) assert.ok(w(u) <= w(u - 0.05) + 1e-9, 'narrows progressively');
  // (a taper is a smoothstep from the end of ONE piece, so it narrows over the last piece, the arterioportal node on (0.64 to 1 of the vein), not over 0.45 to 1 as it did when the vein was cut in two:
  // by the end of its fade, 0.78 of the vein, it has begun to narrow and is gone from sight)
  assert.ok(w(f.to) < 0.95, `at the end of its fade it is ${w(f.to).toFixed(2)} of its width`);
  // (the umbilical vein's bypass and the meso-Rex shunt leave the host at the table's shares, before the fade starts there, and before the last piece, which is the only one that narrows)
  const chain = (JUNCTION_CHAINS as { host: string; at: number[]; taps: [string, number][][] }[]).find((c) => c.host === 'PVH_L')!;
  const lastFrom = chain.at[chain.at.length - 1]!, [fadeFrom] = PLACED_LIVER_FADE_HOST;
  for (const id of ['C3', 'REX']) {
    const at = chain.at[chain.taps.findIndex((t) => t.some(([e]) => e === id))]!;
    assert.ok(at < fadeFrom && at < lastFrom, `${id} leaves at ${at.toFixed(2)} of the vein, before the fade starts (${fadeFrom}) and before the piece that narrows (${lastFrom.toFixed(2)})`);
  }
});
