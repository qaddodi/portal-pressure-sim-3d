// Every row of the ?parity tracker with its real state, from the same score() the page and tests/parity-score.test.ts use (node only, a second).
//   node scripts/parity-rows.ts                  per-area summary (missing / present / wired / matches)
//   node scripts/parity-rows.ts --list [state] [--area <inventory area>] [--batch B10]   one row per line: state, claiming file, id, label
//   node scripts/parity-rows.ts --json           everything as JSON
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { score, type Claimed, type Row } from '../src/parity/score.ts';
import { B4_ROWS } from '../src/parity/b4-rows.ts';
import { MATCHES } from '../src/parity/matches.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const inv = JSON.parse(readFileSync(join(root, 'parity/inventory.json'), 'utf8')) as { rows: Row[] };
const rows = [...inv.rows, ...B4_ROWS];
const claimed: Claimed[] = [];
for (const f of readdirSync(join(root, 'src/parity')).filter((x) => /^b\d+[a-z]?\.ts$|^s\d\.ts$/.test(x)).sort()) {
  const m = (await import(pathToFileURL(join(root, 'src/parity', f)).href)) as { claims?: readonly { id: string; wired: boolean }[] };
  for (const c of m.claims ?? []) claimed.push({ id: c.id, wired: c.wired, file: f });
}
const sc = score(rows, claimed, MATCHES);
const file = new Map(claimed.map((c) => [c.id, c.file]));
const all = sc.byArea.flatMap((g) => g.rows.map((r) => ({ ...r, file: file.get(r.id) ?? '' })));
const args = process.argv.slice(2);
const arg = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
if (args.includes('--json')) { console.log(JSON.stringify({ total: sc.total, rows: all })); }
else if (args.includes('--list')) {
  const st = ['missing', 'present', 'wired', 'matches'].find((s) => args.includes(s));
  for (const r of all) if ((!st || r.state === st) && (!arg('--area') || r.area === arg('--area')) && (!arg('--batch') || r.batch === arg('--batch'))) console.log(`${r.state.padEnd(7)} ${r.file.padEnd(8)} ${r.id}  | ${r.label}`);
} else {
  const t: Record<string, Record<string, number>> = {};
  for (const r of all) { const k = `${r.area} ${r.batch}`; (t[k] ??= { missing: 0, present: 0, wired: 0, matches: 0 })[r.state]!++; }
  for (const k of Object.keys(t).sort()) console.log(k.padEnd(20), Object.entries(t[k]!).map(([s, n]) => `${s} ${n}`).join('  '));
  console.log(`TOTAL ${sc.total.y} rows: present ${sc.total.x} (${sc.total.y - sc.total.x} missing), wired ${sc.total.w}, match 2D ${sc.total.m}`);
}
