import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWorkflow, type Yaml } from './workflow-yaml.ts';

// The workflow is READ (tests/workflow-yaml.ts), not grepped: each test asks which jobs, steps, conditions and keys it has.
const wf = parseWorkflow(readFileSync('.github/workflows/pages.yml', 'utf8'));
type Obj = { [k: string]: Yaml };
const obj = (y: Yaml | undefined): Obj => { assert.ok(y !== undefined && typeof y === 'object' && !Array.isArray(y), 'a mapping'); return y; };
const str = (y: Yaml | undefined): string => (typeof y === 'string' ? y : '');
const jobs = obj(wf.jobs);
const job = (name: string): Obj => obj(jobs[name]);
const stepsOf = (name: string): Obj[] => { const s = job(name).steps; assert.ok(Array.isArray(s)); return s.map(obj); };
const withOf = (s: Obj): Obj => obj(s.with ?? {});
const usesStep = (name: string, action: string, pick: (s: Obj) => boolean = () => true): Obj => {
  const s = stepsOf(name).find((x) => str(x.uses).startsWith(`${action}@`) && pick(x));
  assert.ok(s, `${name} has a ${action} step`);
  return s;
};
const stepNamed = (name: string, label: string): Obj => { const s = stepsOf(name).find((x) => str(x.name) === label); assert.ok(s, `${name} has a step "${label}"`); return s; };
const indexOfStep = (name: string, label: string): number => stepsOf(name).findIndex((x) => str(x.name) === label);
const runs = (name: string): string[] => stepsOf(name).map((s) => str(s.run)).filter(Boolean);
const lines = (y: Yaml | undefined): string[] => str(y).split('\n').filter(Boolean);

test('Pages builds main to / and the integration branch to /preview/; the only test run is the one full run a day', () => {
  const checkouts = stepsOf('deploy').filter((s) => str(s.uses).startsWith('actions/checkout@'));
  assert.deepEqual(checkouts.map((s) => [withOf(s).ref, withOf(s).path]), [['main', 'live'], ['claude/project-thread-ge1swr', 'preview']]);
  const build = stepNamed('deploy', 'Build the preview (integration branch) into site/preview');
  assert.equal(obj(build.env).VITE_CHANNEL, 'preview');
  assert.ok(str(build.run).includes('cp -r dist ../site/preview'));
  assert.deepEqual(Object.keys(jobs), ['deploy', 'tests'], 'the deploy and the daily test job');
  for (const j of ['deploy', 'tests']) for (const r of runs(j)) assert.ok(!/npm (run )?test\b|npm run check|playwright/i.test(r), `no step runs a push-time suite or a browser: ${r}`);
  assert.ok(!runs('deploy').some((r) => r.includes('tests-daily')), 'the deploy only builds');
});

test('only the preview copy shows the build pill', () => {
  const app = readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /VITE_CHANNEL === 'preview' && <BuildPill/);
});

// ---- Plan 50: the deploy is fast ----
test('the deploy caches node_modules and the baked files, never waits on a fixed sleep, and builds main only when it has the app', () => {
  const modules = stepNamed('deploy', 'Restore node_modules');
  assert.equal(modules.id, 'modules');
  assert.equal(withOf(modules).path, 'preview/node_modules');
  assert.equal(withOf(modules).key, "modules-${{ runner.os }}-node22-${{ hashFiles('preview/package-lock.json') }}");
  const install = stepsOf('deploy').find((s) => str(s.run) === 'npm ci' && s['working-directory'] === 'preview');
  assert.ok(install, 'the preview installs with npm ci');
  assert.equal(install.if, "steps.modules.outputs.cache-hit != 'true'", 'only without a cached node_modules');
  const bakes = withOf(stepNamed('deploy', 'Restore the baked files'));
  assert.equal(bakes.key, 'bakes-${{ github.sha }}');
  assert.equal(bakes['restore-keys'], 'bakes-');
  const paths = lines(bakes.path);
  for (const f of ['preview/public/baked', 'preview/public/lobule', 'skins.bin', 'skins.bin.sig', 'circuit-skins.bin', 'circuit-skins.bin.sig', 'organs-baked.bin', 'organs-baked.bin.sig']) assert.ok(paths.some((p) => p.endsWith(f)), `${f} is cached`);
  // (a restore must never replace a checked-in source file)
  assert.ok(!paths.some((p) => p === 'preview/public/anatomy/organs.bin' || p.includes('*') || p === 'preview/public/anatomy'));
  assert.ok(!runs('deploy').some((r) => /\bsleep 20\b/.test(r)), 'no fixed wait');
  assert.ok(str(stepNamed('deploy', 'Wait until the artifact is listed').run).includes('actions/runs/${{ github.run_id }}/artifacts'), 'the artifact is polled for');
  assert.equal(obj(wf.permissions).actions, 'read');
  assert.equal(withOf(stepsOf('deploy')[0])['sparse-checkout'], 'package.json', 'main is a package.json until it has the app');
  const live = str(stepNamed('deploy', 'Build the live site (main) into site/').run);
  assert.ok(live.startsWith(`if grep -q '"build"' live/package.json`));
  assert.equal(runs('deploy').filter((r) => r.includes('npm ci')).length, 2, 'one install for the preview and one for main');
});

