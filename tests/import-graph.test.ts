// C1 (27 Nov review): the pre-push picks tests through the import graph, so a test runs when anything it imports, at ANY depth, changed (it used to run only the tests that named the changed file themselves).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const { buildGraph, affectedBy, normalize, withoutComments, TREE_WALK } = await import('../scripts/import-graph.mjs');
const { selectTests, selectWithDepth, withinBudget, ALWAYS_DEPTH } = await import('../scripts/pre-push-select.mjs');

const tree: Record<string, string> = {
  'src/a/whole-pieces.ts': 'export const rows = 1;',
  'src/a/placed-network.ts': "import { rows } from './whole-pieces.ts';",
  'src/a/skin-set.ts': "import { build } from './placed-network.ts';",
  'src/b/lonely.ts': 'export {};',
  'src/engine/core.js': 'export {}',
  'src/engine/user.ts': "import './core.js';",
  'src/parts/one.ts': 'export {}',
  'src/parts/two.ts': 'export {}',
  'tests/helpers/source.ts': "import { readdirSync } from 'node:fs'; readdirSync('src/parts');",
  'tests/placed-network.test.ts': "import { build } from '../src/a/placed-network.ts';",
  'tests/skin-set.test.ts': "import { x } from '../src/a/skin-set.ts';",
  'tests/engine.test.ts': "import { u } from '../src/engine/user.ts';",
  'tests/parts.test.ts': "import { sceneSource } from './helpers/source.ts';",
  'tests/reads-data.test.ts': "readFileSync(new URL('../src/data/x.json', import.meta.url));",
  'tests/header-only.test.ts': "// the text of src/b/lonely.ts is pinned elsewhere\nimport './nothing.ts';",
  'tests/names-a-test.test.ts': "import { y } from './skin-set.test.ts';",
  'src/data/x.json': '{}',
};
const files = Object.keys(tree), read = (f: string): string => tree[f] ?? '';
const tests = files.filter((f) => /^tests\/[^/]+\.test\.ts$/.test(f)).map((f) => f.slice(6));
const graph = buildGraph(files, read);
const pick = (...changed: string[]): string[] => selectTests(changed, tests, (t: string) => read(`tests/${t}`), graph);

test('a change reaches the tests of the files that import it, at any depth: whole-pieces.ts runs the placed-network and skin-set tests', () => {
  assert.deepEqual(pick('src/a/whole-pieces.ts'), ['placed-network.test.ts', 'skin-set.test.ts']);
  assert.deepEqual(pick('src/a/placed-network.ts'), ['placed-network.test.ts', 'skin-set.test.ts']);
  assert.deepEqual(pick('src/a/skin-set.ts'), ['skin-set.test.ts']);
  assert.deepEqual(selectTests(['src/a/whole-pieces.ts'], tests, (t: string) => read(`tests/${t}`)), [], 'with no graph only a name in the test text counts, which is what let this through before');
});

test('the distance is kept: 1 for a test that names the file, more for one that reaches it', () => {
  const d = selectWithDepth(['src/a/whole-pieces.ts'], tests, (t: string) => read(`tests/${t}`), graph);
  assert.equal(d.get('placed-network.test.ts'), 2);
  assert.equal(d.get('skin-set.test.ts'), 3);
  assert.equal(selectWithDepth(['src/a/placed-network.ts'], tests, (t: string) => read(`tests/${t}`), graph).get('placed-network.test.ts'), 1);
});

test('a .js that is a .ts, a read of a data file and a directory a helper lists all make edges; a comment that names a file does not', () => {
  assert.deepEqual(pick('src/engine/core.js'), ['engine.test.ts']);
  assert.deepEqual(pick('src/data/x.json'), ['reads-data.test.ts']);
  assert.deepEqual(pick('src/parts/two.ts'), ['parts.test.ts'], 'tests/helpers/source.ts lists src/parts, so the test that uses it runs');
  assert.deepEqual(pick('src/b/lonely.ts'), [], 'a header comment is not an import');
});

