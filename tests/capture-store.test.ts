// A capture survives a crashed page (Safari on a Mac, 26 Nov: the page crashed after the whole audit had finished, before the zip was saved, and nothing could be recovered). Root cause: every picture lived
// in the page's memory, several times over (each frame, the copies posted up, the joined list, the zip). Now each talk's (or case's) files are written to the device's storage as it ends, the pages keep only
// names, the zip is made from storage one file at a time, and the next visit offers "Recover last capture". The logic runs here over an in-memory backend; the IndexedDB one is pinned by its shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zipParts, zipStream, zipNames, type ZipFile } from '../src/ui/capture/zip.ts';
import { memoryBackend, openSession, reopenSession, recoverable, recoverLine, type Backend, type RunMeta } from '../src/ui/debug/audit/capture-store.ts';
import { frameSink } from '../src/ui/debug/audit/capture-keep.ts';

const src = (p: string): string => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const file = (name: string, ...n: number[]): ZipFile => ({ name, data: new Uint8Array(n) });
const meta = (t = '2026-11-26T10:00:00.000Z') => ({ startedAt: t, build: 'abc', words: 'every slide', sizes: ['iphone', 'mac'], zipName: 'x.zip' });
const bytesOf = async (b: Blob): Promise<Uint8Array> => new Uint8Array(await b.arrayBuffer());

test('the zip made one file at a time is the very zip made all at once, whatever the chunk size', async () => {
  const files = [file('a/1.jpg', 1, 2, 3), file('a/1.json', 4), file('b/ü-ñ.png', 5, 6, 7, 8, 9), file('README.txt')];
  const at = new Date(2026, 10, 26, 9, 5, 7);
  const whole = new Uint8Array(await new Blob(zipParts(files, at) as BlobPart[]).arrayBuffer());
  for (const chunkBytes of [1, 40, 1e6]) {
    const made = await bytesOf(await zipStream(files.map((f) => f.name), async (n) => files.find((f) => f.name === n)!.data, at, { chunkBytes }));
    assert.deepEqual(made, whole, `chunk ${chunkBytes}`);
  }
  assert.deepEqual(zipNames(whole).map((e) => e.name), files.map((f) => f.name));
});

test('a file that cannot be read is left out of the zip, and the zip still reads back whole', async () => {
  const have = new Map([['a', new Uint8Array([1])], ['c', new Uint8Array([3])]]);
  const seen: number[] = [];
  const z = await bytesOf(await zipStream(['a', 'b', 'c'], async (n) => have.get(n) ?? null, new Date(2026, 0, 1), { progress: (n) => seen.push(n) }));
  assert.deepEqual(zipNames(z).map((e) => e.name), ['a', 'c']);
  assert.deepEqual(seen, [1, 2, 3], 'progress counts every name');
});

test('a run is written as it goes, the page keeps only names, and the zip comes from storage', async () => {
  const be = memoryBackend();
  const s = await openSession(be, meta(), 'r1');
  await s.add([file('iphone/01-a/01.jpg', 1, 2), file('iphone/01-a/01.json', 3)]);
  await s.add([file('mac/01-a/01.jpg', 4)]);
  assert.deepEqual(s.names(), ['iphone/01-a/01.jpg', 'iphone/01-a/01.json', 'mac/01-a/01.jpg']);
  assert.deepEqual([...(await s.read('mac/01-a/01.jpg'))!], [4]);
  const [run] = await be.listRuns();
  assert.equal(run!.files, 3); assert.equal(run!.bytes, 4); assert.equal(run!.status, 'running');
  await s.finish('finished');
  assert.equal((await be.listRuns())[0]!.status, 'finished');
  const z = await bytesOf(await s.zip(new Date(2026, 10, 26)));
  assert.deepEqual(zipNames(z).map((e) => e.name), [...s.names()].sort());
  assert.equal(s.degraded, '');
});

