// Smooth everywhere (Mohammad, 24 Nov 2026, for the new anatomy: "make sure all the joins are smooth and all blood vessels run organically smoothly obviously, and organs look smooth").
// Every drawn vessel (no kink, no abrupt bend, no step in width), every join where vessels run on (no gap, no turn, no step) and every organ's shading normals (no crease, no facet) is held
// to one bar (tests/anatomy/smooth.ts BAR). What is rougher than it today is listed in tests/anatomy/smooth-allow.json with its worst number: it may not get rougher, and it comes off the list
// as soon as it passes. The new placement lands only with that list empty or each entry named in the push report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { vesselSmoothness, joinSmoothness, organSmoothness, overBar, type SmoothAllow } from './anatomy/smooth.ts';
import { ORGAN_MESHES, setOrganData, organsReady } from '../src/scene/organs/meshes.ts';
import { prepareOrgans } from '../src/scene/organs/prepare.ts';

const FILE = new URL('./anatomy/smooth-allow.json', import.meta.url);

test('every vessel, join and organ is as smooth as the bar, or no rougher than its listed allowance (which only goes down)', async () => {
  const b = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  await organsReady;
  const organs = prepareOrgans(ORGAN_MESHES).map(([id, g]) => organSmoothness(id, g, 'shadeN'));
  const over = overBar(vesselSmoothness(), joinSmoothness(), organs);
  if (process.env.SMOOTH_ALLOW_WRITE === '1') {
    const a: SmoothAllow = { vessel: {}, join: {}, organ: {} };
    for (const [kind, name, k, v] of over) ((a[kind] as Record<string, Record<string, number>>)[name] ??= {})[k] = Math.ceil(v * 1000) / 1000;
    writeFileSync(FILE, JSON.stringify(a, null, 1) + '\n');
    return;
  }
  const allow = JSON.parse(readFileSync(FILE, 'utf8')) as SmoothAllow;
  const rough = over.filter(([kind, name, k, v]) => !((allow[kind] as Record<string, Record<string, number>>)[name]?.[k]! >= v - 1e-9));
  assert.deepEqual(rough.map((r) => `${r[0]} ${r[1]} ${r[2]} ${r[3].toFixed(3)}`), [], 'rougher than the bar and than its allowance');
  const listed = new Set(over.map(([kind, name, k]) => `${kind} ${name} ${k}`));
  const stale = Object.entries(allow).flatMap(([kind, m]) => Object.entries(m as Record<string, Record<string, number>>).flatMap(([name, ks]) => Object.keys(ks).map((k) => `${kind} ${name} ${k}`))).filter((s) => !listed.has(s));
  assert.deepEqual(stale, [], 'these now pass the bar: take them off tests/anatomy/smooth-allow.json');
});
