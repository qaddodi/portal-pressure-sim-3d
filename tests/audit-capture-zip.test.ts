// The capture's zips in the audit's one format (src/ui/debug/audit/capture-unified.ts): the folders of pictures stay, README-FIRST / REPORT / sections / findings / manifest are added from each slide's card record.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureUnified, slideShots } from '../src/ui/debug/audit/capture-unified.ts';
import { zipBytes } from '../src/ui/debug/request/bundle.ts';
import { zipText } from '../src/ui/debug/request/read-zip.ts';

const enc = new TextEncoder();
const slide = (deck: string, stop: number, past: number, o: Record<string, unknown> = {}) => ({ deck, deckTitle: deck.toUpperCase(), stop, title: 'T', card: 'tips-12-table', cards: [{ card: 'tips-12-table', box: 300, content: 300 + past, past }], link: 'https://x/#s', ...o });
const files: Record<string, unknown> = {
  'mac/01-shunts/01-02-a-untucked.json': slide('shunts', 2, 0), 'mac/01-shunts/01-02-a-untucked.jpg': 1,
  'mac/01-shunts/01-03-b-untucked.json': slide('shunts', 3, 40), 'mac/01-shunts/01-03-b-untucked.jpg': 1,
  'mac/01-shunts/01-03-b-tucked.json': slide('shunts', 3, 0), 'mac/01-shunts/01-03-b-tucked.jpg': 1,
  'iphone/02-lobule/01-04-c-untucked.json': slide('lobule', 4, 0), 'iphone/02-lobule/01-04-c-untucked.png': 1,
  'mac/cases/manifest.json': { cases: [] }, 'mac/hist/case-1.json': { case: 'x' }, 'mac/01-shunts/09-lost.json': slide('shunts', 9, 0),
};
const names = Object.keys(files), read = async (n: string) => (typeof files[n] === 'object' ? enc.encode(JSON.stringify(files[n])) : null);
const labelOf = (n: string) => ({ mac: 'Mac', iphone: 'iPhone' })[n.split('/')[0]!] ?? 'other';
const base = { search: '?audit=frames&capture=1&req=deck:shunts%2Blayout:mac', names, read, labelOf, ends: [{ layout: 'Mac', notes: [] }], build: 'abc1234', startedAt: '2026-11-28T04:00:00.000Z', seconds: 90, device: 'a Mac', speed: 20, sideBySide: true, stopped: false, cases: false };

test('every slide\'s state file is a shot with its picture beside it; a case\'s file, a manifest and a slide with no picture are not shots', async () => {
  const { shots, unread } = await slideShots(names, read, labelOf);
  assert.deepEqual(shots.map((s) => s.picture), ['mac/01-shunts/01-02-a-untucked.jpg', 'mac/01-shunts/01-03-b-untucked.jpg', 'mac/01-shunts/01-03-b-tucked.jpg', 'iphone/02-lobule/01-04-c-untucked.png']);
  assert.deepEqual(unread, ['mac/01-shunts/09-lost.json']);
  assert.equal(shots[0]!.layout, 'Mac');
  assert.match(shots[1]!.title, /\[card up\]$/);
  assert.match(shots[2]!.title, /\[card tucked\]$/);
  assert.notEqual(shots[1]!.title, shots[2]!.title, 'the two views of one slide are two things, so their ids differ');
});

test('the capture\'s zip gets the audit\'s files: a card past its foot is a finding with an id, the request and the speed are in the report, a missing picture is said', async () => {
  const out = (await captureUnified({ ...base, sizes: ['mac'] }))!;
  assert.deepEqual(out.map((f) => f.name).filter((n) => !n.startsWith('sections/')), ['README-FIRST.md', 'REPORT.md', 'findings.json', 'manifest.json']);
  const zip = zipBytes(out.map((f) => ({ name: f.name, text: new TextDecoder().decode(f.data) })), new Date(2026, 10, 28));
  const fj = JSON.parse(zipText(zip, 'findings.json')!);
  assert.equal(fj.request, 'deck:shunts+layout:mac');
  assert.equal(fj.findings.length, 1);
  assert.match(fj.findings[0].id, /^F-[0-9a-f]{6}$/);
  assert.match(fj.findings[0].target, /Mac \/ SHUNTS 3: T \(tips-12-table\) \[card up\]/);
  const rep = zipText(zip, 'REPORT.md')!, first = zipText(zip, 'README-FIRST.md')!;
  assert.match(rep, /Request: `deck:shunts\+layout:mac`/);
  assert.match(first, /ran at 20x/);
  assert.match(first, /side by side/);
  assert.match(first, /09-lost\.json: its picture is missing/);
  assert.match(first, /Transitions are not photographed/);
  assert.deepEqual(JSON.parse(zipText(zip, 'manifest.json')!).scope.sizes, ['mac']);
});

test('a request that cannot be read gives no files, and the pages are wired to the one format', async () => {
  assert.equal(await captureUnified({ ...base, search: '?req=deck:nope' }), null);
  const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  assert.match(src('src/ui/debug/audit/capture-outer.ts'), /captureUnified\(/);
  assert.match(src('src/ui/debug/audit/page.ts'), /captureUnified\(/);
  assert.match(src('src/ui/debug/stress/outer.ts'), /unifiedFiles\(/);
  assert.match(src('src/ui/debug/stress/outer.ts'), /frameSink\(\(fs\) => session!\.add\(fs\), `\$\{PICTURES\}\/\$\{l\.id\}\/`\)/);
});
