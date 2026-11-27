// External review 3531bdfa, the summary tables (A-D6, B-D3, C-D12, A-D15), pinned as rules over EVERY deck's tables, not the slides the review named. Node only.
//   B-D3: a table whose legend says "the row named under each" names the row under every row it compares (Ascites 22 had arrows and no name under three rows).
//   C-D12: a row of its own is the state a slide with the same fields stands at: `relax` (the days the patient lives at the state before it is read) was dropped for a table's own rows, so Cause treated 15
//     read "Still drinking" at HVPG 14.3 and 90 platelets where its slides say 13.3 and 75.
//   A-D6: a table whose columns do not fit its card gives the name column way, never the last column out of the card.
//   A-D15: the finding line under each row is the approved look (docs/approved/comparison-table.md); the tables still without one are listed and may only shrink.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { allCopiedDecks, nodeEngine } from '../src/ui/charts/baked/make.ts';
import { stepOf } from '../src/decks/hp/numbers.ts';
import { pendingRows } from '../src/ui/talk/table-rows.ts';
import { tableModel } from '../src/ui/talk/table-model.ts';
import { NOT_STATE, STATE_KEYS, ownStepOf } from '../src/ui/talk/table-own.ts';
import { pastEdge } from '../src/ui/cards/table-words.ts';
import type { Slide } from '../src/decks/schema.ts';
import { ensureChartsBaked } from './baked-decks.ts';
ensureChartsBaked();

const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
const decks = await Promise.all(UI.decks.map(async ({ id }) => (await loadBuiltin(id))!));
const tables = decks.flatMap((d) => d.slides.filter((s: Slide) => s.table).map((s: Slide) => ({ d, s, name: `${d.id}/${s.id}` })));

test('B-D3: where the legend says "the row named under each", every compared row has its name under it (every deck)', () => {
  assert.ok(tables.length >= 30, `${tables.length} tables`);
  let named = 0;
  for (const { d, s, name } of tables) {
    const rows = pendingRows(d, s), m = tableModel(s.table!, rows);
    m.rows.forEach((r, n) => {
      if (rows[n]!.spec.vs) { assert.match(r.vs, /^vs \S/, `${name}: "${r.title}" names the row its own vs points at`); named++; }
      if (m.legend.includes('the row named under each') && !r.ref) { assert.match(r.vs, /^vs \S/, `${name}: "${r.title}" is compared and says with what`); named++; }
    });
  }
  assert.ok(named > 20, `${named} named rows`);
});

test('B-D3: the Ascites 22 shape: rows with no vs of their own are against the first row, and say so; the reference row and a table that compares every row with the first (named once, in the legend) do not', () => {
  const row = (title: string, spec: object = {}) => ({ spec: { id: title, ...spec }, i: 1, f: { asc: 5, ppg: 10 }, title, kicker: '' });
  const m = tableModel({ vs: 'first', cols: ['asc', 'ppg'], asc: false, of: [] } as never, [row('Tense ascites'), row('Paracentesis'), row('Two weeks on', { vs: 'Paracentesis' }), row('Diuretics')] as never);
  assert.deepEqual(m.rows.map((r) => r.vs), ['', 'vs tense ascites', 'vs paracentesis', 'vs tense ascites']);
  const all = tableModel({ vs: 'first', cols: ['asc'], asc: false, of: [] } as never, [row('Tense ascites'), row('Paracentesis'), row('Diuretics')] as never);
  assert.deepEqual(all.rows.map((r) => r.vs), ['', '', ''], 'every row against the first: the legend names it once');
  assert.match(all.legend, /than tense ascites/);
});

