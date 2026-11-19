// "x of y": how much of the 2D app's inventory the 3D app has (docs/parity.md). The score never fails the test (the plan builds it up batch by batch);
// what fails is a claim of a row that is not in the inventory, or one row claimed twice. Every push report quotes the printed line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import type { Claim } from '../src/parity/claim.ts';
import { score } from '../src/parity/score.ts';
import { B4_ROWS } from '../src/parity/b4-rows.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
interface Row { id: string; area: string; batch: string; label: string }
const inventory = JSON.parse(readFileSync(join(root, 'parity/inventory.json'), 'utf8')) as { rows: Row[]; generatedFrom: { commit: string } };
// (B4 keeps its own rows for the figure's pictures: the 2D inventory lists controls, words, decks and cards, not what the figure draws)
const allRows = [...inventory.rows, ...B4_ROWS];
const byId = new Map(allRows.map((r) => [r.id, r]));

async function claims(): Promise<{ file: string; claims: readonly Claim[] }[]> {
  const dir = join(root, 'src/parity');
  const out = [];
  for (const f of readdirSync(dir).filter((x) => /^b\d+[a-z]?\.ts$|^s\d\.ts$/.test(x)).sort()) {
    const m = (await import(pathToFileURL(join(dir, f)).href)) as { claims?: readonly Claim[] };
    assert.ok(Array.isArray(m.claims), `${f} exports no \`claims\``);
    out.push({ file: f, claims: m.claims });
  }
  return out;
}

test('the inventory is the 2D app\'s and has rows for every area the plan names', () => {
  assert.ok(inventory.rows.length > 1000);
  assert.ok(inventory.generatedFrom.commit);
  for (const area of ['topbar', 'view', 'zoom', 'playbar', 'settings', 'shortcut', 'search', 'menu', 'bottombar', 'behaviour', 'deck', 'slide', 'preset']) assert.ok(inventory.rows.some((r) => r.area === area), `no ${area} rows`);
});

test('every claimed row is in the inventory, and no row is claimed twice', async () => {
  const seen = new Map<string, string>();
  for (const { file, claims: list } of await claims()) {
    for (const c of list) {
      assert.ok(byId.has(c.id), `${file} claims "${c.id}", which the 2D inventory does not have`);
      assert.ok(!seen.has(c.id), `${c.id} is claimed by ${seen.get(c.id)} and ${file}`);
      seen.set(c.id, file);
    }
  }
});

test('the score, per batch (printed; the same numbers the ?parity page shows)', async () => {
  const claimed = (await claims()).flatMap(({ file, claims: list }) => list.map((c) => ({ ...c, file })));
  const sc = score(allRows, claimed);
  const batches = sc.byBatch.map(({ batch, tally }) => `${batch} ${tally.x}/${tally.y}`).join(' · ');
  console.log(`parity: ${sc.total.x} of ${sc.total.y} rows present, ${sc.total.w} wired (2D ${inventory.generatedFrom.commit.slice(0, 8)}) | ${batches}`);
  assert.ok(sc.total.x <= sc.total.y);
  assert.equal(sc.byArea.reduce((n, g) => n + g.tally.y, 0), sc.total.y, 'every inventory row lands in one area group');
  assert.ok(!sc.byArea.some((g) => g.group === 'Other'), 'an inventory area has no group on the ?parity page: add it to AREA_GROUPS in src/parity/score.ts');
});

test('"matches 2D" is only what the owner checked: every id in matches.ts is a wired claim in the inventory, and the tally counts them apart from present and wired', async () => {
  const { MATCHES } = await import('../src/parity/matches.ts');
  const wired = new Set((await claims()).flatMap((f) => f.claims.filter((c) => c.wired).map((c) => c.id)));
  for (const id of MATCHES) { assert.ok(byId.has(id), `${id} is not in the inventory`); assert.ok(wired.has(id), `${id} is listed as matching but no batch claims it wired`); }
  const rows = inventory.rows.slice(0, 3);
  const s = score(rows, rows.map((r) => ({ id: r.id, wired: true, file: 'x.ts' })), [rows[0]!.id]);
  assert.deepEqual(s.total, { y: 3, x: 3, w: 3, m: 1 });
  const none = score(rows, rows.map((r) => ({ id: r.id, wired: true, file: 'x.ts' })));
  assert.equal(none.total.m, 0, 'wired is never "matches 2D" on its own');
});
