// The gate over EVERY shader the app draws with (Plan 41, from the 22 Nov shader audit). ROOT CAUSE it answers: the node shader checks built only the eager scene (55 programs), without the organs, the micro views, three's per-mesh
// prefix (USE_COLOR, instancing) or the live variants (the skin's diagnostics, the inspector's hooks), so a third of what a phone compiles was never read (the lobule plate's undeclared `mapCB` reached a phone that way), and one
// texture sample sat after a discard. Here the one loader (tests/gl-all-programs.ts) makes all of them, and each variant is checked for: (a) nothing undeclared, (b) samplers declared once and sampled by a declared name
// (preprocessed text), (c) every live uniform in the material with the right kind and length, (d) vertex outs equal fragment ins, (e) no derivative or implicit-LOD texture call after a discard, (f) the budget, the vessel pinned.
// It takes about a minute (the organs and micro build), which is why it is one file: pre-push selects tests by the files they mention, and this one mentions shader paths only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NormalBlending, ShaderMaterial } from 'three';
import { assemble, declarations, type Program } from '../src/debug/gl-programs.ts';
import { loadAllPrograms } from './gl-all-programs.ts';
import { RAW_HOSTS, RAW_NOT_DRAWN, VESSEL_PIN, afterDiscardProblems, budgetProblems, headroom, hostUniforms, lowpSamplerProblems, samplerProblems, undeclaredProblems, uniformChecks, varyingProblems, rawUniformProblems } from './gl-gate.ts';
import { THREE_VERTEX_NAMES } from '../src/debug/gl-programs.ts';
import { undeclared } from './gl-undeclared.ts';

const { programs, donors } = await loadAllPrograms();
const byName = (n: string) => programs.find((p) => p.name === n || p.name.startsWith(n + ' '))!;

test('the loader holds the whole app: 77+ programs, the organs, the micro views, the skin\'s variants, the late classes', () => {
  assert.ok(programs.length >= 77, `${programs.length} programs`);
  const names = programs.map((p) => p.name);
  for (const want of ['micro3d toon', 'micro3d ink', 'organ wash', 'lobule plate', 'bleed jet ink', 'post aa', 'glow blur', 'skin (copy 2, VDBG, SKIN_NOMARKS)', 'skin (copy 1, SKIN_NOHEADS)']) assert.ok(names.some((n) => n === want || n.startsWith(want + ' ')), `${want} is among the programs`);
  assert.ok(programs.some((p) => p.material?.name === 'lobule marks'), 'the lobule\'s marks');
  assert.ok(programs.some((p) => p.flags?.vcol), 'a vertex-colour program is read (the lobule parts)');
  assert.ok(programs.some((p) => p.flags?.inst && !p.flags.instcol) && programs.some((p) => p.flags?.instcol), 'an InstancedMesh is read with and without instance colours');
  assert.ok(programs.some((p) => p.standIn), 'the compile-only stand-ins are read');
});