test('a page that crashed leaves the run in storage; the next visit finds it, says what happened, and makes the same zip', async () => {
  const be = memoryBackend();
  const s = await openSession(be, meta(), 'r1');
  await s.add([file('iphone/a.jpg', 1), file('mac/a.jpg', 2)]);
  // (no finish: the page was ended)
  const r = recoverable(await be.listRuns())!;
  assert.equal(r.id, 'r1'); assert.equal(r.status, 'running');
  assert.match(recoverLine(r), /2 files .* in iphone, mac, build abc, started 2026-11-26 10:00 UTC; the page ended before the run did\./);
  const again = await reopenSession(be, r);
  assert.deepEqual(again.names(), ['iphone/a.jpg', 'mac/a.jpg']);
  const z = await bytesOf(await again.zip(new Date(2026, 10, 26)));
  assert.deepEqual(zipNames(z).map((e) => e.name), ['iphone/a.jpg', 'mac/a.jpg']);
  await again.saved();
  assert.equal(recoverable(await be.listRuns()), null, 'a saved capture is not offered again');
});

test('what is offered: the newest run with files that was not saved; the words say how it ended', () => {
  const run = (id: string, t: string, o: Partial<RunMeta> = {}): RunMeta => ({ id, startedAt: t, updatedAt: t, build: 'b', words: 'w', sizes: [], status: 'finished', files: 5, bytes: 1e6, zipName: 'z', ...o });
  assert.equal(recoverable([run('old', '2026-11-25T00:00:00Z'), run('new', '2026-11-26T00:00:00Z')])!.id, 'new');
  assert.equal(recoverable([run('saved', '2026-11-26T00:00:00Z', { savedAt: 'x' }), run('old', '2026-11-25T00:00:00Z')])!.id, 'old');
  assert.equal(recoverable([run('empty', '2026-11-26T00:00:00Z', { files: 0 })]), null);
  assert.equal(recoverable([]), null);
  assert.match(recoverLine(run('a', '2026-11-26T01:02:03Z', { status: 'finished' })), /it finished, and its zip was not saved/);
  assert.match(recoverLine(run('a', '2026-11-26T01:02:03Z', { status: 'stopped' })), /it was stopped/);
});

test('a new run clears the old ones but keeps the run just before it if it was not saved, so a crashed capture survives the next', async () => {
  const be = memoryBackend();
  const ids = async () => (await be.listRuns()).map((r) => r.id).sort();
  const a = await openSession(be, meta('2026-11-24T10:00:00Z'), 'a'); await a.add([file('x', 1)]);
  const b = await openSession(be, meta('2026-11-25T10:00:00Z'), 'b'); await b.add([file('x', 2)]);
  assert.deepEqual(await ids(), ['a', 'b'], 'a crashed run is still there while the next is made');
  await b.saved();
  await openSession(be, meta('2026-11-26T10:00:00Z'), 'c');
  assert.deepEqual(await ids(), ['c'], 'the saved run just before goes, and the older one with it');
  const d = await openSession(be, meta('2026-11-27T10:00:00Z'), 'd');
  assert.deepEqual(await ids(), ['d'], 'a run with no files is not kept');
  await d.add([file('x', 1)]);
  await openSession(be, meta('2026-11-28T10:00:00Z'), 'e');
  assert.deepEqual(await ids(), ['d', 'e'], 'one with files, not saved, is');
});

test('storage that fails (no room, a private window) falls back to memory, says so, and the zip is still whole', async () => {
  const be = memoryBackend();
  const bad: Backend = { ...be, putFiles: async () => { throw new Error('QuotaExceededError'); } };
  const s = await openSession(bad, meta(), 'r');
  await s.add([file('a.jpg', 1), file('b.jpg', 2)]);
  assert.match(s.degraded, /QuotaExceededError/);
  const z = await bytesOf(await s.zip(new Date(2026, 10, 26)));
  assert.deepEqual(zipNames(z).map((e) => e.name), ['a.jpg', 'b.jpg']);
  const none = await openSession(null, meta(), 'n');
  await none.add([file('a.jpg', 1)]);
  assert.match(none.degraded, /no storage/);
  assert.deepEqual(zipNames(await bytesOf(await none.zip(new Date(2026, 10, 26)))).map((e) => e.name), ['a.jpg']);
  const broken: Backend = { ...be, putRun: async () => { throw new Error('SecurityError'); } };
  const s3 = await openSession(broken, meta(), 'r3');
  assert.match(s3.degraded, /SecurityError/);
});

