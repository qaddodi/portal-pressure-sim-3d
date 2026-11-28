// The rule behind the 2D-parity fixtures (tests/engine-departures.ts): this app's engine may move on from the 2D app's numbers, but only through records taken FROM the engine by one command, never by
// hand, and never left behind when the engine moves. Why a rule and not four fixtures: on 26 Nov hales-engine ba0e3c4 and 6ed0928 (the ascites refill) and b95ecb5 (collaterals shrink back slowly)
// shifted the settled state of every patient with a belly or a shunt, in 9 H-to-P decks and all 16 R-to-W decks, and the hand-listed departures (two decks here, six there) said nothing: the live runs
// that would have caught it are the Mac's (RW_FULL, DECKS_HP_FULL), so it surfaced as two red tests weeks of engine commits later.
// This test is fast (no engine run): it fails the moment the pin moves without `npm run gen:departures`, and when a record is stale or has no generator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { departures, hpNumbers, inPlayDecks, advancedNumbers, advancedRecord, advancedKey, type HpRow, type AdvancedFx } from './engine-departures.ts';

const json = (u: string) => JSON.parse(readFileSync(new URL(u, import.meta.url), 'utf8'));
const fx = (f: string) => json(`./fixtures/${f}`);
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-9);

test('the departures were recorded at the engine the app now runs: a pin move re-records them in the same commit (npm run gen:departures)', () => {
  const pin = json('../src/engine/PINNED.json').engine.commit as string;
  const at = fx('departures-pin.json').engine as string;
  assert.equal(at, pin, `the engine is ${pin.slice(0, 8)} but the departures from the 2D app were recorded at ${at.slice(0, 8)}: run \`npm run gen:departures\` (about four minutes), read the diff and the printed tokens, commit`);
});

test('every departure record has its generator in the one command, and every generator writes a record the tests read', () => {
  const all = readFileSync(new URL('../scripts/gen-engine-departures.mjs', import.meta.url), 'utf8');
  const family = readdirSync(new URL('./fixtures/', import.meta.url)).filter((f) => /^(rw-numbers|decks-hp-numbers|deck-numbers-ag|advanced-numbers)-3d\.json$/.test(f));
  assert.deepEqual(family.sort(), ['advanced-numbers-3d.json', 'deck-numbers-ag-3d.json', 'decks-hp-numbers-3d.json', 'rw-numbers-3d.json'], 'the 2D-parity families');
  for (const f of family) {
    const gen = readdirSync(new URL('../scripts/', import.meta.url)).filter((s) => /^gen-.*-3d\.mjs$/.test(s) && readFileSync(new URL(`../scripts/${s}`, import.meta.url), 'utf8').includes(`tests/fixtures/${f}`));
    assert.equal(gen.length, 1, `${f} is written by exactly one generator`);
    assert.ok(all.includes(gen[0]!), `${gen[0]} is run by gen-engine-departures.mjs`);
  }
  assert.match(readFileSync(new URL('../package.json', import.meta.url), 'utf8'), /"gen:departures": "node scripts\/gen-engine-departures\.mjs"/);
});

