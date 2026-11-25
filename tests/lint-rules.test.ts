// The project's rules (scripts/lint-rules.mjs): each has one source that passes and one that fails, and the repo itself stays inside its allowances (scripts/lint-allow.json).
// These replace the grep tests tests/one-clock.test.ts and the `||` check in tests/any-moving.test.ts: a syntax tree does not trip over comments or strings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { lintFiles, judge, RULES, conflictMarkers, longLines, judgeLongLines, LONG_LINE } from '../scripts/lint-rules.mjs';

type Hit = { rule: string; path: string; line: number; text: string };
const lint = (path: string, text: string): string[] => (lintFiles([{ path, text }]) as Hit[]).map((h) => h.rule);

const CASES: Array<[rule: string, path: string, bad: string, good: string]> = [
  ['raf-outside-clock', 'src/scene/x.ts', 'requestAnimationFrame(tick);', '// requestAnimationFrame is the clock\'s\nconst s = "requestAnimationFrame"; frameFor("x");'],
  ['chained-step', 'src/scene/x.ts', 'const m = a.moving() || this.stepCava(dt);', 'const m = anyMoving(a.moving(), this.stepCava(dt)); const g = ready && this.update(dt);'],
  ['raw-time', 'src/ui/x.ts', 'const t = performance.now(); setTimeout(f, 1);', 'const t = clock.now(); // performance.now()\nconst o = { setTimeout: 1 };'],
  ['layout-read', 'src/ui/x.ts', 'const r = el.getBoundingClientRect(); const w = el.offsetWidth;', 'const r = readBox(el); const w = readMetric(el, "offsetWidth");'],
  ['unsafe-cast', 'src/scene/x.ts', 'const a = b as unknown as Rec; const c = d as never;', 'const a = b as Rec; const c = d as unknown;'],
  ['raw-idle', 'src/scene/x.ts', 'const ric = globalThis.requestIdleCallback; requestIdleCallback(f);', '// requestIdleCallback is the slot\'s\nwhenQuiet(step, { tag: "x" });'],
  ['unnamed-shader', 'src/scene/x.ts', 'const m = new ShaderMaterial({ vertexShader: v, fragmentShader: f });', 'const m = new ShaderMaterial({ name: "x", vertexShader: v }); const n = new ShaderMaterial({ name, vertexShader: v });'],
  ['raw-setparams', 'src/ui/x.ts', "engine().send({ type: 'setParams', params, settle: true });", "sendParams(params, { settle: true }); const m = { type: 'setParam' };"],
  ['discarded-unsubscribe', 'src/ui/x.ts', "function mount() { useThing.subscribe(run); }", "function mount() { const off = useThing.subscribe(run); return off; } function page() { useThing.subscribe(run); // (lives for the page)\n }"],
  ['canvas-own-loop', 'src/ui/x.tsx', 'export const A = () => <Canvas camera={c}><Scene /></Canvas>;', 'export const A = () => <Canvas frameloop="never"><Scene /></Canvas>;'],
  ['anatomy-through-source', 'src/scene/x.ts', "import { EDGE_PATH_2D } from './vessels/paths.copied.ts'; import { REGIONS } from '../decks/hp/regions.copied.ts';", "import { EDGE_PATH_2D } from './anatomy/source.ts'; // paths.copied.ts is the source's\nconst s = 'paths.copied.ts';"],
];

for (const [rule, path, bad, good] of CASES) {
  test(`${rule}: a failing source is caught, a passing one is not`, () => {
    assert.ok(lint(path, bad).includes(rule), `${rule} should fire on: ${bad}`);
    assert.ok(!lint(path, good).includes(rule), `${rule} should not fire on: ${good}`);
  });
}

test('every rule has a case here, and the exempt places stay exempt', () => {
  assert.deepEqual(CASES.map((c) => c[0]).sort(), Object.keys(RULES).sort());
  assert.deepEqual(lint('src/clock/frame.ts', 'requestAnimationFrame(f)'), [], 'the clock owns the animation frame');
  assert.deepEqual(lint('src/clock/frame.ts', 'performance.now()'), [], 'the clock owns time');
  assert.deepEqual(lint('src/clock/idle.ts', 'requestIdleCallback(f)'), [], 'the slot owns idle time');
  assert.deepEqual(lint('src/ui/layout-snap.ts', 'el.getBoundingClientRect()'), [], 'the layout service reads layout');
  assert.deepEqual(lint('src/scene/anatomy/source.ts', "export { EDGE_PATH_2D } from '../vessels/paths.copied.ts';"), [], 'the anatomy source owns the copied courses');
  assert.deepEqual(lint('src/engine/host/worker.ts', 'setTimeout(f, 1); requestAnimationFrame(f)'), [], 'the copied engine is not this app');
});