test('a test file is never a dependency: a test that names another test is not pulled in by it, and a changed test runs on its own', () => {
  assert.deepEqual(pick('tests/skin-set.test.ts'), ['skin-set.test.ts']);
  assert.ok(!pick('src/a/whole-pieces.ts').includes('names-a-test.test.ts'));
});

test('a directory walk over a whole tree makes no edges (it would make every test depend on every file); a small directory does', () => {
  const big: Record<string, string> = { 'tests/walker.test.ts': "readdirSync('src/big')", 'tests/small.ts': "readdirSync('src/big/few')" };
  for (let i = 0; i < TREE_WALK + 1; i++) big[`src/big/f${i}.ts`] = 'export {}';
  big['src/big/few/one.ts'] = 'export {}';
  const g = buildGraph(Object.keys(big), (f: string) => big[f] ?? '');
  assert.equal(g.get('tests/walker.test.ts')!.size, 0);
  assert.deepEqual([...g.get('tests/small.ts')!], ['src/big/few/one.ts']);
});

test('paths and comments are read as written: dots and parents fold, leading comment lines go, trailing code stays', () => {
  assert.equal(normalize('a/b/../c/./d'), 'a/c/d'); assert.equal(normalize('../x'), null);
  assert.equal(withoutComments("// import './a.ts'\n/* x\n './b.ts' */\nimport './c.ts'; // './d.ts'"), "\n\nimport './c.ts'; // './d.ts'");
  assert.equal(affectedBy(new Map([['a', new Set(['b'])], ['b', new Set(['c'])], ['c', new Set(['a'])]]), ['c']).get('a'), 2, 'a cycle ends');
});

test('the near tests always run; the deeper ones run nearest first inside the time budget, and what is left is returned to be named', () => {
  const depths = new Map([['near.test.ts', 1], ['two.test.ts', 2], ['three.test.ts', 3], ['four.test.ts', 4]]);
  const all = withinBudget(depths, {}, 2, 1000);
  assert.deepEqual(all.run, ['near.test.ts', 'two.test.ts', 'three.test.ts', 'four.test.ts']); assert.deepEqual(all.left, []);
  const tight = withinBudget(depths, { 'near.test.ts': 100, 'two.test.ts': 4, 'three.test.ts': 4, 'four.test.ts': 4 }, 2, 5);
  assert.deepEqual(tight.run, ['near.test.ts', 'two.test.ts', 'three.test.ts'], 'a near test runs however slow; the rest while they fit');
  assert.deepEqual(tight.left, ['four.test.ts']);
  assert.equal(ALWAYS_DEPTH, 1);
});

// the real tree: the review's own example, one level deeper than the old rule saw
test('on the real tree a change reaches tests that only an import chain connects, and the graph builds in seconds', () => {
  const all = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter(Boolean);
  const t0 = Date.now();
  const g = buildGraph(all, (f: string) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } });
  assert.ok(Date.now() - t0 < 10000, 'about a second');
  const names = readdirSync('tests').filter((f) => f.endsWith('.test.ts'));
  const read = (t: string): string => readFileSync(`tests/${t}`, 'utf8');
  const direct = new Set(selectTests(['src/clock/frame.ts'], names, read));
  const deep = selectTests(['src/clock/frame.ts'], names, read, g);
  assert.ok(deep.length > direct.size, `${deep.length} through the graph against ${direct.size} that name it`);
  for (const t of direct) assert.ok(deep.includes(t), `${t} still runs`);
  // the chain the review named: src/scene/parts/*.ts is read through tests/helpers/scene-source.ts, so every test that uses sceneSource() runs when a part changes
  const user = names.find((n) => /sceneSource/.test(read(n)));
  const part = readdirSync('src/scene/parts').find((n) => n.endsWith('.ts'));
  if (user && part) assert.ok(selectTests([`src/scene/parts/${part}`], names, read, g).includes(user), `${user} reads the parts through the helper`);
});
