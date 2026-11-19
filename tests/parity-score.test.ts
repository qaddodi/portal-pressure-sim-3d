// "x of y": how much of the 2D app's inventory the 3D app has (docs/parity.md). The score never fails the test (the plan builds it up batch by batch);
// what fails is a claim of a row that is not in the inventory, or one row claimed twice. Every push report quotes the printed line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import type { Claim } from '../src/parity/claim.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
interface Row { id: string; area: string; batch: string; label: string }
const inventory = JSON.parse(readFileSync(join(root, 'parity/inventory.json'), 'utf8')) as { rows: Row[]; generatedFrom: { commit: string } };
const byId = new Map(inventory.rows.map((r) => [r.id, r]));

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

test('the score, per batch (printed)', async () => {
  const have = new Map<string, boolean>();
  for (const { claims: list } of await claims()) for (const c of list) have.set(c.id, c.wired);
  const per = new Map<string, { y: number; x: number; w: number }>();
  for (const r of inventory.rows) {
    const p = per.get(r.batch) ?? { y: 0, x: 0, w: 0 };
    p.y++;
    if (have.has(r.id)) { p.x++; if (have.get(r.id)) p.w++; }
    per.set(r.batch, p);
  }
  const total = [...per.values()].reduce((a, p) => ({ y: a.y + p.y, x: a.x + p.x, w: a.w + p.w }), { y: 0, x: 0, w: 0 });
  const batches = [...per.entries()].sort((a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1))).map(([b, p]) => `${b} ${p.x}/${p.y}`).join(' · ');
  console.log(`parity: ${total.x} of ${total.y} rows present, ${total.w} wired (2D ${inventory.generatedFrom.commit.slice(0, 8)}) | ${batches}`);
  assert.ok(total.x <= total.y);
});
