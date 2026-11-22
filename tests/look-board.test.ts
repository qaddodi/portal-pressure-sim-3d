// The look board (WP11): its states are real and unique, an address and its state agree, the diff and the PNG tools work, the capture hook runs once, and the pages are wired.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { LOOK_STATES, stateId, stateFile, stateProblems, stateAddress, parseState, visitOrder, twoDAddress, LOOK_VIEWS } from '../src/debug/look-states.ts';
import { diffPixels, verdict, moved } from '../src/debug/look-diff.ts';
import { lookCapture } from '../src/debug/look-hook.ts';
import { UI } from '../src/ui/strings.generated.ts';
import { decodePng, encodePng } from '../scripts/png-lite.mjs';
import { compareFolders, sheet } from '../scripts/look-diff.mjs';
import { safeName } from '../scripts/look-serve.mjs';
import { FLAGS, flagOn } from '../src/ui/debug/flags.ts';

test('about 40 states, each one real and named once', () => {
  assert.ok(LOOK_STATES.length >= 36 && LOOK_STATES.length <= 48, String(LOOK_STATES.length));
  assert.equal(new Set(LOOK_STATES.map(stateId)).size, LOOK_STATES.length);
  for (const s of LOOK_STATES) {
    assert.deepEqual(stateProblems(s), [], stateId(s));
    assert.ok(UI.presets.some((p) => p.id === s.preset), `${s.preset} is a preset`);
    assert.match(stateFile(s), /^[a-z0-9][a-z0-9.-]*\.png$/);
    assert.equal(safeName(stateFile(s)), stateFile(s));
  }
});

test('every view and the five looks are on the board', () => {
  for (const v of LOOK_VIEWS) assert.ok(LOOK_STATES.some((s) => s.view === v), v);
  for (const l of ['light', 'soft', 'dark', 'navy', 'black']) assert.ok(LOOK_STATES.some((s) => s.look === l), l);
  for (const d of ['mac', 'ipad', 'iphone']) assert.ok(LOOK_STATES.some((s) => s.device === d), d);
});

test('an address and its state agree; the figure stands still (chevrons off)', () => {
  for (const s of LOOK_STATES) {
    const a = stateAddress(s, '/preview/');
    const got = parseState(a.slice(a.indexOf('?')));
    assert.ok(got, a);
    assert.equal(got!.preset, s.preset); assert.equal(got!.view, s.view); assert.equal(got!.look, s.look); assert.equal(got!.orbit, s.orbit ?? 0); assert.equal(got!.chevrons, false);
  }
  assert.equal(parseState('?preset=healthy'), null, 'no capture, no state');
  assert.equal(parseState('?capture&view=bogus&look=nope')!.view, undefined);
  assert.match(twoDAddress(LOOK_STATES[0]!), /portal-pressure-simulator\/preview\/\?preset=healthy$/);
});

test('the board visits one device at a time', () => {
  const order = visitOrder();
  assert.equal(order.length, LOOK_STATES.length);
  const seen: string[] = [];
  for (const s of order) if (seen[seen.length - 1] !== s.device) seen.push(s.device);
  assert.equal(new Set(seen).size, seen.length, `device order ${seen.join(',')}`);
});

test('diffPixels: same, a changed pixel, a change under the tolerance', () => {
  const a = new Uint8ClampedArray(4 * 4).fill(200), b = new Uint8ClampedArray(a);
  assert.equal(diffPixels(a, b, 2, 2).same, true);
  b[0] = 100;
  const d = diffPixels(a, b, 2, 2);
  assert.equal(d.changed, 1); assert.equal(d.percent, 25); assert.equal(d.image![0], 230);
  b[0] = 195;
  assert.equal(diffPixels(a, b, 2, 2).same, true, 'dither is not a change');
  assert.equal(verdict(null), 'no baseline'); assert.ok(moved({ same: false, size: false, changed: 0, total: 0, percent: 100, image: null }));
});

test('png-lite writes what it reads; look:diff compares two folders and writes a sheet', () => {
  const w = 3, h = 2, px = new Uint8ClampedArray(w * h * 4).map((_, i) => (i * 37) % 256);
  const back = decodePng(encodePng(w, h, px));
  assert.deepEqual([back.w, back.h, [...back.data]], [w, h, [...px]]);
  const root = mkdtempSync(`${tmpdir()}/look-`), run = `${root}/run`, base = `${root}/base`;
  mkdirSync(run); mkdirSync(base);
  const moved2 = new Uint8ClampedArray(px); moved2[0] = (moved2[0]! + 120) % 256;
  writeFileSync(`${base}/a.png`, encodePng(w, h, px)); writeFileSync(`${run}/a.png`, encodePng(w, h, moved2));
  writeFileSync(`${base}/b.png`, encodePng(w, h, px)); writeFileSync(`${run}/b.png`, encodePng(w, h, px));
  writeFileSync(`${run}/c.png`, encodePng(w, h, px));
  const rows = compareFolders(run, base, `${run}/diff`);
  const by = Object.fromEntries(rows.map((r) => [r.file, r.diff]));
  assert.equal(by['a.png']!.changed, 1); assert.equal(by['b.png']!.same, true); assert.equal(by['c.png'], null);
  assert.deepEqual(readdirSync(`${run}/diff`).sort(), ['a.png', 'b.png']);
  const html = sheet('run', rows);
  assert.ok(html.indexOf('a.png') < html.indexOf('c.png'), 'what moved comes first');
});

test('the capture hook reads the canvas once, in the frame that was asked for', () => {
  let n = 0;
  lookCapture.run({} as HTMLCanvasElement); assert.equal(n, 0);
  lookCapture.ask(() => { n++; });
  assert.equal(lookCapture.waiting, true);
  lookCapture.run({} as HTMLCanvasElement); lookCapture.run({} as HTMLCanvasElement);
  assert.equal(n, 1); assert.equal(lookCapture.waiting, false);
});

test('the pages are wired and listed: Stage reads after the render, main opens the board and the capture state in the preview only', () => {
  const stage = readFileSync(new URL('../src/scene/Stage.tsx', import.meta.url), 'utf8');
  // (the board reads the canvas in the task that drew it: after the frame's render call, whatever times that call (firstDraw, frameBegin/frameEnd), and inside the same useFrame)
  const read = stage.indexOf('lookCapture.run(gl.domElement)'), draw = stage.lastIndexOf('cel.render(gl)', read);   // (the nearest render call before the read: the frame's own, not the figure-shot's two earlier in the file)
  assert.ok(draw > 0 && read > draw, 'lookCapture.run comes after cel.render');
  assert.doesNotMatch(stage.slice(draw, read), /useFrame|requestAnimationFrame|setTimeout|await /, 'no other task between the render and the read');
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  assert.match(main, /isPreview\(\) && flagValue\('look'\) === ''[^\n]*\n[^\n]*look-board/);
  assert.match(main, /isPreview\(\) && flagOn\('capture'\)/);
  for (const id of ['look', 'twod', 'capture']) assert.ok(FLAGS.some((f) => f.id === id && f.gate === 'local'), id);
  assert.equal(flagOn('capture', '?capture&look=dark'), true);
  assert.equal(flagOn('capture', { search: '?capture', pathname: '/', hostname: 'qaddodi.github.io' }), false, 'the live site never opens it');
});

test('the look board does not write the viewer\'s own settings', () => {
  const app = readFileSync(new URL('../src/debug/look-app.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /setLook\(|setFigure\(|localStorage/);
});
