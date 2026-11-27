// Every GLSL program of the app, compiled by glslang (the Khronos reference compiler) as the driver will be given it: three.js' own prefix, then ours. No browser, no GPU,
// about a second. This is layer 1 of the GPU-robustness plan (docs/atlas-look-plan.md section 8.1); layer 2 is the ?gl page on the device, layer 3 the plain fallback and the red pill.
//
// It exists because two bugs reached an iPhone that no node test could see: a redeclared attribute (`rk`, 19 Nov: every vessel vanished) and a tube of no radius (NaN geometry:
// the black varix spindle). The first is exactly what glslang refuses.
//
// glslang: `apt-get install glslang-tools` (Linux) or `brew install glslang` (Mac). Without it the compile tests are skipped with a note; the source checks still run, and the
// assembled text is still parsed by the GLSL parser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadAllPrograms } from './gl-all-programs.ts';
import { type Program, ES3_FLOOR, assemble, budget, declarations, THREE_FRAGMENT_NAMES, THREE_VERTEX_NAMES } from '../src/debug/gl-programs.ts';
import { GL_FILES } from '../src/debug/gl-registry.ts';
import { onSceneGraph, programsOfModule } from '../src/debug/gl-auto.ts';
import { glslFiles } from '../scripts/gl-scan.mjs';
import { VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { undeclared, usedBeforeDeclared, badSamplers, stageNames } from './gl-undeclared.ts';
import { uniformChecks } from './gl-gate.ts';

// every file that holds GLSL and is not on the closed hand list is found by scanning and its programs read from the module (src/debug/gl-auto.ts): a new shader needs nothing registered.
// The programs are the ones the app draws with, ALL of them: the one loader (tests/gl-all-programs.ts) builds the organs, the micro views and the late classes first (Plan 41).
const scanned: string[] = glslFiles();
const { programs, auto } = await loadAllPrograms();

const which = (bin: string) => spawnSync(bin, ['--version'], { encoding: 'utf8' }).status === 0;
const GLSLANG = process.env.GLSLANG || ['glslangValidator', 'glslang'].find(which);
const SKIP = GLSLANG ? false : 'glslang is not installed (apt-get install glslang-tools, or brew install glslang): the program compile checks did not run';
if (!GLSLANG) console.warn(`\n[glsl-compile] ${SKIP}\n`);

/** Compiles and links one program's two stages with glslang; the list of errors, empty when it is clean. */
function compile(vertexGlsl: string, fragmentGlsl: string): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'glsl-'));
  try {
    const vs = join(dir, 'p.vert'), fs = join(dir, 'p.frag');
    writeFileSync(vs, vertexGlsl); writeFileSync(fs, fragmentGlsl);
    const r = spawnSync(GLSLANG!, ['-l', vs, fs], { encoding: 'utf8' });
    const text = `${r.stdout}${r.stderr}`;
    return r.status === 0 ? [] : text.split('\n').filter((l) => /^(ERROR|WARNING: .*(undefined|redefin))/.test(l) || /^ERROR/.test(l)).map((l) => l.replace(dir + '/', '')).slice(0, 12).concat(text.trim() ? [] : ['glslang failed with no message']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('the scene graph and the registry hold the programs the app draws with', () => {
  const names = programs.map((p) => p.name);
  for (const want of ['vessel', 'toon', 'ink', 'circuit plate', 'circuit dots', 'circuit resistors', 'organ wash', 'charts', 'doppler spectrum', 'fibroscan map']) {
    assert.ok(names.some((n) => n === want || n.startsWith(want + ' ')), `${want} is among the programs (${names.join(' | ')})`);
  }
  // the vessel program comes with its veil define and two sides of a tube
  assert.ok(names.some((n) => n.startsWith('vessel') && n.includes('VEIL')), 'the vessel veil is a program of its own (a define)');
});

for (const p of programs) {
  test(`${p.name} compiles and links in glslang`, { skip: SKIP }, () => {
    const errors = compile(p.vertexGlsl, p.fragmentGlsl);
    assert.deepEqual(errors, [], `${p.name}: a real GPU refuses this program, and everything drawn with it is missing`);
  });
}

test('glslang refuses the bug that blanked every vessel on 19 Nov: a declaration twice (the check is live)', { skip: SKIP }, () => {
  const bad = assemble({ vertexShader: VESSEL_VS + '\nattribute float rk;\n', fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }', defines: {}, side: 2, transparent: false, blending: 1, alphaToCoverage: false });
  const errors = compile(bad.vertexGlsl, bad.fragmentGlsl);
  assert.ok(errors.some((e) => /rk|redefinition/.test(e)), `glslang said: ${errors.join(' / ') || 'nothing'}`);
});

test('glslang refuses a name three.js already declares for a ShaderMaterial, a type error and a missing precision', { skip: SKIP }, () => {
  const fs = 'void main() { gl_FragColor = vec4(1.0); }';
  const base = { fragmentShader: fs, defines: {}, side: 0, transparent: false, blending: 1, alphaToCoverage: false };
  assert.ok(compile(assemble({ ...base, vertexShader: 'attribute vec3 position;\nvoid main() { gl_Position = vec4(position, 1.0); }' }).vertexGlsl, assemble({ ...base, vertexShader: '' }).fragmentGlsl).length > 0, 'position declared twice');
  assert.ok(compile(assemble({ ...base, vertexShader: 'void main() { float x = vec3(1.0); gl_Position = vec4(x); }' }).vertexGlsl, assemble({ ...base, vertexShader: '' }).fragmentGlsl).length > 0, 'a vec3 into a float');
  assert.ok(compile('#version 300 es\nvoid main() { gl_Position = vec4(0.0); }', '#version 300 es\nuniform sampler2D t; out vec4 o; void main() { o = texture(t, vec2(0.0)); }').length > 0, 'a fragment shader with no float precision');
});

// Plan 28: the lobule plate sampled `mapCB` and never declared it; the device refused the program and the whole tissue vanished. A syntax parse cannot see that and glslang is not
// installed in the cloud, so this one always runs: every name a program uses resolves to a declaration (scope chain), a GLSL builtin or three.js' prefix, and every sampler call names a declared sampler.
test('every name every program uses is declared, and every texture call names a declared sampler (no glslang needed)', () => {
  const bad: string[] = [];
  for (const p of programs) for (const stage of ['vertex', 'fragment'] as const) {
    const glsl = stage === 'vertex' ? p.vertexGlsl : p.fragmentGlsl;
    const at = (n: string) => glsl.split('\n').findIndex((l) => new RegExp(`\\b${n}\\b`).test(l)) + 1;
    for (const u of undeclared(glsl, stageNames(p, stage))) bad.push(`${p.name} (${stage}): ${u.split('@')[0]} is used and never declared (first near line ${at(u.split('@')[0]!)})`);
    for (const n of badSamplers(glsl)) bad.push(`${p.name} (${stage}): a texture call samples ${n}, which is no declared sampler`);
    for (const u of usedBeforeDeclared(glsl)) bad.push(`${p.name} (${stage}): ${u} is used above the line that declares it (a chunk injected before the declaration it needs)`);
  }
  assert.deepEqual(bad, [], 'a real GPU refuses the program, and everything drawn with it is missing');
  assert.ok(programs.length > 40, `${programs.length} programs checked`);
  assert.ok(programs.some((p) => p.name === 'lobule plate'), 'the lobule plate is among them (it is mounted only with the lobule view, so the registry gives it by hand)');
  console.log(`[glsl-declared] ${programs.length} programs checked, every name declared`);
});

test('the declaration check is live: it names the undeclared sampler of 9aad1bb4\'s plate', () => {
  const plate = programs.find((p) => p.name === 'lobule plate')!;
  const broken = plate.fragmentGlsl.replace('uniform sampler2D mapCB;', '');
  assert.notEqual(broken, plate.fragmentGlsl, 'the plate declares mapCB');
  assert.ok(undeclared(broken, THREE_FRAGMENT_NAMES).some((u) => u.startsWith('mapCB@')));
  assert.deepEqual(badSamplers(broken), ['mapCB']);
});

// 23 Nov 2026: the plate's `varying vec2 vL;` sat below the injected cv-band chunk that reads it; the name was declared "somewhere", so the check above passed, and the device refused the program.
test('the use-before-declaration check is live: the plate with `vL` declared below the central vein band is named', () => {
  const plate = programs.find((p) => p.name === 'lobule plate')!;
  const line = 'varying vec2 vL;';
  assert.equal(plate.fragmentGlsl.split(line).length, 2, 'the plate declares vL once');
  assert.deepEqual(usedBeforeDeclared(plate.fragmentGlsl), [], 'as built, every global is declared before its first use');
  const broken = plate.fragmentGlsl.replace(line, '') + `\n${line}\n`;
  assert.ok(usedBeforeDeclared(broken).some((u) => u.startsWith('vL@')), `named: ${usedBeforeDeclared(broken).join(', ') || 'nothing'}`);
  const fn = 'float later(float a);\nvoid main() { gl_FragColor = vec4(later(1.0)); }\nfloat later(float a) { return a; }\n';
  assert.deepEqual(usedBeforeDeclared(fn), [], 'a prototype above the call is a declaration');
  assert.ok(usedBeforeDeclared(fn.replace('float later(float a);\n', '')).some((u) => u.startsWith('later()@')), 'a function called above its definition is named');
});

test('every program declares nothing twice, and nothing three.js already declares', () => {
  for (const p of programs) {
    for (const [stage, src] of [['vertex', p.vertex], ['fragment', p.fragment]] as const) {
      const seen = new Set<string>();
      const builtin = p.kind === 'three' ? (stage === 'vertex' ? THREE_VERTEX_NAMES : THREE_FRAGMENT_NAMES) : [];
      for (const d of declarations(src)) {
        assert.ok(!seen.has(d.name), `${p.name} (${stage}) declares ${d.name} twice`);
        seen.add(d.name);
        assert.ok(!builtin.includes(d.name), `${p.name} (${stage}) redeclares ${d.name}, which three.js declares`);
      }
    }
  }
});

test('every uniform a ShaderMaterial\'s shader declares is in its material, with a value (a missing one reads 0, or throws on the first draw)', () => {
  const bad: string[] = [];
  for (const p of programs) for (const problem of uniformChecks(p)) bad.push(problem);
  assert.deepEqual(bad, []);
});

test('no program asks for more than the floor every phone meets (attributes, varyings, samplers, uniform vectors)', () => {
  for (const p of programs) {
    const b = budget(p);
    for (const k of Object.keys(ES3_FLOOR) as (keyof typeof ES3_FLOOR)[]) assert.ok(b[k] <= ES3_FLOOR[k], `${p.name} uses ${b[k]} ${k} (floor ${ES3_FLOOR[k]})`);
  }
});

test('the assembled text starts with the version and has main() in both stages', () => {
  for (const p of programs) {
    assert.match(p.vertexGlsl, /^#version 300 es\n/, p.name);
    assert.match(p.fragmentGlsl, /^#version 300 es\n/, p.name);
    assert.match(p.vertexGlsl, /void\s+main\s*\(/, p.name);
    assert.match(p.fragmentGlsl, /void\s+main\s*\(/, p.name);
  }
});

// ---- the completeness guard: GLSL that nothing compiles ----
test('every file that holds GLSL is compiled: on the closed hand list, or giving its programs itself (GL_PROGRAMS, _VS/_FS pairs, or GL_ON_SCENE_GRAPH)', () => {
  const hand = scanned.filter((f) => f in GL_FILES);
  const fresh = scanned.filter((f) => !(f in GL_FILES));
  const silent = fresh.filter((f) => !programsOfModule(f, auto[f]!).length && !onSceneGraph(auto[f]!));
  assert.deepEqual(silent, [], 'GLSL in a file that gives no program to compile: `export const GL_PROGRAMS = [{ name, vs, fs, defines? }]` (src/scene/glow-fx.ts), or name its stages <STEM>_VS and <STEM>_FS, or `export const GL_ON_SCENE_GRAPH = \'why\'` when the scene graph holds its materials (src/debug/gl-auto.ts)');
  for (const f of fresh.filter((x) => programsOfModule(x, auto[x]!).length)) {
    for (const p of programsOfModule(f, auto[f]!)) assert.ok(programs.some((q) => q.vertexGlsl === p.vertexGlsl && q.fragmentGlsl === p.fragmentGlsl), `${f}: ${p.name} is among the programs compiled`);
  }
  assert.ok(hand.length > 20, 'the hand list is still found by the scan');
  for (const f of Object.keys(GL_FILES)) assert.ok(statSync(join('src', f)).isFile(), `${f} is listed but does not exist`);
  assert.ok(fresh.includes('scene/glow-fx.ts'), 'the glow\'s passes are found by the scan, not listed by hand');
  assert.ok(programs.some((p) => p.name === 'glow blur') && programs.some((p) => p.name.startsWith('glow lay')), 'and compiled');
});

test('the ?gl page reads the same scan: the build makes `virtual:gl-modules` from scripts/gl-scan.mjs and the check imports it, so a new shader file is checked on the device with nothing registered', () => {
  const vite = readFileSync('vite.config.ts', 'utf8'), run = readFileSync(join('src', 'debug', 'gl-check-run.ts'), 'utf8');
  assert.match(vite, /import \{ glslFiles \} from '\.\/scripts\/gl-scan\.mjs'/);
  assert.match(vite, /virtual:gl-modules/); assert.match(vite, /plugins: \[[^\]]*\bglModules\(\)[,\]]/);
  assert.match(run, /import\('virtual:gl-modules'\)/);
  assert.match(readFileSync(join('src', 'debug', 'gl-registry.ts'), 'utf8'), /autoPrograms\(fresh\)/);
});
