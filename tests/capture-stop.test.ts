// Stop on a multi-size capture (Mohammad, 26 Nov: "if I hit stop on Mac, with iPhone, iPad and Mac sizes running, will I get a zip?"). The rule: Stop ALWAYS ends in a zip of every file that was finished,
// in every size, whether a frame stops cleanly, is slow to stop, hangs, or crashes. Root cause of the gap: a frame handed up its files only in its last message, so a frame that did not reach it kept
// nothing. A frame now hands up each talk's (or case's) files as that talk ends (`part`), and the outer pages keep them (capture-keep.ts). Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileKeeper, stopOverdue, STOP_GRACE_MS } from '../src/ui/debug/audit/capture-keep.ts';

const bytes = (...n: number[]) => new Uint8Array(n);
const src = (p: string): string => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('a frame that ends cleanly: the talks it handed up as it went and the rest it ends with, all kept', () => {
  const k = fileKeeper();
  k.add([{ name: '01-a/01.jpg', data: bytes(1) }, { name: '01-a/01.json', data: bytes(2) }]);
  k.add([{ name: '02-b/01.jpg', data: bytes(3) }]);
  const r = k.end({ files: [{ name: 'README.txt', data: bytes(9) }], notes: ['n'] });
  assert.deepEqual(r.files.map((f) => f.name), ['01-a/01.jpg', '01-a/01.json', '02-b/01.jpg', 'README.txt']);
  assert.equal(r.why, undefined);
  assert.deepEqual(r.notes, ['n']);
});

test('a frame that crashes, hangs or is cut off after Stop gives every talk it had finished, and says so', () => {
  const k = fileKeeper();
  k.add([{ name: '01-a/01.jpg', data: bytes(1) }, { name: '01-a-contact-sheet.png', data: bytes(2) }]);
  const r = k.end({ files: [], notes: [], why: 'silent for 5 minutes (the frame crashed or never booted)' });
  assert.equal(r.files.length, 2, 'the finished talk is in the zip');
  assert.match(r.why!, /silent for 5 minutes.*; the 2 files it had finished are kept/);
  const none = fileKeeper().end({ files: [], notes: [], why: 'the frame failed' });
  assert.equal(none.why, 'the frame failed', 'nothing finished: the reason alone');
  assert.deepEqual(none.files, []);
});

test('a file named again replaces the one before it (a later picture of the same name wins), never doubles', () => {
  const k = fileKeeper();
  k.add([{ name: 'a.jpg', data: bytes(1) }]);
  const r = k.end({ files: [{ name: 'a.jpg', data: bytes(2) }], notes: [] });
  assert.equal(r.files.length, 1);
  assert.deepEqual([...r.files[0]!.data], [2]);
});

test('a frame is cut off only once Stop was pressed and the grace has passed', () => {
  assert.equal(stopOverdue(-1, 1e9), false, 'Stop not pressed');
  assert.equal(stopOverdue(1000, 1000 + STOP_GRACE_MS), false, 'exactly at the grace');
  assert.equal(stopOverdue(1000, 1001 + STOP_GRACE_MS), true);
  assert.ok(STOP_GRACE_MS >= 30000 && STOP_GRACE_MS <= 120000, 'long enough for a slide to finish, short enough to be a stop');
});

/** Every source file under a folder. */
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p, out); else if (/\.tsx?$/.test(n)) out.push(p); }
  return out;
}

test('every page that holds a capture frame keeps what the frame hands up as it goes: no consumer of `done` is without `part`', () => {
  const holders = walk('src').filter((f) => /capture === 'done'/.test(readFileSync(f, 'utf8')));
  assert.ok(holders.length >= 2, 'the capture page and the promotion page');
  for (const f of holders) {
    const s = readFileSync(f, 'utf8');
    assert.match(s, /capture === 'part'/, `${f} must keep a frame's finished talks`);
    assert.match(s, /fileKeeper\(\)|frameSink\(/, `${f} keeps them (in memory, or written to storage as they arrive)`);
    assert.match(s, /stopOverdue\(/, `${f} cuts off a frame that does not stop`);
  }
});

test('the frame hands up each talk and each case as it ends, and does not send it twice', () => {
  const child = src('src/ui/debug/audit/capture-child.ts'), all = src('src/ui/debug/audit/capture-all.ts'), cases = src('src/ui/debug/audit/capture-cases.ts'), run = src('src/ui/debug/audit/capture-run.ts');
  assert.match(child, /capture: 'part'/); assert.match(child, /!sent\.has\(f\.name\)/);
  // a talk's files go up after its contact sheet, including a talk that was stopped part way
  assert.match(all, /const wrapUp = async[\s\S]*await flush\(\);/);
  assert.match(all, /await Promise\.all\(encoding\);\s*\n\s*const fresh/, 'the encoders have finished the files before they go up');
  assert.match(cases, /ui\.partial\?\.\(fresh\)/);
  assert.match(run, /partial: ui\.partial/);
});

test('Stop ends a wait at once, and no picture is taken of a page that was not still', () => {
  const settle = src('src/ui/debug/audit/capture-settle.ts'), all = src('src/ui/debug/audit/capture-all.ts'), cases = src('src/ui/debug/audit/capture-cases.ts');
  assert.match(settle, /!kit\.stop\?\.\(\)/, 'the settle loop ends when Stop is pressed');
  assert.match(settle, /moving: gaveUp \|\| kit\.stop\?\.\(\) \? why : ''/);
  assert.match(all, /const kit = \{ \.\.\.deckKit, stop: ui\.stop \}/);
  assert.match(all, /if \(moving && ui\.stop\(\)\) return;/);
  assert.match(cases, /stop: ui\.stop \}/); assert.match(cases, /if \(r\.moving && ui\.stop\(\)\) return null;/);
  assert.doesNotMatch(all, /stillPage\(real, (needWords|false), !!ui\.skip\)/, 'every wait in the slide pass is the stoppable one');
});
