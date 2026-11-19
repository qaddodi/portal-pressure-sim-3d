// The unified debug doc (docs/debug.md): its rule, limit and flag tables are generated from the code, so they cannot drift; every rule is in a group; every section is there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { tables, fill, GROUPS } from '../scripts/debug-doc.mjs';
import { ruleList } from '../src/ui/debug/core/rules.copied.js';

const doc = readFileSync(new URL('../docs/debug.md', import.meta.url), 'utf8');

test('the generated tables are what the code says now (run `npm run debug -- doc` after adding a rule, a limit or a flag)', async () => {
  assert.equal(fill(doc, await tables()), doc);
});

test('every rule is in one of the owner\'s groups, with its owner file and why', async () => {
  const t = await tables();
  assert.ok(!/\*\*Other\*\*/.test(t.rules), 'a rule whose family has no group: add the family to GROUPS in scripts/debug-doc.mjs');
  for (const r of ruleList()) assert.ok(t.rules.includes(`\`${r.id}\``) && t.rules.includes(`\`${r.owner}\``), r.id);
  assert.ok(GROUPS.length >= 5);
});

test('the doc has its fourteen sections, in order, and the rules that keep the checks off the cloud', () => {
  const heads = [...doc.matchAll(/^## (\d+)\. (.+)$/gm)].map((m) => [+m[1]!, m[2]!] as const);
  assert.deepEqual(heads.map((h) => h[0]), Array.from({ length: 14 }, (_, i) => i + 1));
  assert.match(heads[0]![1], /short version/); assert.match(heads[13]![1], /For agents/);
  assert.match(doc, /Never GitHub Actions runners/); assert.match(doc, /No headless browser/);
});

test('every verb the doc lists is one the command has, and every flag in the doc table is one the page reads', async () => {
  const src = readFileSync(new URL('../scripts/debug.mjs', import.meta.url), 'utf8');
  for (const v of ['rules', 'limits', 'flags', 'report', 'packet', 'links', 'test', 'scan', 'doc']) { assert.match(src, new RegExp(`debug -- ${v}`)); assert.match(doc, new RegExp(`\`${v}[ \`\\[]`)); }
  assert.match(doc, /\?debug=frame/); assert.match(doc, /Copy the full report/); assert.match(doc, /kill ledger/);
});

test('every rule names an owner file that exists (the doc tells an agent where to go)', () => {
  for (const r of ruleList()) assert.ok(existsSync(new URL(`../${r.owner}`, import.meta.url)), `${r.id}: ${r.owner} does not exist`);
});