test('the build runs the four bakes at once and each bake skips itself on an unchanged signature', () => {
  const b = readFileSync('scripts/build.mjs', 'utf8');
  assert.match(b, /Promise\.all\(\[\.\.\.\['bake-welds\.mjs', 'bake-skins\.mjs', 'bake-organs\.mjs', 'bake-charts\.mjs'\]\.map\(bakeNow\)/);
  assert.doesNotMatch(b, /spawnSync\(process\.execPath, \[fileURLToPath\(new URL\('\.\/bake-/, 'no bake is run one after another');
});

test('a push that cancels a running deploy cannot starve the caches: each is saved the moment its files exist, the bakes even on a cancel', () => {
  // (the plain cache action saves only when the whole job succeeds)
  for (const j of ['deploy', 'tests']) assert.ok(!stepsOf(j).some((s) => str(s.uses).startsWith('actions/cache@')), `${j} uses restore and save apart`);
  const restores = stepsOf('deploy').filter((s) => str(s.uses).startsWith('actions/cache/restore@'));
  assert.deepEqual(restores.map((s) => withOf(s).path.toString().split('\n')[0]), ['preview/.tests-started', 'preview/node_modules', 'preview/public/baked'], 'the day\'s marker, node_modules and the bakes (no test result: nothing stamps it on the site)');
  const saveModules = stepNamed('deploy', 'Save node_modules');
  assert.equal(saveModules.if, "steps.modules.outputs.cache-hit != 'true'");
  assert.ok(str(saveModules.uses).startsWith('actions/cache/save@'));
  const saveBakes = stepNamed('deploy', 'Save the baked files');
  assert.equal(saveBakes.if, 'always()');
  assert.ok(str(saveBakes.uses).startsWith('actions/cache/save@'));
  const upload = stepsOf('deploy').findIndex((s) => str(s.uses).startsWith('actions/upload-pages-artifact@'));
  assert.ok(indexOfStep('deploy', 'Save the baked files') < upload, 'saved before the upload, which a cancel may skip');
});

test('the deploy is tried up to three times, and only the last attempt can fail the job', () => {
  const attempts = stepsOf('deploy').filter((s) => str(s.uses).startsWith('actions/deploy-pages@'));
  assert.deepEqual(attempts.map((s) => s.id), ['deployment', 'deployment2', 'deployment3']);
  assert.deepEqual(attempts.map((s) => s['continue-on-error']), ['true', 'true', undefined]);
  assert.deepEqual(attempts.map((s) => s.if), [undefined, "steps.deployment.outcome == 'failure'", "steps.deployment2.outcome == 'failure'"], 'each runs only after the one before failed');
  assert.deepEqual(attempts.map((s) => withOf(s).artifact_name), Array(3).fill('github-pages-${{ github.run_attempt }}'));
  assert.equal(obj(job('deploy').environment).url, '${{ steps.deployment3.outputs.page_url || steps.deployment2.outputs.page_url || steps.deployment.outputs.page_url }}');
  assert.deepEqual(stepsOf('deploy').filter((s) => /^sleep \d+$/.test(str(s.run))).map((s) => str(s.run)), ['sleep 15', 'sleep 45'], 'a wait before each retry');
});

test('the daily test job: one run a UTC day, started by the first push, never cancelled by a deploy, its count in the job log, never on the site', () => {
  assert.equal(wf.concurrency, undefined, 'concurrency is per job, so a push cancels only the deploy');
  assert.deepEqual(job('deploy').concurrency, { group: 'pages', 'cancel-in-progress': 'true' });
  assert.deepEqual(job('tests').concurrency, { group: 'tests-daily', 'cancel-in-progress': 'false' });
  // the deploy asks, without a download, whether today's run has started, and passes the answer on
  const started = stepsOf('deploy').find((s) => s.id === 'started');
  assert.ok(started);
  assert.deepEqual([withOf(started).key, withOf(started)['lookup-only']], ['tests-started-${{ steps.day.outputs.d }}', 'true']);
  assert.equal(obj(job('deploy').outputs).tests_due, "${{ steps.started.outputs.cache-hit != 'true' }}");
  assert.equal(job('tests').needs, 'deploy');
  assert.equal(job('tests').if, "needs.deploy.outputs.tests_due == 'true'");
  assert.ok(!stepsOf('deploy').some((s) => str(withOf(s).path).includes('tests-status')), 'the deploy lays no test result for the build');
  // the started marker is saved BEFORE the suite runs, so a run that dies is not retried all day; the result is saved after it
  const tests = stepsOf('tests');
  const suite = tests.findIndex((s) => str(s.run) === 'node scripts/tests-daily.mjs');
  const saves = tests.map((s, i) => [i, s] as const).filter(([, s]) => str(s.uses).startsWith('actions/cache/save@') && withOf(s).path === 'preview/.tests-started');
  assert.ok(suite > 0 && saves.length === 1 && saves[0][0] < suite, 'the marker is saved before the suite');
  // every step after the marker's check stands down when the day was taken by a run queued ahead of this one
  for (const s of tests.slice(tests.findIndex((x) => x.id === 'started') + 1)) assert.ok(str(s.if).includes("steps.started.outputs.cache-hit != 'true'"), `stands down: ${str(s.name) || str(s.run) || str(s.uses)}`);
});

test('the feedback address is only ever a secret, handed to the two builds and never echoed', () => {
  const withAddress = stepsOf('deploy').filter((s) => 'VITE_FEEDBACK_EMAIL' in obj(s.env ?? {}));
  assert.equal(withAddress.length, 2, 'both builds (preview and live) get the address');
  for (const s of withAddress) assert.equal(obj(s.env).VITE_FEEDBACK_EMAIL, '${{ secrets.FEEDBACK_EMAIL }}');
  for (const j of ['deploy', 'tests']) assert.ok(!runs(j).some((r) => /echo[^\n]*FEEDBACK_EMAIL|printenv|\benv\b\s*$/m.test(r)), 'no step prints the address or the environment');
});
