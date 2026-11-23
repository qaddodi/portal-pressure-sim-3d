import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const wf = readFileSync('.github/workflows/pages.yml', 'utf8');

test('Pages builds main to / and the integration branch to /preview/ in one workflow, with no tests', () => {
  assert.match(wf, /ref: main\n\s+path: live/);
  assert.match(wf, /ref: claude\/project-thread-ge1swr\n\s+path: preview/);
  assert.match(wf, /cp -r dist \.\.\/site\/preview/);
  assert.match(wf, /VITE_CHANNEL: preview/);
  assert.doesNotMatch(wf, /npm (run )?test|npm run check|playwright/i, 'build only');
  assert.equal((wf.match(/^  [a-z-]+:\n    runs-on/gm) ?? []).length, 1, 'one job');
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
  assert.equal((wf.match(/npm ci/g) ?? []).length, 3, 'one install for the preview (with its comment line) and one for main');
});

test('the build runs the four bakes at once and each bake skips itself on an unchanged signature', () => {
  const b = readFileSync('scripts/build.mjs', 'utf8');
  assert.match(b, /Promise\.all\(\[\.\.\.\['bake-welds\.mjs', 'bake-skins\.mjs', 'bake-organs\.mjs', 'bake-charts\.mjs'\]\.map\(bakeNow\)/);
  assert.doesNotMatch(b, /spawnSync\(process\.execPath, \[fileURLToPath\(new URL\('\.\/bake-/, 'no bake is run one after another');
});
