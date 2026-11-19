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
import { CelScene } from '../src/scene/scene.ts';
import { type Program, ES3_FLOOR, assemble, budget, declarations, uniformProblems, THREE_FRAGMENT_NAMES, THREE_VERTEX_NAMES } from '../src/debug/gl-programs.ts';
import { GL_FILES, allPrograms } from '../src/debug/gl-registry.ts';
import { VESSEL_VS } from '../src/scene/vessels/shaders.ts';

const FIBRO = join('src', 'ui', 'tests', 'fibro', 'copied', 'fibro-gl.copied.js');
const programs = allPrograms(new CelScene().scene, readFileSync(FIBRO, 'utf8'));

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
  for (const want of ['vessel', 'toon', 'ink', 'circuit plate', 'circuit dots', 'circuit resistors', 'dye overlay', 'organ wash', 'charts', 'doppler spectrum', 'fibroscan map']) {
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
  for (const p of programs) for (const problem of uniformProblems(p)) bad.push(`${p.name}: ${problem}`);
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

// ---- the completeness guard: GLSL that the registry does not know ----
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const f = join(dir, n);
  return statSync(f).isDirectory() ? walk(f) : /\.(ts|tsx|js|mjs)$/.test(n) ? [f] : [];
});
test('every file that holds GLSL is in src/debug/gl-registry.ts (a new shader is compiled by this test, or it fails here)', () => {
  const marker = /gl_Position|gl_FragColor|#version 300 es/;
  const hits = walk('src')
    .filter((f) => !f.startsWith(join('src', 'engine', 'hales')) && !f.startsWith(join('src', 'engine', 'host')) && !f.startsWith(join('src', 'debug')))
    .filter((f) => marker.test(readFileSync(f, 'utf8')))
    .map((f) => f.slice('src/'.length).split('\\').join('/'));
  const unknown = hits.filter((f) => !(f in GL_FILES));
  assert.deepEqual(unknown, [], 'GLSL in a file the registry does not list: add it to GL_FILES in src/debug/gl-registry.ts (and register its program there if the scene graph does not hold it), so glsl-compile.test.ts compiles it');
  for (const f of Object.keys(GL_FILES)) assert.ok(statSync(join('src', f)).isFile(), `${f} is listed but does not exist`);
});