test('discarding a run lets its files go', async () => {
  const be = memoryBackend();
  const s = await openSession(be, meta(), 'r'); await s.add([file('a', 1)]);
  await s.discard();
  assert.deepEqual(await be.listRuns(), []);
  assert.deepEqual(await be.fileNames('r'), []);
});

test('a frame\'s files go to storage in the order they came, under its own folder, and a frame cut off says how many it gave', async () => {
  const wrote: string[][] = [];
  const sink = frameSink(async (fs) => { await new Promise((r) => setTimeout(r, fs.length === 1 ? 5 : 0)); wrote.push(fs.map((f) => f.name)); }, 'iphone/');
  sink.add([file('01-a/1.jpg', 1)]);
  sink.add([file('02-b/1.jpg', 2), file('02-b/1.json', 3)]);
  const r = await sink.end({ files: [file('README.txt', 9)], notes: ['n'], why: 'silent for 5 minutes' });
  assert.deepEqual(wrote, [['iphone/01-a/1.jpg'], ['iphone/02-b/1.jpg', 'iphone/02-b/1.json'], ['iphone/README.txt']], 'in order, though the first write was the slowest');
  assert.equal(r.count, 4); assert.match(r.why!, /silent for 5 minutes; the 4 files it had finished are kept/); assert.deepEqual(r.notes, ['n']);
  const whole = await frameSink(async () => undefined, 'mac/').end({ files: [], notes: [] });
  assert.equal(whole.why, undefined);
});

test('the pages write to storage and let go of the bytes: the frame releases what it sent, the outer page and the self-test panel keep only names and build the zip from storage', () => {
  const all = src('src/ui/debug/audit/capture-all.ts'), cases = src('src/ui/debug/audit/capture-cases.ts'), run = src('src/ui/debug/audit/capture-run.ts'), child = src('src/ui/debug/audit/capture-child.ts');
  const outer = src('src/ui/debug/audit/capture-outer.ts'), page = src('src/ui/debug/audit/page.ts');
  for (const s of [all, cases]) { assert.match(s, /f\.data = RELEASED/); assert.match(s, /await ui\.partial\?\.\(fresh\)/); }
  assert.match(run, /release: ui\.release/); assert.match(child, /release: true/);
  assert.match(outer, /openSession\(/); assert.match(outer, /frameSink\(/); assert.match(outer, /deliver\.offer\(/); assert.doesNotMatch(outer, /zipBlob\(/, 'no list of every picture is joined in memory');
  assert.match(page, /openSession\(/); assert.match(page, /release: true, partial:/); assert.match(page, /deliver\.offer\(opened/);
  for (const [n, s] of [['outer', outer], ['page', page]] as const) { assert.match(s, /recoverUi\(/, `${n}: Recover last capture`); assert.match(s, /saved\(\)/, `${n}: a saved zip is not offered again`); assert.doesNotMatch(s, /\.zip\(at|saveFiles\(\[new File\(\[(zip|cap)/, `${n}: no whole-zip Blob`); }
});

test('the IndexedDB backend keeps each file as its own record keyed by run and name, and reads them one at a time', () => {
  const s = src('src/ui/debug/audit/capture-store.ts');
  assert.match(s, /createObjectStore\('files', \{ keyPath: \['run', 'name'\] \}\)/); assert.match(s, /createIndex\('run', 'run'\)/);
  assert.match(s, /createIndex\('sized', \['run', 'name', 'size'\]\)/, 'each file\'s size is listed from an index, without reading the file');
  assert.match(s, /indexedDB\.open\('pps-capture', 2\)/); assert.match(s, /size: f\.data\.byteLength/);
  assert.match(s, /readFile\(run, name\)/); assert.match(s, /getAllKeys\(IDBKeyRange\.only\(run\)\)/);
  assert.match(s, /onabort = \(\) => no\(/, 'a write that fails (no room) is an error the session catches, and falls back to memory');
});