test('a record holds only what departs: every deck in it is a deck of the 2D fixture, shaped like it, and moves at least one reading', () => {
  const hp2 = inPlayDecks(fx('decks-hp-numbers.json').decks as Record<string, HpRow[]>);
  const hp = hpNumbers();
  for (const [id, rows] of Object.entries(departures('decks-hp-numbers-3d.json') as Record<string, HpRow[]>)) {
    assert.ok(hp2[id], `${id} is a 2D deck`);
    // (a slide the talk cut into parts, SPLIT_PAGES, 28 Nov, has parts the 2D deck does not: `<id>-2`; they stand in the record after their first part and are not compared with 2D)
    const twoIds = new Set(hp2[id]!.map((r) => r.id)), own = rows.filter((r) => twoIds.has(r.id));
    assert.deepEqual(own.map((r) => r.id), hp2[id]!.map((r) => r.id), `${id}: the slides are the 2D deck's (in the order the talk plays them)`);
    assert.ok(rows.every((r) => twoIds.has(r.id) || twoIds.has(r.id.replace(/-\d+$/, ''))), `${id}: a slide that is not the 2D deck's is a part of one that is`);
    // (a deck also departs when a {token} prints another text than 2D's: the words moved, as {hvpg:0} printing the tile's one decimal)
    const moved = own.some((r, i) => Object.entries(hp2[id]![i]!.fp).some(([k, v]) => rel(r.fp[k] ?? NaN, v) > 2e-5) || r.tokens.some((tk, j) => tk[1] !== hp2[id]![i]!.tokens[j]?.[1]));
    assert.ok(moved, `${id}: recorded but no reading or printed token moved: delete it, the 2D numbers are the truth`);
    assert.deepEqual(hp[id], rows, `${id}: the loader reads the record`);
  }
  const rw2 = fx('rw-numbers.json').decks as Record<string, Record<string, number>[]>;
  for (const [id, rows] of Object.entries(departures('rw-numbers-3d.json') as Record<string, Record<string, number>[]>)) {
    assert.ok(rw2[id], `${id} is a 2D deck`);
    assert.ok(rows.length >= rw2[id]!.length, `${id}: a row for the outline, every slide and the quick check`);
    // (varices has four slides of its own, so its rows are matched by length only)
    if (rows.length === rw2[id]!.length) assert.ok(rows.some((r, i) => Object.entries(rw2[id]![i]!).some(([k, v]) => Math.abs((r[k] ?? NaN) - v) > 1.5e-4)), `${id}: recorded but no reading moved`);
  }
  const ag2 = fx('deck-numbers-ag.json').decks as Record<string, { slides: { fp: Record<string, number> }[] }>;
  for (const [id, d] of Object.entries(departures('deck-numbers-ag-3d.json') as Record<string, { fp: Record<string, number> }>)) {
    assert.ok(ag2[id], `${id} is a 2D deck`);
    assert.ok(Object.entries(ag2[id]!.slides[0]!.fp).some(([k, v]) => rel(d.fp[k] ?? NaN, v) > 1e-6), `${id}: recorded but no reading moved`);
  }
});

test('the Advanced physiology table: a recorded row is a row of the 2D table that moved, by a small shift (a model change is not a recording job), and the loader reads it', () => {
  const two = fx('advanced-2d.json') as AdvancedFx, rec = advancedRecord(), mine = advancedNumbers();
  const keys = Object.keys(two.base);
  // The one named exception to the 10% bound (engine 4f4e49f, junction table): with the spontaneous splenorenal shunt open the portal flow is small (0.24 to 0.29 mL/s),
  // so moving the shunt's take-off to where it is drawn moves pvFlow and pvVel by 0.05 mL/s, 20 to 30 percent of a small number.
  const ALLOWED_SHIFT: Readonly<Record<string, number>> = { 'srShunt=true pvFlow': 0.3, 'srShunt=true pvVel': 0.3 };
  const small = (a: Record<string, number>, b: Record<string, number>, where: string) => {
    assert.ok(keys.some((k) => a[k] !== b[k]), `${where}: recorded but no reading moved: delete it, the 2D numbers are the truth`);
    for (const k of keys) {
      const share = ALLOWED_SHIFT[`${where} ${k}`] ?? 0.1;
      assert.ok(Math.abs(a[k]! - b[k]!) <= Math.max(share * Math.abs(b[k]!), 0.05), `${where} ${k}: ${b[k]} became ${a[k]}, over a ${share * 100}% shift: a model change to look at, not to record`);
    }
  };
  if (rec.base) small(rec.base, two.base, 'base');
  assert.deepEqual(mine.base, rec.base ?? two.base);
  const ids = new Set(two.cases.map(advancedKey));
  for (const k of Object.keys(rec.cases)) assert.ok(ids.has(k), `${k} is a case of the 2D table`);
  for (const c of two.cases) {
    const r = rec.cases[advancedKey(c)];
    if (r) small(r, c.readings, advancedKey(c));
    assert.deepEqual(mine.cases.find((m) => advancedKey(m) === advancedKey(c))!.readings, r ?? c.readings);
  }
});

test('no departure record is hand-kept: each says where it comes from, and the pin file says when', () => {
  for (const f of ['rw-numbers-3d.json', 'decks-hp-numbers-3d.json', 'deck-numbers-ag-3d.json', 'advanced-numbers-3d.json']) assert.match(fx(f).note as string, /scripts\/gen-[a-z-]+-3d\.mjs/, f);
  assert.ok(existsSync(new URL('./fixtures/departures-pin.json', import.meta.url)));
});