// every material the source builds by name is among the programs (or says why not): "the plate was missing" is caught here
const ABSENT: Record<string, string> = {
  'spleen ring': 'made when the spleen\'s range ring first shows, from the organ ink\'s own shaders (the `organ halo` stand-in holds that program)',
  'organ halo': 'a stand-in made as the organs build, wearing the organ ink\'s shaders (added to the stand-ins when each organ arrives; the organ ink programs are here)',
};
function sourceNames(): string[] {
  const out = new Set<string>();
  const walk = (d: string) => { for (const n of readdirSync(d)) { const f = join(d, n); if (statSync(f).isDirectory()) { if (f !== join('src', 'debug') && !f.includes(join('src', 'engine'))) walk(f); } else if (/\.(ts|tsx)$/.test(n)) for (const m of readFileSync(f, 'utf8').matchAll(/new ShaderMaterial\(\{\s*name:\s*'([^']+)'/g)) out.add(m[1]!); } };
  walk('src');
  return [...out].sort();
}
test('completeness: every `new ShaderMaterial({ name })` in src/ has a program here, or an entry that says why not', () => {
  const have = new Set<string>([...programs.map((p) => p.material?.name ?? ''), ...donors.map((m) => m.name), ...programs.map((p) => p.name)]);
  const names = sourceNames();
  assert.ok(names.length > 30, `${names.length} named materials found in src/`);
  const missing = names.filter((n) => ![...have].some((h) => h === n || h.startsWith(n + ' ') || h.startsWith(n + ':')) && !(n in ABSENT));
  assert.deepEqual(missing, [], 'a ShaderMaterial the checks never hold: register it, or build it in tests/gl-all-programs.ts, or list it in ABSENT with the reason');
  for (const n of Object.keys(ABSENT)) assert.ok(names.includes(n), `${n} is listed absent but no longer exists`);
});

test('(a) nothing any program uses is undeclared', () => assert.deepEqual(programs.flatMap(undeclaredProblems), []));
test('(b) samplers are declared once and every texture call names one (on the preprocessed text)', () => assert.deepEqual(programs.flatMap(samplerProblems), []));

// the registry builds a few programs from text only; these have no material to read (the organ art's variants need the art file, which node has not)
const NO_MATERIAL: Record<string, string> = {
  'organ wash + art': 'the art variant is made when the art file arrives (organ-art.ts patchedShaders); its uniforms are the organ wash\'s plus the art\'s',
  'organ wash + stomach': 'as the art variant, with the esophagus\'s tone and fade',
  'organ wash + colon': 'as the art variant, with the rectum\'s fade',
};
test('(c) every live uniform is in its material with the right kind and length; the real materials are built for the registry programs', () => {
  const bare = programs.filter((p) => p.kind === 'three' && !p.material && !p.standIn && !(p.name in NO_MATERIAL)).map((p) => p.name);
  assert.deepEqual(bare, [], 'a program with no material has its uniforms unchecked: build the real material in tests/gl-all-programs.ts (or list it in NO_MATERIAL with the reason)');
  assert.deepEqual(programs.flatMap(uniformChecks), []);
  const checked = programs.filter((p) => p.material).length;
  assert.ok(checked >= programs.length - 20, `${checked} of ${programs.length} programs have a real material`);
});

test('(d) every varying the fragment shader reads is written by the vertex shader with the same type', () => assert.deepEqual(programs.flatMap(varyingProblems), []));
test('(e) no derivative and no implicit-LOD texture call after a discard', () => assert.deepEqual(programs.flatMap(afterDiscardProblems), []));
test('(f) the budget: at or under the floor, the vessel pinned at 16 attributes and 14 varyings, headroom printed', () => {
  assert.deepEqual(programs.flatMap(budgetProblems), []);
  const vessel = programs.filter((p) => /^vessel\b/.test(p.name));
  assert.ok(vessel.length >= 4, `${vessel.length} vessel programs`);
  console.log(`[shader-bindings] ${programs.length} programs; least headroom first:\n  ${programs.map((p) => ({ p, h: headroom(p) })).sort((a, b) => Number(/attributes 0|varyings 0/.test(b.h)) - Number(/attributes 0|varyings 0/.test(a.h))).slice(0, 8).map((x) => x.h).join('\n  ')}`);
});

test('raw programs: every uniform the host looks up is declared, every declared uniform is looked up, and a sampler is highp', () => {
  const bad: string[] = [];
  for (const h of RAW_HOSTS) for (const n of h.programs) { const p = programs.find((q) => q.name === n); assert.ok(p, `${n} is among the programs`); bad.push(...rawUniformProblems(p, h)); }
  for (const p of programs.filter((q) => q.kind === 'raw')) bad.push(...lowpSamplerProblems(p));
  assert.deepEqual(bad, []);
  for (const n of Object.keys(RAW_NOT_DRAWN)) assert.ok(programs.some((p) => p.name === n), `${n} is listed but is not a program`);
  const raw = programs.filter((p) => p.kind === 'raw').map((p) => p.name).filter((n) => !(n in RAW_NOT_DRAWN) && !RAW_HOSTS.some((h) => h.programs.includes(n)));
  assert.deepEqual(raw, [], 'a raw program with no host entry: add it to RAW_HOSTS in tests/gl-gate.ts');
});

test('warning only: uniforms a material carries that no source declares (the shared bags hand a program names it does not read)', () => {
  const extra: string[] = [];
  const declaredAnywhere = new Set<string>();
  for (const p of programs) for (const d of [...declarations(p.vertexGlsl), ...declarations(p.fragmentGlsl)]) declaredAnywhere.add(d.name);
  for (const m of new Set(programs.map((p) => p.material).filter(Boolean) as ShaderMaterial[])) for (const u of Object.keys(m.uniforms)) if (!declaredAnywhere.has(u)) extra.push(`${m.name}.${u}`);
  if (extra.length) console.warn(`[shader-bindings] ${extra.length} material uniforms no program declares: ${extra.slice(0, 20).join(', ')}${extra.length > 20 ? ', …' : ''}`);
});

// ---- liveness: each check must FAIL on a program that is wrong ----
const material = (vertexShader: string, fragmentShader: string, extra: Partial<ShaderMaterial> = {}) => new ShaderMaterial({ vertexShader, fragmentShader, ...extra });
const fake = (name: string, vs: string, fs: string, flags = {}): Program => ({ name, vertex: vs, fragment: fs, ...assemble({ vertexShader: vs, fragmentShader: fs, defines: {}, side: 0, transparent: true, blending: NormalBlending, alphaToCoverage: false }, flags), flags });
const FS_OK = 'void main() { gl_FragColor = vec4(1.0); }';
const VS_OK = 'void main() { gl_Position = vec4(position, 1.0); }';

test('liveness: the plate without its mapCB declaration is named by (a) and (b)', () => {
  const plate = byName('lobule plate');
  const broken = { ...plate, fragmentGlsl: plate.fragmentGlsl.replace('uniform sampler2D mapCB;', '') };
  assert.notEqual(broken.fragmentGlsl, plate.fragmentGlsl);
  assert.ok(undeclaredProblems(broken).some((s) => /mapCB/.test(s)), 'undeclared');
  assert.deepEqual(samplerProblems(broken).filter((s) => /mapCB/.test(s)).length, 1, 'one sampler problem for mapCB (the plate calls it twice, and it is named once)');
});
test('liveness: a texture call after a discard is named', () => {
  const p = fake('fixture', VS_OK, 'uniform sampler2D t; varying vec2 vUv;\nvoid main() { if (vUv.x > 2.0) discard; gl_FragColor = texture2D(t, vUv); }');
  assert.ok(afterDiscardProblems(p).length > 0);
  assert.equal(afterDiscardProblems(fake('ok', VS_OK, 'uniform sampler2D t; varying vec2 vUv;\nvoid main() { vec4 c = texture2D(t, vUv); if (vUv.x > 2.0) discard; gl_FragColor = c; }')).length, 0);
});
test('liveness: a lowp-sampler raw fragment shader is named', () => {
  const raw = (fs: string): Program => ({ name: 'fixture raw', vertex: '', fragment: fs, vertexGlsl: '', fragmentGlsl: fs, kind: 'raw' });
  assert.equal(lowpSamplerProblems(raw('#version 300 es\nprecision highp float;\nuniform sampler2D t;\nout vec4 o;\nvoid main() { o = texelFetch(t, ivec2(0), 0); }')).length, 1);
  assert.equal(lowpSamplerProblems(raw('#version 300 es\nprecision highp float;\nprecision highp sampler2D;\nuniform sampler2D t;\nout vec4 o;\nvoid main() { o = texelFetch(t, ivec2(0), 0); }')).length, 0);
});
test('liveness: a vertex-colour shader reading `color` outside USE_COLOR is named (the flag adds the declaration three would)', () => {
  const vs = 'varying vec3 vC; void main() { vC = color; gl_Position = vec4(position, 1.0); }';
  assert.ok(undeclaredProblems(fake('plain mesh', vs, 'varying vec3 vC; void main() { gl_FragColor = vec4(vC, 1.0); }')).some((s) => /color/.test(s)), 'no vertexColors: `color` is undeclared');
  assert.deepEqual(undeclaredProblems(fake('vertex colours', vs, 'varying vec3 vC; void main() { gl_FragColor = vec4(vC, 1.0); }', { vcol: true })), []);
  assert.ok(undeclared(assemble({ vertexShader: 'void main() { gl_Position = instanceMatrix * vec4(position, 1.0); }', fragmentShader: FS_OK, defines: {} }, {}).vertexGlsl, THREE_VERTEX_NAMES).some((u) => u.startsWith('instanceMatrix@')), 'no instancing: instanceMatrix is undeclared');
  assert.deepEqual(undeclared(assemble({ vertexShader: 'void main() { gl_Position = instanceMatrix * vec4(position, 1.0); }', fragmentShader: FS_OK, defines: {} }, { inst: true }).vertexGlsl, THREE_VERTEX_NAMES), []);
});
test('liveness: a 17th vessel attribute, a 16th varying and a vessel that frees a slot are all named', () => {
  const v = programs.find((p) => /^vessel\b/.test(p.name))!;
  assert.deepEqual(budgetProblems(v), [], 'the real vessel is at its pin');
  const more = { ...v, vertexGlsl: v.vertexGlsl + '\nattribute float extra17;\n' };
  assert.ok(budgetProblems(more).some((s) => /17 attributes/.test(s)));
  const moreV = { ...v, vertexGlsl: v.vertexGlsl + '\nvarying float extraV;\nvarying float extraW;\n' };   // (the vessel stands at 14: two more reach the 16th)
  assert.ok(budgetProblems(moreV).some((s) => /16 varyings/.test(s)));
  assert.equal(VESSEL_PIN.attributes, 16); assert.equal(VESSEL_PIN.varyings, 14);
});
test('liveness: a uniform of the wrong kind or length, and a varying of the wrong type, are named', () => {
  const m = material('uniform vec3 a; uniform float b[3]; void main() { gl_Position = vec4(a * b[0], 1.0); }', 'void main() { gl_FragColor = vec4(1.0); }');
  m.uniforms = { a: { value: 1 }, b: { value: [1, 2] } };
  const p = { ...fake('fixture', m.vertexShader, m.fragmentShader), material: m };
  assert.equal(uniformChecks(p).length, 2);
  m.uniforms = { a: { value: m.uniforms.a!.value }, b: { value: [1, 2, 3] } };
  assert.equal(uniformChecks({ ...p, material: m }).length, 1, 'a float where a vec3 is declared');
  assert.equal(varyingProblems(fake('vary', 'varying vec3 vN; void main() { vN = normal; gl_Position = vec4(position, 1.0); }', 'varying vec2 vN; void main() { gl_FragColor = vec4(vN, 0.0, 1.0); }')).length, 1);
  assert.equal(varyingProblems(fake('vary2', VS_OK, 'varying vec2 vMissing; void main() { gl_FragColor = vec4(vMissing, 0.0, 1.0); }')).length, 1);
});
test('liveness: a raw host that looks up a name the shader lacks, or leaves one unset, is named', () => {
  const h = RAW_HOSTS[0]!;
  const p: Program = { name: 'fixture raw', vertex: '', fragment: '', vertexGlsl: '#version 300 es\nuniform vec2 u_size;\nvoid main() { gl_Position = vec4(u_size, 0.0, 1.0); }', fragmentGlsl: '#version 300 es\nprecision highp float;\nuniform float u_dead;\nout vec4 o;\nvoid main() { o = vec4(u_dead); }', kind: 'raw' };
  assert.equal(rawUniformProblems(p, h, ['u_size', 'u_missing']).length, 2);
  assert.ok(hostUniforms(h).includes('u_size'));
});
