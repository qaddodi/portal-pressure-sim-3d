// The capture's zip never has to be one huge Blob in Safari (26 Nov: Safari ran out of memory making the zip of a whole audit), and the promotion page is on the same store as every other capture page
// (no in-memory exception). The plan of parts (capture-parts.ts), the zip written straight to a sink (zipWrite) and the store's sizes run here in node; the buttons are pinned by their source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { zipNames, zipStream, zipWrite, type ZipFile } from '../src/ui/capture/zip.ts';
import { planParts, partName, sizeWords, PART_BYTES_BLOB, PART_BYTES_FILE } from '../src/ui/debug/audit/capture-parts.ts';
import { memoryBackend, openSession, reopenSession, type Backend } from '../src/ui/debug/audit/capture-store.ts';

const src = (p: string): string => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const sized = (name: string, bytes: number) => ({ name, bytes });
const MB = 1024 * 1024;
const meta = () => ({ startedAt: '2026-11-26T10:00:00.000Z', build: 'abc', words: 'w', sizes: ['iphone', 'mac'], zipName: 'x.zip' });
const file = (name: string, n: number): ZipFile => ({ name, data: new Uint8Array(n).fill(7) });

test('a capture that fits is one part, whatever order the files came in', () => {
  const p = planParts([sized('mac/b.jpg', 5 * MB), sized('README.txt', 1), sized('iphone/a.jpg', 5 * MB)]);
  assert.equal(p.length, 1);
  assert.deepEqual(p[0]!.names, ['README.txt', 'iphone/a.jpg', 'mac/b.jpg']);
  assert.equal(p[0]!.of, 1);
  assert.equal(planParts([]).length, 1, 'an empty run is one empty part, not none');
});

test('a big capture is cut by folder: a size stays whole when it fits, the top files are in every part, and every file is in exactly one part', () => {
  const files = [
    sized('README.txt', 1000), sized('cases-manifest.json', 2000),
    ...Array.from({ length: 10 }, (_, i) => sized(`iphone/${String(i).padStart(2, '0')}-t/1.jpg`, 15 * MB)),   // 150 MB
    ...Array.from({ length: 10 }, (_, i) => sized(`ipad/${String(i).padStart(2, '0')}-t/1.jpg`, 15 * MB)),     // 150 MB
    ...Array.from({ length: 10 }, (_, i) => sized(`mac/${String(i).padStart(2, '0')}-t/1.jpg`, 15 * MB)),      // 150 MB
  ];
  const parts = planParts(files, { bytes: PART_BYTES_BLOB });
  assert.equal(parts.length, 3, 'one size a part: two of them (300 MB) would not fit 200 MB');
  assert.deepEqual(parts.map((p) => p.label), ['ipad', 'iphone', 'mac']);
  for (const p of parts) { assert.ok(p.bytes <= PART_BYTES_BLOB); assert.ok(p.names.includes('README.txt') && p.names.includes('cases-manifest.json'), 'the top files are in every part'); }
  const rest = parts.flatMap((p) => p.names.filter((n) => n.includes('/')));
  assert.equal(rest.length, 30); assert.equal(new Set(rest).size, 30, 'no file twice');
  assert.deepEqual(parts.map((p) => [p.index, p.of]), [[1, 3], [2, 3], [3, 3]]);
});

test('a size too big for a part is cut by its own folders, in order; a single file over the limit is a part of its own', () => {
  const files = Array.from({ length: 6 }, (_, i) => sized(`mac/${i}-talk/1.jpg`, 90 * MB));
  const parts = planParts(files, { bytes: 200 * MB });
  assert.equal(parts.length, 3, 'two talks (180 MB) to a part');
  assert.deepEqual(parts.map((p) => p.names), [['mac/0-talk/1.jpg', 'mac/1-talk/1.jpg'], ['mac/2-talk/1.jpg', 'mac/3-talk/1.jpg'], ['mac/4-talk/1.jpg', 'mac/5-talk/1.jpg']]);
  const one = planParts([sized('mac/a/huge.png', 500 * MB), sized('mac/a/b.png', 1 * MB)], { bytes: 200 * MB });
  assert.equal(one.length, 2); assert.deepEqual(one.map((p) => p.names), [['mac/a/b.png'], ['mac/a/huge.png']].map((n) => n));
});

test('the file count is held under what a zip counts, and a zip written straight to a file may be as big as a zip can be', () => {
  const many = Array.from({ length: 25 }, (_, i) => sized(`a/${String(i).padStart(2, '0')}/x.jpg`, 1));
  const parts = planParts(many, { bytes: 1e9, files: 10 });
  assert.ok(parts.every((p) => p.names.length <= 10)); assert.equal(parts.length, 3);
  assert.ok(PART_BYTES_FILE < 4 * 1024 * 1024 * 1024 && PART_BYTES_FILE > PART_BYTES_BLOB * 5, 'under a zip\'s 4 GB, well over a Blob\'s part');
});

test('part names say which part of how many, and words for a size', () => {
  assert.equal(partName('cap.zip', { index: 1, of: 1 }), 'cap.zip');
  assert.equal(partName('cap.zip', { index: 2, of: 4 }), 'cap-part2of4.zip');
  assert.equal(sizeWords(180 * MB), '188.7 MB'); assert.equal(sizeWords(2.4e9), '2.4 GB'); assert.equal(sizeWords(10), '0.1 MB');
});

