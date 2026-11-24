// Smooth everywhere (Mohammad, 24 Nov 2026, for the new anatomy: "make sure all the joins are smooth and all blood vessels run organically smoothly obviously, and organs look smooth").
// Every drawn vessel (no kink, no abrupt bend, no step in width), every join where vessels run on (no gap, no turn, no step) and every organ's shading normals (no crease, no facet) is held
// to one bar (tests/anatomy/smooth.ts BAR). What is rougher than it today is listed in tests/anatomy/smooth-allow.json with its worst number: it may not get rougher, and it comes off the list
// as soon as it passes. The new placement lands only with that list empty or each entry named in the push report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { vesselSmoothness, joinSmoothness, organSmoothness, handoffSmoothness, fadeStep, overBar, type SmoothAllow } from './anatomy/smooth.ts';
import { ORGAN_MESHES, setOrganData, organsReady } from '../src/scene/organs/meshes.ts';
import { prepareOrgans } from '../src/scene/organs/prepare.ts';
import { PLACED } from '../src/scene/anatomy/source.ts';
import { caudateGeometry } from '../src/scene/organs/caudate.ts';
import { PYL_CUT, RING_STEP } from '../src/scene/organs/gut-tubes.ts';

const FILE = new URL('./anatomy/smooth-allow.json', import.meta.url);

test('every vessel, join and organ is as smooth as the bar, or no rougher than its listed allowance (which only goes down)', async () => {
  const b = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  await organsReady;
  // (the approved placement: every organ, the gut's tubes (the duodenum's funnel, the packed bowel with the ileum, the colon to the rectum) and the caudate lobe's egg, on the normals they are shaded with, and the
  // stomach's hand-off to the funnel at its cut, which is two surfaces: the stomach's last drawn rows against the funnel's nearest)
  const made = prepareOrgans(PLACED ? { ...ORGAN_MESHES, caudate: caudateGeometry } : ORGAN_MESHES);
  const organs = made.map(([id, g]) => organSmoothness(id, g, 'shadeN'));
  if (PLACED) {
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
  if (process.env.SMOOTH_ALLOW_WRITE === '1' && !PLACED) {
    const a: SmoothAllow = { vessel: {}, join: {}, organ: {} };
    for (const [kind, name, k, v] of over) ((a[kind] as Record<string, Record<string, number>>)[name] ??= {})[k] = Math.ceil(v * 1000) / 1000;
    writeFileSync(FILE, JSON.stringify(a, null, 1) + '\n');
    return;
  }
  // the approved placement (PPS_ANATOMY=placed) has NO allowance: every vessel, join and organ passes the bar (Mohammad, 24 Nov: "do NOT give me a reason not to trust you")
  const allow: SmoothAllow = PLACED ? { vessel: {}, join: {}, organ: {} } : JSON.parse(readFileSync(FILE, 'utf8')) as SmoothAllow;
  const rough = over.filter(([kind, name, k, v]) => !((allow[kind] as Record<string, Record<string, number>>)[name]?.[k]! >= v - 1e-9));
  assert.deepEqual(rough.map((r) => `${r[0]} ${r[1]} ${r[2]} ${r[3].toFixed(3)}`), [], 'rougher than the bar and than its allowance');
  const listed = new Set(over.map(([kind, name, k]) => `${kind} ${name} ${k}`));
  const stale = Object.entries(allow).flatMap(([kind, m]) => Object.entries(m as Record<string, Record<string, number>>).flatMap(([name, ks]) => Object.keys(ks).map((k) => `${kind} ${name} ${k}`))).filter((s) => !listed.has(s));
  if (!PLACED) assert.deepEqual(stale, [], 'these now pass the bar: take them off tests/anatomy/smooth-allow.json');
});