test('C-D12: a row of its own carries every state field a slide\'s step does (nothing but words and marks is left out)', () => {
  const seen = new Set<string>();
  for (const { s } of tables) for (const sp of s.table!.of) {
    if (typeof sp === 'string' || sp.id || !sp.preset) continue;
    for (const k of Object.keys(sp)) if (!NOT_STATE.has(k) && !STATE_KEYS.includes(k)) seen.add(k);
  }
  assert.deepEqual([...seen], [], 'a row field the engine step does not carry would be dropped silently, as `relax` was');
  assert.deepEqual(ownStepOf({ preset: 'csph', params: { cirrhosis: 0.7 }, relax: 365 }), { preset: 'csph', params: { cirrhosis: 0.7 }, relax: 365 });
  assert.deepEqual(ownStepOf({ preset: 'healthy' }), { preset: 'healthy' });
  assert.deepEqual(ownStepOf({ preset: 'healthy', days: 30 }), { preset: 'healthy', presetDays: 30 }, 'days is the patient\'s age at the preset, as a slide\'s model.days');
  for (const f of ['../src/ui/talk/table-rows.ts', '../src/ui/charts/baked/make.ts']) assert.match(read(f), /ownStepOf\(/, `${f} asks the engine through the one step`);
});

test('C-D12: every row of its own that a slide of its deck repeats (same preset, parameters and relax) reads that slide\'s start state, the slide\'s own numbers (engine in node)', async () => {
  const eng = nodeEngine();
  let checked = 0;
  try {
    for (const c of await allCopiedDecks()) {
      for (const s of c.slides as { id: string; visual?: string; of?: Record<string, unknown>[] }[]) {
        for (const sp of s.visual === 'table' ? s.of ?? [] : []) {
          if (typeof sp === 'string' || sp.id || !sp.preset || sp.relax == null) continue;
          const same = (c.slides as never[]).filter((x) => { const t = stepOf(x) as Record<string, unknown>; return t.preset === sp.preset && JSON.stringify(t.params ?? {}) === JSON.stringify(sp.params ?? {}) && t.relax === sp.relax; });
          assert.ok(same.length, `${c.id}/${s.id}: "${String(sp.title)}" stands for a slide of its deck`);
          // (the slide's start: its step before the days it then lives and the ramp it then follows)
          const { days: _d, ramp: _r, ...start } = stepOf(same[0]!) as Record<string, unknown>;
          const [mine, theirs] = await Promise.all([eng.sequence([ownStepOf(sp as never)]), eng.sequence([start])]);
          for (const k of ['hvpg', 'plt', 'pv', 'ppg']) assert.equal(mine[0].fp[k], theirs[0].fp[k], `${c.id}/${s.id}: "${String(sp.title)}" ${k}`);
          checked++;
        }
      }
    }
  } finally { eng.dispose(); }
  assert.ok(checked >= 2, `${checked} rows checked (Cause treated 15 has two)`);
});

test('A-D6: a row wider than its box is found (a cell pushed past the table\'s edge), one that fits, or is a pixel over (rounding), is not; and the card gives the name way for it', () => {
  const row = (scrollWidth: number, clientWidth: number) => ({ scrollWidth, clientWidth });
  assert.equal(pastEdge([row(372, 372), row(340, 372)]), false);
  assert.equal(pastEdge([row(373, 372)]), false);
  assert.equal(pastEdge([row(372, 372), row(390, 372)]), true, 'one row is enough: they share the grid');
  assert.equal(pastEdge([]), false);
  const tsx = read('../src/ui/cards/TableCard.tsx'), css = read('../src/ui/deck-ui.css');
  assert.match(tsx, /pastEdge\(Array\.from\(box\.querySelectorAll<HTMLElement>\('tbody tr'\)\)\)/, 'every row of the body is measured');
  assert.match(tsx, /box\.classList\.toggle\('dk-fitw', over\);\s*setTight\(over\);/, 'written on the page when judged, and kept in state so a render does not wipe it');
  assert.match(tsx, /\$\{tight \? ' dk-fitw' : ''\}/);
  assert.match(css, /\.pz-table\.dk-pztable\.dk-fitw \{ --dk-name-fit: max\(var\(--dk-hl, 0px\), calc\(100% - var\(--dk-colsx, var\(--dk-cols, 0px\)\)\)\); \}/, 'the name takes what the value columns leave');
  assert.match(css, /\.dk-fitw \.tn \{ overflow-wrap: anywhere;/, 'its longest word may break: the last resort');
});

// A-D15: the finding line under a name is the approved look ("every case carries its finding line"). These tables have none yet (the words are Mohammad's to approve): the list only shrinks.
const WITHOUT_FINDING: readonly string[] = [
  'albumin/summary', 'ascites/summary', 'budd-chiari/summary', 'carvedilol/summary', 'cause-treated/summary', 'circuit/summary', 'day/summary', 'encephalopathy/summary', 'hyperdynamic/summary', 'kidney/summary',
  'landmark-trials/summary', 'masld/summary', 'meso-rex/summary', 'ncph/summary', 'next-bleed/summary', 'outflow/summary', 'pregnancy/summary', 'recompensation/summary', 'shunts/summary', 'sites/summary',
  'gastric-varices/summary', 'tips-candidacy/summary', 'ten-years/summary', 'tipping/summary', 'tips-complete/summary', 'two-inflows/summary', 'two-lesions/summary', 'variceal-bleed/summary', 'where-resistance/summary',
];
test('A-D15: every comparison table has a finding line under each case, except the listed ones (which may only shrink)', () => {
  const lacking = tables.filter(({ s }) => {
    const notes = s.table!.of.map((sp) => (typeof sp === 'string' ? undefined : sp.note));
    return notes.some((n) => !n || (Array.isArray(n) && !n.length));
  }).map((t) => t.name).sort();
  const extra = lacking.filter((n) => !WITHOUT_FINDING.includes(n)), healed = WITHOUT_FINDING.filter((n) => !lacking.includes(n));
  assert.deepEqual(extra, [], 'a new table without finding lines');
  assert.deepEqual(healed, [], 'these tables now have their finding lines: take them off the list');
});