test('a file that does not parse fails the lint instead of being skipped', () => {
  assert.deepEqual(lint('src/scene/x.ts', 'const = ;;'), ['parse-error']);
});

test('the repo is inside every allowance (scripts/lint-allow.json only goes down)', () => {
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts') ? [`${dir}/${e.name}`] : []);
  const files = walk('src').map((path) => ({ path, text: readFileSync(path, 'utf8') }));
  const allow = JSON.parse(readFileSync('scripts/lint-allow.json', 'utf8')) as Record<string, number>;
  const { counts, over } = judge(lintFiles(files), allow) as { counts: Record<string, number>; over: string[] };
  assert.deepEqual(over, [], `over allowance: ${over.map((r) => `${r} ${counts[r]} > ${allow[r] ?? 0}`).join(', ')}`);
});

test('unresolved merge conflict markers are found, ordinary lines and rulers are not', () => {
  const marks = ['<'.repeat(7) + ' HEAD', '='.repeat(7), '>'.repeat(7) + ' abc123'];
  assert.deepEqual(conflictMarkers(`a\n${marks.join('\n')}\nb`), [2, 3, 4]);
  assert.deepEqual(conflictMarkers('x = a <<<<<<< b;\n// ======== a longer ruler\n  ======='), []);
});

test('long-line: a new line over the limit is caught, existing ones are tolerated, and a file may not gain one', () => {
  const long = `const a = 1; ${'x'.repeat(LONG_LINE)}`;
  const exactly = 'y'.repeat(LONG_LINE);
  const counts = longLines([
    { path: 'src/scene/a.ts', text: `ok\n${long}\n${exactly}\n${long}` },
    { path: 'src/scene/b.ts', text: 'short\n// a comment on its own line' },
    { path: 'src/engine/hales/core/c.ts', text: long },
    { path: 'src/decks/hp/data/d.copied.ts', text: long },
    { path: 'src/ui/strings.generated.ts', text: long },
  ]) as Record<string, number>;
  assert.deepEqual(counts, { 'src/scene/a.ts': 2 }, 'a line of exactly the limit passes; the copied engine, 2D copies and generated data are not counted');
  assert.deepEqual(judgeLongLines(counts, { 'src/scene/a.ts': 2 }).over, [], 'the file as it stands is inside its allowance');
  assert.equal(judgeLongLines({ 'src/scene/a.ts': 3 }, { 'src/scene/a.ts': 2 }).over.length, 1, 'a third long line fails');
  assert.equal(judgeLongLines({ 'src/scene/new.ts': 1 }, {}).over.length, 1, 'a file that is not listed has an allowance of 0');
  assert.deepEqual(judgeLongLines({ 'src/scene/a.ts': 1 }, { 'src/scene/a.ts': 2, 'src/scene/gone.ts': 4 }).under.map((u: { path: string }) => u.path), ['src/scene/a.ts']);
  assert.deepEqual(judgeLongLines({}, { 'src/scene/gone.ts': 4 }).gone, ['src/scene/gone.ts'], 'an allowance whose file is clean (or gone) is a prompt to drop it');
});

test('long-line: the repo has no more long lines than scripts/lint-long-lines.json allows', () => {
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts') ? [`${dir}/${e.name}`] : []);
  const files = walk('src').map((path) => ({ path, text: readFileSync(path, 'utf8') }));
  const allow = JSON.parse(readFileSync('scripts/lint-long-lines.json', 'utf8')) as Record<string, number>;
  const { over } = judgeLongLines(longLines(files), allow) as { over: Array<{ path: string; count: number; allowed: number }> };
  assert.deepEqual(over, [], `lines over ${LONG_LINE} characters: ${over.map((o) => `${o.path} ${o.count} > ${o.allowed}`).join(', ')}`);
});