test('the zip written to a sink is the very zip the stream makes, and it reads back; nothing is held but the file in hand', async () => {
  const files = [file('a/1.jpg', 300), file('a/1.json', 4), file('b/ü-ñ.png', 50), file('README.txt', 0)];
  const at = new Date(2026, 10, 26, 9, 5, 7), read = async (n: string) => files.find((f) => f.name === n)!.data;
  const chunks: Uint8Array[] = [], seen: number[] = [];
  const size = await zipWrite(files.map((f) => f.name), read, at, async (c) => { chunks.push(c.slice()); }, { progress: (n) => seen.push(n) });
  const made = new Uint8Array(size); let at0 = 0;
  for (const c of chunks) { made.set(c, at0); at0 += c.length; }
  assert.equal(at0, size);
  const streamed = new Uint8Array(await (await zipStream(files.map((f) => f.name), read, at)).arrayBuffer());
  assert.deepEqual(made, streamed);
  assert.deepEqual(zipNames(made).map((e) => e.name), files.map((f) => f.name));
  assert.deepEqual(seen, [1, 2, 3, 4]);
});

test('a store knows each file\'s size, and a zip can be made of only the names asked for (a part)', async () => {
  const be = memoryBackend();
  const s = await openSession(be, meta(), 'r');
  await s.add([file('iphone/a.jpg', 10), file('mac/b.jpg', 20), file('README.txt', 3)]);
  await s.add([file('mac/b.jpg', 25)]);
  assert.deepEqual(s.files(), [{ name: 'iphone/a.jpg', bytes: 10 }, { name: 'mac/b.jpg', bytes: 25 }, { name: 'README.txt', bytes: 3 }], 'a file named again counts once, at its new size');
  const part = zipNames(new Uint8Array(await (await s.zip(new Date(2026, 10, 26), undefined, ['README.txt', 'mac/b.jpg'])).arrayBuffer()));
  assert.deepEqual(part.map((e) => [e.name, e.size]), [['README.txt', 3], ['mac/b.jpg', 25]]);
  const again = await reopenSession(be, (await be.listRuns())[0]!);
  assert.deepEqual(again.files(), [{ name: 'README.txt', bytes: 3 }, { name: 'iphone/a.jpg', bytes: 10 }, { name: 'mac/b.jpg', bytes: 25 }], 'a recovered run plans its parts from the same sizes');
  const out: number[] = [];
  const total = await again.zipTo(async (c) => { out.push(c.length); }, new Date(2026, 10, 26), undefined, ['mac/b.jpg']);
  assert.equal(total, out.reduce((n, x) => n + x, 0));
});

test('a file stored before sizes were kept is measured by reading it once', async () => {
  const be = memoryBackend();
  await be.putRun({ ...meta(), id: 'old', updatedAt: 'x', status: 'running', files: 1, bytes: 0 });
  await be.putFiles('old', [file('a.jpg', 12)]);
  const old: Backend = { ...be, fileSizes: async (r) => new Map([...(await be.fileSizes(r))].map(([n]) => [n, -1] as const)) };
  const s = await reopenSession(old, (await be.listRuns())[0]!);
  assert.deepEqual(s.files(), [{ name: 'a.jpg', bytes: 12 }]);
});

/** Every source file under a folder. */
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p, out); else if (/\.tsx?$/.test(n)) out.push(p); }
  return out;
}

test('every capture page is on the one store and hands its run to the one delivery: no in-memory keeper, no zip of the whole', () => {
  const pages = walk('src/ui/debug').filter((f) => /\bopenSession\(/.test(readFileSync(f, 'utf8')) && !/capture-store\.ts$/.test(f));
  const names = pages.map((f) => f.replace(/^.*src\/ui\/debug\//, '')).sort();
  assert.deepEqual(names, ['audit/capture-outer.ts', 'audit/page.ts', 'promo/outer.ts'], 'the capture page, the self-test panel and the promotion page');
  for (const f of pages) {
    const s = readFileSync(f, 'utf8');
    assert.match(s, /idbBackend\(\)/, `${f}: the browser's storage`);
    assert.match(s, /deliver\.offer\(/, `${f}: the delivery`); assert.match(s, /deliverUi\(/); assert.match(s, /recoverUi\(/, `${f}: Recover last capture`);
    assert.doesNotMatch(s, /zipBlob\(|fileKeeper|new File\(\[(zip|cap)\b/, `${f}: no whole-zip Blob`);
  }
  // (the promotion page frames each picture as its talk ends and writes only the JPEG: the raw captures are never kept)
  const promo = src('src/ui/debug/promo/outer.ts');
  assert.match(promo, /frameSink\(framer\(id\), ''\)/); assert.match(promo, /c\.session\.add\(\[\{ name: `\$\{id\}\/\$\{name\}`/);
  assert.doesNotMatch(promo, /all\.push|const all\b/, 'no list of every picture');
});

test('the delivery opens the save dialog first in the tap, saves a Blob part only from a tap, and marks the run saved only when every part is', () => {
  const s = src('src/ui/debug/audit/capture-deliver.ts');
  assert.match(s, /showSaveFilePicker/);
  assert.match(s, /btn\.onclick = \(\) => \{\s*\n\s*if \(working \|\| !pick\) return;\s*\n\s*const handle = pick\(/, 'the dialog is opened before any await');
  assert.match(s, /session\.zipTo\(/, 'a file is written one picture at a time');
  assert.match(s, /session\.zip\(at, progress, plan\[i\]!\.names\)/, 'a Blob holds only its part');
  assert.match(s, /btn\.onclick = \(\) => \{\s*\n\s*const f = new File\(\[z\]/, 'the part is made before the tap that saves it');
  assert.match(s, /void make\(i \+ 1\)/, 'the next part is made once this one is saved, so only one is ever held');
  assert.match(s, /const limit = pick \? PART_BYTES_FILE : PART_BYTES_BLOB/);
  assert.match(s, /if \(i >= plan\.length\) \{ done\(\); return; \}/); assert.match(s, /onSaved\?\.\(\)/);
});
