// B13c: the R-to-W decks are the 2D app's decks, whole. Words are copied by script, so these tests only have to show that the copy is complete and in the 2D order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { RW_IDS, DECKS, inventory } from './decks-rw-helpers.ts';

test('the sixteen decks of R to W are the ones the 2D inventory lists, split by deck id with A to G and H to P', () => {
  const ids = inventory.decks.map((d) => d.id);
  const letter = (id: string) => id[0]!;
  const mine = ids.filter((id) => letter(id) >= 'r' && letter(id) <= 'w');
  assert.deepEqual([...RW_IDS].sort(), mine.sort());
  assert.equal(RW_IDS.length, 16);
});

for (const id of RW_IDS) {
  test(`${id}: every slide of the 2D deck is here, in the 2D order, with its checks and objectives`, () => {
    const inv = inventory.decks.find((d) => d.id === id)!;
    const d = DECKS[id]!;
    assert.deepEqual(d.slides.map((s) => s.id), inv.slides.map((s) => s.id));
    assert.equal(d.checks.length, inv.checks);
    assert.equal(d.objectives.length, inv.objectives);
    for (const s of d.slides) for (const f of ['kicker', 'title', 'notes'] as const) assert.ok(typeof s[f] === 'string' && (s[f] as string).trim(), `${id}/${s.id} has no ${f}`);
  });
}

test('every slide row the inventory has for these decks has a slide here (no row left behind)', () => {
  const have = new Set(RW_IDS.flatMap((id) => DECKS[id]!.slides.map((s) => `slide:${id}/${s.id}`)));
  const rows = inventory.rows.filter((r) => r.area === 'slide' && RW_IDS.includes(r.id.slice(6).split('/')[0]!));
  assert.equal(rows.length, have.size);
  for (const r of rows) assert.ok(have.has(r.id), r.id);
});

test('the copy is the 2D app\'s, character for character (runs when a 2D checkout is at hand: PPS_2D_REPO)', { skip: !process.env.PPS_2D_REPO || !existsSync(`${process.env.PPS_2D_REPO}/src/ui/decks.js`) }, () => {
  execFileSync('node', ['scripts/port-decks-rw.mjs', '--from', process.env.PPS_2D_REPO!, '--check'], { stdio: 'pipe' });
});
