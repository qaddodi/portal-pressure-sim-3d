// The live site ships no debug tool (production review 21 Nov, P1-7): the build for main (VITE_CHANNEL=live) drops every branch of src/entry.ts and src/main.tsx that opens one, so those chunks are not built,
// downloaded or held offline; and the flag table lets only ?perf, ?gl and the open-a-slide/patient links work on the live site. The preview copy and a local run keep them all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLAGS, flagOn, flagValue, inspectRequested } from '../src/ui/debug/flags.ts';

const main = readFileSync('src/main.tsx', 'utf8') + '\n' + readFileSync('src/entry.ts', 'utf8');   // (the entry opens the pages that are not the app; main opens the rest)

test('main.tsx decides once, at build time, whether this build has debug tools', () => {
  assert.match(main, /const DEBUG = import\.meta\.env\.VITE_CHANNEL !== 'live';/);
});

test('every debug tool main.tsx opens is behind DEBUG', () => {
  const lines = main.split('\n');
  const tools = ['./parity/ParityPage', './ui/debug/frame/frame', './ui/debug/audit/outer', './debug/look-board', './debug/look-app', './ui/debug/dust-panel', './ui/debug/inspect/panel'];
  for (const t of tools) {
    const at = lines.map((l, i) => [l, i] as const).filter(([l]) => l.includes(`import('${t}`));
    assert.ok(at.length, `main.tsx no longer opens ${t}: update this test`);
    // (the line itself, or the `if (DEBUG && …) {` line just above it)
    for (const [l, i] of at) assert.match(`${lines[i - 1]}\n${l}`, /DEBUG &&/, `${t} is opened without DEBUG: ${l.trim()}`);
  }
  // mountDebug, mountCharts and mountTrials sit inside one `if (DEBUG) {` block
  const block = /if \(DEBUG\) \{[\s\S]*?mountDebug\(\)[\s\S]*?mountCharts\(\)[\s\S]*?mountTrials\(\)[\s\S]*?\n  \}/.exec(main);
  assert.ok(block, 'mountDebug, mountCharts and mountTrials must be inside if (DEBUG) { }');
  // what stays on the live site: ?gl
  assert.match(main, /if \(flagOn\('gl'\)\) void import\('\.\/debug\/gl-check\.tsx'\)/);
});

test('only ?perf, ?gl and the links that open a talk, a slide, a patient or the menu are live flags', () => {
  const live = FLAGS.filter((f) => f.gate === 'live').map((f) => f.id).sort();
  assert.deepEqual(live, ['gl', 'home', 'perf', 'preset', 'script', 'slide']);
});

test('on the live address the debug flags read as absent, on the preview address they read', () => {
  const liveLoc = { search: '?inspect&dust&joins=debug&charts&parity', pathname: '/portal-pressure-sim-3d/', hostname: 'qaddodi.github.io' };
  const prevLoc = { ...liveLoc, pathname: '/portal-pressure-sim-3d/preview/' };
  for (const id of ['inspect', 'dust', 'charts', 'parity']) { assert.equal(flagOn(id, liveLoc), false, `?${id} on live`); assert.equal(flagOn(id, prevLoc), true, `?${id} on preview`); }
  assert.equal(flagValue('joins', liveLoc), null);
  assert.equal(flagValue('joins', prevLoc), 'debug');
  assert.equal(inspectRequested(liveLoc), false);
  assert.equal(inspectRequested(prevLoc), true);
  const perf = { ...liveLoc, search: '?perf&gl' };
  assert.equal(flagOn('perf', perf) && flagOn('gl', perf), true);
});
