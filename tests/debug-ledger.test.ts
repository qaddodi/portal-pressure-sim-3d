// The tab-kill ledger and the walk's resume (batch B14): what the page held when a tab was ended is written down while it runs, kept across tabs, and printed by the checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKeeper, addKill, readLedger, ledgerLines, KILLS_KEY, KILLS_MAX, ALIVE_KEY, LAST_KEY, type Store } from '../src/ui/debug/kill/ledger.ts';
import { runCheck, type Journey } from '../src/ui/debug/page/check.ts';

const store = (): Store & { m: Map<string, string> } => { const m = new Map<string, string>(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } }; };

test('a boot that finds the alive mark still set adds the page before it to the ledger, with where it was and what it held', () => {
  const local = store(), session = store(); let t = 1_000_000;
  const a = createKeeper({ local, session, device: () => 'phone-portrait', now: () => t });
  a.boot(); assert.equal(session.getItem(ALIVE_KEY), '1'); assert.deepEqual(readLedger(local), []);
  t += 5000; a.tick('hvpg slide 6', 180); t += 3000; a.tick('hvpg slide 7', 320);
  // (no pagehide: the browser ended the tab) the same tab opens again:
  t += 60_000;
  const b = createKeeper({ local, session, device: () => 'phone-portrait', now: () => t });
  const list = b.boot();
  assert.equal(b.killed, true); assert.equal(list.length, 1);
  assert.deepEqual({ where: list[0]!.where, mb: list[0]!.mb, peak: list[0]!.peak, s: list[0]!.s, device: list[0]!.device }, { where: 'hvpg slide 7', mb: 320, peak: 320, s: 8, device: 'phone-portrait' });
});

test('a page that left cleanly (pagehide) is not a kill; a page back from the cache is alive again', () => {
  const local = store(), session = store();
  const a = createKeeper({ local, session, device: () => 'desktop' }); a.boot(); a.tick('anatomic', 100); a.end();
  assert.equal(session.getItem(ALIVE_KEY), '');
  const b = createKeeper({ local, session, device: () => 'desktop' }); assert.deepEqual(b.boot(), []); assert.equal(b.killed, false);
  b.end(); b.back(); assert.equal(session.getItem(ALIVE_KEY), '1');
});

test('the last moment is written only when where it is or its memory (in 10 MB steps) changes, and the highest is kept', () => {
  const session = store(); let writes = 0; const counting: Store = { getItem: (k) => session.getItem(k), setItem: (k, v) => { if (k === LAST_KEY) writes++; session.setItem(k, v); } };
  const k = createKeeper({ local: store(), session: counting, device: () => 'x' }); k.boot();
  k.tick('a', 101); k.tick('a', 103); k.tick('a', 104); assert.equal(writes, 1, 'same place, same 10 MB step');
  k.tick('a', 150); assert.equal(writes, 2); k.tick('a', 80); assert.equal(JSON.parse(session.getItem(LAST_KEY)!).peak, 150);
});

test('the ledger keeps the last 12, refuses a moment with no place, survives blocked or broken storage, and prints one line each', () => {
  const s = store();
  for (let i = 0; i < 15; i++) addKill(s, { where: `slide ${i}`, mb: 100 + i, peak: 200, s: 9 }, { at: `2026-11-19T10:${String(i).padStart(2, '0')}:00.000Z`, device: 'phone' });
  assert.equal(readLedger(s).length, KILLS_MAX); assert.equal(readLedger(s)[0]!.where, 'slide 3');
  assert.equal(addKill(s, { mb: 1 } as never).length, KILLS_MAX, 'no place: not a kill');
  const lines = ledgerLines(readLedger(s));
  assert.match(lines[0]!, /^KILL LEDGER \(12 tabs ended on this device; the page's own GPU estimate at the last moment it wrote: lowest 103 MB, highest 114 MB/);
  assert.equal(lines.length, 13); assert.match(lines[1]!, /^ {2}2026-11-19 10:03 {2}103 MB \(highest 200\), 9 s after opening, at slide 3 \[phone\]$/);
  assert.deepEqual(ledgerLines([]), ['KILL LEDGER: no tab ended on this device since the ledger began.']);
  assert.deepEqual(readLedger(null), []);
  const broken: Store = { getItem: () => '{not json', setItem: () => { throw new Error('full'); } };
  assert.deepEqual(readLedger(broken), []); assert.doesNotThrow(() => addKill(broken, { where: 'x' }));
  assert.equal(s.getItem(KILLS_KEY)!.length > 10, true);
});

const walkJourneys = (ran: string[]): Journey[] => [{ id: 'j', label: 'J', steps: () => ['one', 'two', 'three', 'four'].map((l) => ({ journey: 'j', label: l, run: () => { ran.push(l); } })) }];
const deps = { settle: async () => ({ settled: true, ms: 1 }), problems: () => [], errors: () => 0, memoryMB: () => 50, info: {} };

test('a resumed walk skips the steps the killed page already walked and numbers the rest from where they are', async () => {
  const ran: string[] = [], seen: number[] = [];
  await runCheck(walkJourneys(ran), deps, { from: 2, onStep: (d) => { seen.push(d); } });
  assert.deepEqual(ran, ['three', 'four']); assert.deepEqual(seen, [3, 4]);
  const all: string[] = []; await runCheck(walkJourneys(all), deps, {}); assert.equal(all.length, 4);
});

test('the audit ledger does not call a wrapper a pop when the card inside it faded out before the wrapper was removed', async () => {
  const { vanishedShowing } = await import('../src/ui/debug/audit/ledger.ts');
  assert.equal(vanishedShowing(1, [1, 0]), false);      // .dk-pos removed after its card eased to 0
  assert.equal(vanishedShowing(1, []), true);            // nothing inside faded: gone at full opacity
  assert.equal(vanishedShowing(1, [1, 1]), true);
  assert.equal(vanishedShowing(0.3, []), false);
});
