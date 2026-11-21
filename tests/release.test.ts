// The version a tester or a bug report can name (production review 21 Nov, P0-5): package.json's version is stamped as VITE_RELEASE, About and the feedback draft carry it,
// and the feedback address is a build variable only (P0-4): it is never in the repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { commitOf, releaseLine, feedbackBuild } from '../src/boot/release.ts';
import { feedbackBase, feedbackHref } from '../src/ui/shell/feedback.ts';

test('the release line names the version and the build, whichever the build has', () => {
  assert.equal(releaseLine('1.0.0-beta.1', 'claude/x@7e5d6f99'), 'Version 1.0.0-beta.1 · build 7e5d6f99');
  assert.equal(releaseLine('1.0.0', 'main@abc12345'), 'Version 1.0.0 · build abc12345');
  assert.equal(releaseLine(undefined, 'dev'), 'source');
  assert.equal(releaseLine('1.0.0', undefined), 'Version 1.0.0');
  assert.equal(commitOf('local'), '');
});

test('the feedback draft carries the version, PREVIEW only on the preview copy', () => {
  assert.equal(feedbackBuild('1.0.0-beta.1', 'b@7e5d6f99', 'preview'), 'v1.0.0-beta.1 · PREVIEW · 7e5d6f99');
  assert.equal(feedbackBuild('1.0.0-beta.1', 'main@7e5d6f99', 'live'), 'v1.0.0-beta.1 · 7e5d6f99');
  const body = feedbackBase({ build: feedbackBuild('1.0.0-beta.1', 'main@7e5d6f99', 'live'), device: 'd', screen: 's', view: 'v' });
  assert.match(body, /Build: v1\.0\.0-beta\.1 · 7e5d6f99/);
  assert.match(decodeURIComponent(feedbackHref('a@b.test', { build: 'v1', device: 'd', screen: 's', view: 'v' })), /^mailto:a@b\.test\?/);
});

test('the build stamps package.json\'s version, and the workflow passes the repository variable as the feedback address', () => {
  const b = readFileSync('scripts/build.mjs', 'utf8');
  assert.match(b, /VITE_RELEASE: release/);
  assert.match(b, /readFileSync\(`\$\{root\}package\.json`/);
  assert.match(JSON.parse(readFileSync('package.json', 'utf8')).version, /^\d+\.\d+\.\d+/);
  const wf = readFileSync('.github/workflows/pages.yml', 'utf8');
  assert.equal((wf.match(/VITE_FEEDBACK_EMAIL: \$\{\{ vars\.FEEDBACK_EMAIL \}\}/g) ?? []).length, 2, 'both builds (preview and live) get the address');
});

/** No email address in the shipped sources: the feedback address is only ever the build's variable. (@example and @b.test style placeholders in tests are fine: tests/ is not scanned.) */
test('no email address is committed under src, scripts, public or index.html', () => {
  const hits: string[] = [];
  const re = /[A-Za-z0-9._%+-]+@(?:gmail|googlemail|yahoo|outlook|hotmail|icloud|me|proton|protonmail)\.[a-z]{2,}/i;
  const walk = (p: string) => {
    const st = statSync(p);
    if (st.isDirectory()) { for (const n of readdirSync(p)) walk(join(p, n)); return; }
    if (!/\.(ts|tsx|js|mjs|json|html|md|css|webmanifest|svg|txt|yml|yaml)$/.test(p)) return;
    if (re.test(readFileSync(p, 'utf8'))) hits.push(p);
  };
  for (const d of ['src', 'scripts', 'public', 'index.html', '.github']) walk(d);
  assert.deepEqual(hits, []);
});
