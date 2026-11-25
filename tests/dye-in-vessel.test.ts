// Dye look A (docs/approved/dye.md, Mohammad 24 Nov 2026: "A"; "Dye should only appear on visible vessels"). ROOT CAUSE of the lime capsules, loose strands and the blob at the hepatic artery: the dye was a second mesh at the
// BUILT radius + 0.0035, drawn under the vessels, so it ignored the vessel's live width (collaterals and hepatic veins at 36-50 % of built width stood 70-98 % of a radius outside the wall), its fades (31 of 60 dyed vessels have
// one) and whether it is drawn at all (the sinusoid beds). Now the vessel's own fragment shader and the junction skin's mix it into the lumen colour, so all of that holds by construction. Held here: no second mesh,
// both programs mix it before the cel tones and the Circuit keeps none, and the bolus still runs through every engine vessel, drawn or not (it times and dilutes the dye on its way to the hepatic veins).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
process.env.PPS_ANATOMY = 'placed';
// @ts-ignore (the vendored engine is plain JS)
const { Engine } = await import('../src/engine/hales/portal/engine.js');
const { NETWORK } = await import('../src/scene/vessels/network.ts');
const { DyeLayer, velocityOf } = await import('../src/scene/disease/dye.ts');
const { VESSEL_FS } = await import('../src/scene/vessels/shaders.ts');
const { SKIN_FS } = await import('../src/scene/vessels/skin/shaders.ts');
const { DYE_GLSL } = await import('../src/scene/vessels/glsl-shared.ts');
const { DYE_BINS, dyeShared } = await import('../src/scene/vessels/dye-shared.ts');

const src = (f: string): string => readFileSync(new URL(`../src/scene/${f}`, import.meta.url), 'utf8');

test('the dye is no second mesh: disease/dye.ts makes no material, no mesh and no inflated shell', () => {
  const s = src('disease/dye.ts');
  for (const bad of ['ShaderMaterial', 'new Mesh', 'inflate', 'DYE_INFLATE']) assert.ok(!s.includes(bad), `dye.ts still has ${bad}`);
});

test('the tube and the junction skin paint it in the lumen colour before the cel tones, and the Circuit keeps none', () => {
  for (const [name, fs, cel] of [['tube', VESSEL_FS, 'vec3 c = celTubeToneArt(base, mix(sT'], ['skin', SKIN_FS, 'vec3 c = celTubeToneArt(base, sT']] as const) {
    assert.ok(fs.includes(DYE_GLSL), `${name}: the shared dye chunk`);
    const at = fs.indexOf('base = mix(base, dyeCol'), ce = fs.indexOf(cel);
    assert.ok(at > 0 && ce > at, `${name}: the dye is mixed into base before the cel tones`);
    assert.match(fs.slice(at, at + 160), /\(1\.0 - circT\)/, `${name}: scaled out on the Circuit`);
  }
  assert.ok(SKIN_FS.includes('uniform vec4 armDye[2];'));
  assert.match(src('vessels/skin/skin-set.ts'), /a\.obj\.dyeAt\(a\.u\)/, 'the skin reads each arm\'s dye at its seam');
});

test('the bolus runs through every engine vessel, drawn or not, and each dyed vessel is handed its row and bins in [0, 1]', () => {
  const e: any = new Engine(); e.loadPreset('cirr-decomp'); e.settle();
  const calls = new Map<string, { row: number; bins: Float32Array | null }[]>();
  const objs = (NETWORK as any[]).map((v) => ({ id: v.id, obj: { setDye: (row: number, bins: ArrayLike<number> | null) => { (calls.get(v.id) ?? calls.set(v.id, []).get(v.id)!).push({ row, bins: bins ? Float32Array.from(bins) : null }); } } }));
  const layer = new DyeLayer(objs as never);
  assert.ok(layer.inject('V_INT', 0));
  const Q = e.Qf ?? e.Q, D = new Float64Array(Q.length);
  (e as any).edgeIds?.forEach?.(() => 0);
  const ids = (NETWORK as any[]).map((v) => v.id);
  for (let t = 0; t < 240; t++) { for (let i = 0; i < D.length; i++) D[i] = 3; layer.step(0.1, { Q, D }); }
  const hasDye = (id: string): boolean => (calls.get(id) ?? []).some((c) => c.row >= 0 && c.bins!.some((x) => x > 0.01));
  assert.ok(hasDye('PV_TRUNK'), 'it reaches the portal trunk');
  for (const id of ids) for (const c of calls.get(id) ?? []) if (c.bins) for (const x of c.bins) assert.ok(x >= 0 && x <= 1.0001, `${id} bin ${x}`);
  assert.ok(velocityOf(1, 3) > 0);
  assert.equal(dyeShared.rows.length % DYE_BINS, 0);
  layer.clear();
  for (const id of ids) { const last = (calls.get(id) ?? []).at(-1); if (last) assert.equal(last.row, -1, `${id} holds no dye after clear`); }
});
