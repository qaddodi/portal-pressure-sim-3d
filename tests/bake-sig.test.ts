// Plan 50: a bake skips itself when its signature (the sha256 of its script and every file in its import graph) is unchanged. A missed input would serve an old bake, so the walker is pinned here:
// it follows static imports, dynamic imports with a string, and `new URL('…', import.meta.url)`, and a touched input changes the signature while an untouched one does not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { graph, bakeSig, specifiers, isCurrent, writeSig, SKINS_SKIP, SKINS_EXTRAS } = await import('../scripts/bake-sig.mjs');

test('the walker finds every kind of import in a source text', () => {
  const text = [
    "import a from './a.ts';", "import './side.ts';", "export * from './re-export.ts';", "const m = await import('./lazy.ts?raw');",
    "new Worker(new URL('./worker.ts', import.meta.url));", "import three from 'three';", "const n = `./${x}.ts`; import(n);",
  ].join('\n');
  assert.deepEqual(specifiers(text).sort(), ['./a.ts', './lazy.ts', './re-export.ts', './side.ts', './worker.ts']);
});

const fixture = () => {
  const d = mkdtempSync(join(tmpdir(), 'bake-sig-'));
  mkdirSync(join(d, 'deep'));
  writeFileSync(join(d, 'entry.mjs'), "import { a } from './a.ts'; const l = await import('./deep/lazy.js'); new URL('./data.bin', import.meta.url);");
  writeFileSync(join(d, 'a.ts'), "import { b } from './b';\nexport const a = 1;");
  writeFileSync(join(d, 'b.ts'), 'export const b = 1;');
  writeFileSync(join(d, 'deep/lazy.js'), "export * from '../c.json';");
  writeFileSync(join(d, 'c.json'), '{"c":1}');
  writeFileSync(join(d, 'data.bin'), 'x');
  writeFileSync(join(d, 'unrelated.ts'), 'export const u = 1;');
  writeFileSync(join(d, 'cel-shaders.ts'), 'export const s = 1;');
  writeFileSync(join(d, 'a.ts'), "import { b } from './b';\nimport './cel-shaders.ts';\nexport const a = 1;");
  return d;
};

test('the graph is the entry, its static, dynamic and URL imports (extensionless too), and nothing else', () => {
  const d = fixture();
  assert.deepEqual(graph(join(d, 'entry.mjs')).map((f: string) => f.slice(d.length + 1)), ['a.ts', 'b.ts', 'c.json', 'data.bin', 'deep/lazy.js', 'entry.mjs']);
  assert.ok(!graph(join(d, 'entry.mjs')).some((f: string) => f.endsWith('unrelated.ts')));
});

test('a touched input changes the signature; an untouched file, or a shader, does not; an extra data file counts', () => {
  const d = fixture(), entry = join(d, 'entry.mjs'), sig = () => bakeSig(entry, [join(d, 'unrelated.ts')]);
  const s0 = bakeSig(entry);
  assert.equal(bakeSig(entry), s0, 'same files, same signature');
  writeFileSync(join(d, 'unrelated.ts'), 'export const u = 2;');
  assert.equal(bakeSig(entry), s0, 'a file no import reaches does not change it');
  assert.notEqual(sig(), s0, 'but as an extra it does');
  writeFileSync(join(d, 'cel-shaders.ts'), 'export const s = 2;');
  assert.equal(bakeSig(entry), s0, 'a shader (cel-shaders.ts) is never an input, and not in the graph');
  for (const f of ['b.ts', 'c.json', 'data.bin', 'deep/lazy.js', 'entry.mjs']) {
    const before = bakeSig(entry);
    writeFileSync(join(d, f), `${f === 'c.json' ? '{"c":2}' : f === 'data.bin' ? 'y' : `// touched\n${f === 'b.ts' ? 'export const b = 2;' : f === 'entry.mjs' ? "import { a } from './a.ts'; const l = await import('./deep/lazy.js'); new URL('./data.bin', import.meta.url);" : "export * from '../c.json';"}`}`);
    assert.notEqual(bakeSig(entry), before, `${f} is an input`);
  }
});

test('a sidecar says current only for the same signature and only when the output exists', () => {
  const d = mkdtempSync(join(tmpdir(), 'bake-sig-out-')), out = join(d, 'x.bin');
  assert.equal(isCurrent([out], 'abc'), false, 'no output yet');
  writeFileSync(out, 'data'); assert.equal(isCurrent([out], 'abc'), false, 'no sidecar yet');
  writeSig([out], 'abc');
  assert.equal(isCurrent([out], 'abc'), true);
  assert.equal(isCurrent([out], 'abd'), false, 'another signature');
  assert.equal(isCurrent([out, join(d, 'gone.bin')], 'abc'), false, 'one of two outputs missing');
});

test('bake-skins\' graph, pinned: the vessels, the skins, the circuit, the scene and the engine are inputs; the lobule, the sinusoid, the UI and the decks are not, bar the weld codec', () => {
  const rel = (graph('scripts/bake-skins.mjs', SKINS_SKIP) as string[]).map((f) => f.slice(process.cwd().length + 1));
  for (const must of ['scripts/bake-skins.mjs', 'src/scene/scene.ts', 'src/scene/vessels/skin/skin-set.ts', 'src/scene/vessels/skin/baked.ts', 'src/scene/vessels/skin/joins-mode.ts', 'src/scene/vessels/join-mode.ts',
    'src/scene/vessels/network.ts', 'src/scene/vessels/tubes.ts', 'src/scene/circuit/skins.ts', 'src/scene/lobule/weld-codec.ts']) assert.ok(rel.includes(must), `${must} is an input of the skins`);
  assert.ok(rel.some((f) => f.startsWith('src/engine/')), 'the engine data');
  for (const f of rel) assert.ok(!/^src\/(scene\/(lobule|micro3d|sinusoid|materials)|ui|decks)\//.test(f) || f.endsWith('weld-codec.ts'), `${f} must not be an input of the skins`);
  assert.ok(!rel.some((f) => /shaders?\.ts$|glsl/.test(f)), 'no shader');
  assert.deepEqual(SKINS_EXTRAS, ['public/anatomy/vessels.json', 'public/anatomy/organs.bin']);
});

test('the baked outputs are never inputs: the signature is the same before and after a bake wrote them', () => {
  for (const b of ['bake-skins', 'bake-welds', 'bake-organs', 'bake-charts']) {
    const rel = (graph(`scripts/${b}.mjs`, b === 'bake-skins' ? SKINS_SKIP : undefined) as string[]).map((f) => f.slice(process.cwd().length + 1));
    assert.deepEqual(rel.filter((f) => /^public\/(anatomy\/(skins|circuit-skins|organs-baked)\.bin|lobule\/|baked\/)/.test(f)), [], `${b}'s graph holds a baked output`);
  }
});

test('every bake script wires the signature: checks it before the heavy imports, skips on a match, writes it after the bake', async () => {
  const { readFileSync } = await import('node:fs');
  for (const b of ['bake-skins', 'bake-welds', 'bake-organs']) {
    const s = readFileSync(`scripts/${b}.mjs`, 'utf8');
    assert.ok(s.indexOf('isCurrent(') > 0 && s.indexOf('isCurrent(') < s.indexOf("await import("), `${b} checks the signature before importing the scene`);
    assert.match(s, /writeSig\(/, `${b} writes it`);
    assert.match(s, /--force/, `${b} can be forced`);
  }
});
