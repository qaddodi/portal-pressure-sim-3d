// Smooth everywhere (Mohammad, 24 Nov 2026, for the new anatomy: "make sure all the joins are smooth and all blood vessels run organically smoothly obviously, and organs look smooth").
// Every drawn vessel (no kink, no abrupt bend, no step in width), every join where vessels run on (no gap, no turn, no step) and every organ's shading normals (no crease, no facet) is held
// to one bar (tests/anatomy/smooth.ts BAR), with no allowance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { vesselSmoothness, joinSmoothness, organSmoothness, handoffSmoothness, fadeStep, overBar } from './anatomy/smooth.ts';
import { ORGAN_MESHES, setOrganData, organsReady } from '../src/scene/organs/meshes.ts';
import { prepareOrgans } from '../src/scene/organs/prepare.ts';
import { caudateGeometry } from '../src/scene/organs/caudate.ts';
import { PYL_CUT, RING_STEP } from '../src/scene/organs/gut-tubes.ts';

test('every vessel, join and organ is as smooth as the bar', async () => {
  const b = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  await organsReady;
  // (the approved placement: every organ, the gut's tubes (the duodenum's funnel, the packed bowel with the ileum, the colon to the rectum) and the caudate lobe's egg, on the normals they are shaded with, and the
  // stomach's hand-off to the funnel at its cut, which is two surfaces: the stomach's last drawn rows against the funnel's nearest)
  const made = prepareOrgans({ ...ORGAN_MESHES, caudate: caudateGeometry });
  const organs = made.map(([id, g]) => organSmoothness(id, g, 'shadeN'));
  {
    const by = Object.fromEntries(made), st = by.stomach!, cut = st.getAttribute('cutA'), sp = st.getAttribute('position');
    assert.deepEqual(['bowel', 'caudate', 'colon', 'duodenum'].filter((id) => !by[id]), [], 'the tubes and the lobe are measured');
    const h = handoffSmoothness('stomach>duodenum', st, (i) => cut.getX(i) >= 0.5 && sp.getX(i) <= PYL_CUT + 0.012, by.duodenum!);
    assert.ok(h.n > 50, `the stomach's edge at the cut is measured (${h.n} vertices)`);
    assert.ok(h.gap <= 1.25 * RING_STEP, `the funnel is there at every point of the stomach's cut (the farthest ${h.gap.toFixed(4)}, a ring step is ${RING_STEP})`);
    organs.push(h);
    // the colon to the rectum is one tube (its crease is the colon's, above); its fade out is held here: a smoothstep over at least eight rings (its steepest step between two corners of a triangle 1.5 / 8)
    const f = fadeStep(by.colon!);
    assert.ok(f > 0 && f <= 1.5 / 8, `the rectum fades without a step (${f.toFixed(3)})`);
  }
  const over = overBar(vesselSmoothness(), joinSmoothness(), organs);
  // the approved placement has NO allowance: every vessel, join and organ passes the bar (Mohammad, 24 Nov: "do NOT give me a reason not to trust you")
  assert.deepEqual(over.map((r) => `${r[0]} ${r[1]} ${r[2]} ${r[3].toFixed(3)}`), [], 'rougher than the bar');
});
