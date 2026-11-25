import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const wf = readFileSync('.github/workflows/pages.yml', 'utf8');
// (the deploy job, and the daily test job after it)
const deployJob = wf.slice(0, wf.indexOf('\n  tests:\n')), testsJob = wf.slice(wf.indexOf('\n  tests:\n'));

test('Pages builds main to / and the integration branch to /preview/; the only test run is the one full run a day', () => {
  assert.match(wf, /ref: main\n\s+path: live/);
  assert.match(wf, /ref: claude\/project-thread-ge1swr\n\s+path: preview/);
  assert.match(wf, /cp -r dist \.\.\/site\/preview/);
  assert.match(wf, /VITE_CHANNEL: preview/);
  assert.doesNotMatch(deployJob, /npm (run )?test|npm run check|playwright|run: node scripts\/tests-daily/i, 'the deploy only builds');
  assert.doesNotMatch(wf, /npm (run )?test\b|npm run check|playwright/i, 'no push runs the suite, and no browser runs');
  assert.deepEqual([...wf.slice(wf.indexOf('\njobs:\n')).matchAll(/^  ([a-z-]+):$/gm)].map((m) => m[1]), ['deploy', 'tests'], 'the deploy and the daily test job');
});

test('only the preview copy shows the build pill', () => {
  const app = readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /VITE_CHANNEL === 'preview' && <BuildPill/);
});

// ---- Plan 50: the deploy is fast ----
test('the deploy caches node_modules and the baked files, never waits on a fixed sleep, and builds main only when it has the app', () => {
  assert.match(wf, /path: preview\/node_modules\n\s+key: modules-\$\{\{ runner\.os \}\}-node22-\$\{\{ hashFiles\('preview\/package-lock\.json'\) \}\}/);
  assert.match(wf, /if: steps\.modules\.outputs\.cache-hit != 'true'\n\s+working-directory: preview\n\s+run: npm ci/);
  assert.match(wf, /key: bakes-\$\{\{ github\.sha \}\}\n\s+restore-keys: bakes-/);
  for (const f of ['preview/public/baked', 'preview/public/lobule', 'skins.bin', 'skins.bin.sig', 'circuit-skins.bin', 'circuit-skins.bin.sig', 'organs-baked.bin', 'organs-baked.bin.sig']) assert.ok(wf.includes(f), `${f} is cached`);
  assert.doesNotMatch(wf, /preview\/public\/anatomy\/organs\.bin|preview\/public\/anatomy\/\*|preview\/public\/anatomy\n/, 'a restore must never replace a checked-in source file');
  assert.doesNotMatch(wf, /\bsleep 20\b/, 'no fixed wait');
  assert.match(wf, /actions\/runs\/\$\{\{ github\.run_id \}\}\/artifacts/, 'the artifact is polled for');
  assert.match(wf, /actions: read/);
  assert.match(wf, /sparse-checkout: package\.json/, 'main is a package.json until it has the app');
  assert.match(wf, /if grep -q '"build"' live\/package\.json/);
  assert.equal((wf.match(/npm ci/g) ?? []).length, 4, 'one install for the preview (with its comment line), one for main and one for the daily test job');
});

test('the build runs the four bakes at once and each bake skips itself on an unchanged signature', () => {
  const b = readFileSync('scripts/build.mjs', 'utf8');
  assert.match(b, /Promise\.all\(\[\.\.\.\['bake-welds\.mjs', 'bake-skins\.mjs', 'bake-organs\.mjs', 'bake-charts\.mjs'\]\.map\(bakeNow\)/);
  assert.doesNotMatch(b, /spawnSync\(process\.execPath, \[fileURLToPath\(new URL\('\.\/bake-/, 'no bake is run one after another');
});

test('a push that cancels a running deploy cannot starve the caches: each is saved the moment its files exist, the bakes even on a cancel', () => {
  assert.doesNotMatch(wf, /uses: actions\/cache@v4/, 'the plain action saves only when the whole job succeeds');
  assert.equal((deployJob.match(/uses: actions\/cache\/restore@v4/g) ?? []).length, 4, 'node_modules, the bakes, the last test result, and the day\'s started marker');
  assert.match(wf, /name: Save node_modules\n\s+if: steps\.modules\.outputs\.cache-hit != 'true'\n\s+uses: actions\/cache\/save@v4/);
  assert.match(wf, /name: Save the baked files\n\s+if: always\(\)\n\s+uses: actions\/cache\/save@v4/);
  assert.ok(wf.indexOf('Save the baked files') < wf.indexOf('upload-pages-artifact'), 'saved before the upload, which a cancel may skip');
});

test('the daily test job: one run a UTC day, started by the first push, never cancelled by a deploy, its result a cache entry the next deploy stamps', () => {
  assert.match(deployJob, /tests_due: \$\{\{ steps\.started\.outputs\.cache-hit != 'true' \}\}/);
  assert.match(deployJob, /key: tests-started-\$\{\{ steps\.day\.outputs\.d \}\}\n\s+lookup-only: true/, 'the check costs no download');
  assert.match(deployJob, /path: preview\/tests-status\.json\n\s+key: tests-status-none\n\s+restore-keys: tests-status-/, 'the newest result comes back');
  assert.match(testsJob, /needs: deploy\n\s+if: needs\.deploy\.outputs\.tests_due == 'true'/);
  assert.match(testsJob, /concurrency:\n\s+group: tests-daily\n\s+cancel-in-progress: false/, 'a newer push does not kill an hour-long run');
  assert.doesNotMatch(wf, /^concurrency:/m, 'the deploy has its own, at job level');
  assert.match(deployJob, /concurrency:\n\s+group: pages\n\s+cancel-in-progress: true/);
  assert.match(testsJob, /run: node scripts\/tests-daily\.mjs/);
  assert.match(testsJob, /key: tests-status-\$\{\{ steps\.day\.outputs\.d \}\}-\$\{\{ github\.run_id \}\}/);
  // the started marker is saved BEFORE the suite runs, so a run that dies is not retried all day
  assert.ok(testsJob.indexOf('key: tests-started-${{ steps.day.outputs.d }}\n\n') === -1 && testsJob.indexOf('actions/cache/save@v4') < testsJob.indexOf('tests-daily.mjs'));
  assert.doesNotMatch(wf, /FEEDBACK_EMAIL[^\n]*\n[^\n]*echo|echo[^\n]*FEEDBACK_EMAIL/, 'the feedback address is never printed');
});
