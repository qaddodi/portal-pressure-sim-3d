// Capture 36b7deac (Sites and causes), the leftover nits, each pinned as the general rule it comes from, not as the one slide it was seen on:
//  1. dots that touch each give their name a leader (slide 12's clot and schistosomiasis stood on one spot with two names and no lines);
//  2. a ladders grid's heads stand alike: one cell under means every cell under (slide 11: the first two beside, the other four under, two row heights);
//  3. an arrow's colour is its step on every table (slide 13: the SAAG single arrows were red-orange while the legend's single arrow is amber);
//  4. a table's name column asks for two lines of its longest name (slide 13: "Sinusoidal obstruction syndrome" on three lines);
//  5. a head that lies on its side has the body's ink (slide 13: eight dim turned heads).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planeLayout } from '../src/ui/charts/plane/model.ts';
import { leadTogether, togetherPoints, TOGETHER, LEAD_PAST } from '../src/ui/charts/plane/close-leads.ts';
import { headsStack } from '../src/ui/charts/ladder/model.ts';
import { tableModel, type ResolvedRow } from '../src/ui/talk/table-model.ts';
import { rateAbs } from '../src/ui/deck/from2d/table-marks.js';
import { twoLineChars, twoLineWidest, longestWord } from '../src/ui/cards/table-words.ts';

const rng = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const plane = { x: { key: 'pv', min: 0, max: 30, ticks: [0, 10, 20, 30], name: 'Portal vein pressure, mmHg', short: 'Portal, mmHg' }, y: { key: 'hvpg', min: 0, max: 20, ticks: [0, 5, 10, 20], name: 'HVPG, mmHg' },
  zones: [{ when: [['hvpg', '<=', 5]], t: 'HVPG normal', tone: 'ok' }, { t: 'HVPG raised', tone: 'hvpg' }], cuts: { y: [5] }, key: 'never' } as never;
const nearest = (b: number[], p: { x: number; y: number }): number => Math.hypot(Math.max(b[0]! - p.x, 0, p.x - b[2]!), Math.max(b[1]! - p.y, 0, p.y - b[3]!));

test('plane: every point that has company has a leader to its name, long enough to see, for every width and every spacing', () => {
  const rand = rng(11);
  let together = 0, cases = 0;
  for (const W of [358, 440, 700]) for (let t = 0; t < 16; t++) {
    // (a pair of points on one spot or a few px off it, among others: three on one spot is slow in the 2D layout itself, 12 s at 358 px, which this file does not take on)
    const px = 5 + rand() * 20, py = 1 + rand() * 12, jitter = [0, 0.2, 0.5, 1.2][t % 4]!;
    const pts = [{ f: { pv: 5, hvpg: 2 }, name: 'Healthy' }, { f: { pv: px, hvpg: py }, name: 'Portal vein thrombosis', short: 'PVT' }, { f: { pv: px + jitter * rand(), hvpg: py + jitter * rand() }, name: 'Schistosomiasis', short: 'Schisto' },
      { f: { pv: 19, hvpg: 16 }, name: 'Cirrhosis' }, ...(t % 3 ? [{ f: { pv: 26, hvpg: 8 }, name: 'Budd–Chiari syndrome', short: 'Budd–Chiari' }] : [])];
    const L = planeLayout({ plane, W, H: 260, fs: 16, points: pts as never });
    cases++;
    const set = togetherPoints(L.at, L.pr);
    for (const i of set) {
      const n = L.names[i];
      if (!n) continue;
      together++;
      assert.ok(n.lead, `W ${W} case ${t}: "${L.at[i]!.name}" has company and no leader`);
      // (the leader leaves the point and ends on its name's box)
      const d = nearest(n.box, L.at[i]!), end = Math.hypot(n.lead![0] - L.at[i]!.x, n.lead![1] - L.at[i]!.y);
      assert.ok(d < 1 || end > 0, 'it ends at the name');
      assert.ok(end >= L.pr + 4, `W ${W} case ${t}: "${L.at[i]!.name}" leader is ${end.toFixed(1)} px, too short to see past the dot (${L.pr})`);
    }
  }
  assert.ok(cases === 48 && together > 30, `the walk has company in it (${together})`);
});

test('plane: a point alone keeps what the layout gave it; a name already on a leader keeps its leader; nothing is changed in what it is given', () => {
  const at = [{ x: 50, y: 50 }, { x: 200, y: 100 }];
  const box = [60, 44, 140, 60] as [number, number, number, number], box2 = [210, 94, 290, 110] as [number, number, number, number];
  const names = [{ x: 60, y: 56, anchor: 'start' as const, lines: ['A'], box }, { x: 210, y: 106, anchor: 'start' as const, lines: ['B'], box: box2, lead: [210, 100] as [number, number] }];
  const frozen = JSON.stringify(names);
  const fr = { L: 0, R: 390, T: 0, B: 290 };
  assert.equal(togetherPoints(at, 8).size, 0);
  const out = leadTogether(at, names, 8, fr, []);
  assert.equal(JSON.stringify(names), frozen, 'the input is not changed');
  assert.deepEqual(out, names);
  // two points on one spot: both get a leader, a name already on one keeps it
  const two = [{ x: 100, y: 100 }, { x: 100, y: 100 }];
  const nm = [{ x: 116, y: 100, anchor: 'start' as const, lines: ['A'], box: [116, 90, 150, 110] as [number, number, number, number] }, { x: 84, y: 100, anchor: 'end' as const, lines: ['B'], box: [50, 90, 84, 110] as [number, number, number, number], lead: [84, 100] as [number, number] }];
  const o2 = leadTogether(two, nm, 8, fr, []);
  assert.ok(o2[0]!.lead && Math.hypot(o2[0]!.lead[0] - 100, o2[0]!.lead[1] - 100) >= 8 + LEAD_PAST - 0.01, 'the first has a leader of the least length');
  assert.deepEqual(o2[1]!.lead, [84, 100], 'the second keeps its own');
  assert.ok(TOGETHER >= 3);
});

test('plane: the leader is drawn by the one frame code for every plane that draws names', () => {
  const frame = readFileSync('src/ui/charts/plane/frame.ts', 'utf8'), model = readFileSync('src/ui/charts/plane/model.ts', 'utf8');
  assert.match(frame, /if \(n\?\.lead\) seg\(\{ x1: p\.x, y1: p\.y, x2: n\.lead\[0\], y2: n\.lead\[1\] \}, lk\('plane\.lead'\)\)/);
  assert.match(model, /leadTogether\(at, lay\.names, pr, fr,/);
});

test('ladders: the heads of a grid stand alike, whatever the cells measured', () => {
  const rand = rng(5);
  for (let t = 0; t < 200; t++) {
    const natural = Array.from({ length: 6 }, () => rand() < 0.5);
    const stack = headsStack(natural);
    assert.equal(stack, natural.some(Boolean));
    // (the rule has one answer for all six: either none of them goes under, or all of them do)
    assert.ok(natural.every((n) => !n) ? !stack : stack);
  }
  assert.equal(headsStack([false, false, true, true, true, true]), true, 'slide 11: two fit beside, four do not: all stack');
  assert.equal(headsStack([false, false, false]), false);
  const card = readFileSync('src/ui/charts/ladder/LaddersCard.tsx', 'utf8');
  const head = card.slice(card.indexOf('function CellHead'), card.indexOf('A wide screen'));
  assert.match(head, /headsStack\(all\)/);
  assert.match(head, /grid\.dispatchEvent\(new Event\(HEADS_EVENT\)\)/, 'a cell that measured earlier measures again when the grid\'s verdict changes');
  assert.doesNotMatch(head, /useState|setFit/);
});

const fpOf = (saag: number | undefined): ResolvedRow['f'] => ({ asc: 3000, saag, tp: 3.2, pv: 20, whvp: 10, fhvp: 4, ra: 4, hvpg: 6, ppg: 12 });
test('tables: an arrow wears the colour its step has on every table (one arrow amber, two red), SAAG as every column', () => {
  const spec = { visual: 'table', cols: ['pv', 'hvpg', 'ppg'], asc: true, of: [] } as never;
  const mk = (saag: number | undefined, i: number, ref = false): ResolvedRow => ({ spec: { preset: 'x', title: `r${i}`, ...(ref ? { ref: true } : {}) } as never, i: -1, f: fpOf(saag), title: `r${i}`, kicker: '' });
  const rows = [mk(0.5, 0, true), mk(0.6, 1), mk(1.1, 2), mk(1.6, 3), mk(2.4, 4)];
  const m = tableModel(spec, rows);
  let seen = 0;
  for (const r of m.rows) for (const c of r.cells) {
    if (c.kind !== 'dir' || c.arrow === 0) continue;
    seen++;
    // (a coloured arrow is its step's colour: the one rule the legend states)
    if (c.rate) assert.equal(c.rate, rateAbs(c.k, c.arrow), `${r.title} ${c.k}`);
  }
  assert.ok(seen > 8);
  const saag = (n: number) => m.rows[n]!.cells.find((c) => c.k === 'saag')!;
  assert.equal(saag(2).arrow, 1); assert.equal(saag(2).rate, 'mid', 'a SAAG over the cut-off is one arrow, amber');
  assert.equal(saag(1).arrow, -1); assert.equal(saag(1).rate, null, 'under it the arrow is quiet');
  assert.equal(saag(0).rate, null, 'a reference SAAG under the cut-off is quiet');
  // (the ascitic protein is the same rule: tp 3.2 is over its cut-off, so one amber arrow, and under it quiet)
  const prot = (n: number) => m.rows[n]!.cells.find((c) => c.k === 'tp')!;
  assert.equal(prot(2).arrow, 1); assert.equal(prot(2).rate, 'mid', 'a protein over the cut-off is one arrow, amber, like the SAAG');
  const heavy = tableModel(spec, [mk(2.4, 0, true), ...rows.slice(1)]);
  assert.equal(heavy.rows[0]!.cells.find((c) => c.k === 'saag')!.rate, 'mid', 'a reference over the cut-off wears the same one-arrow colour');
});

test('tables: a name column asks for two lines of its longest name, never under its longest word', () => {
  assert.equal(twoLineChars('Cirrhosis'), 9);
  assert.equal(twoLineChars('Right heart failure'), 11, '"Right heart" over "failure"');
  assert.equal(twoLineChars('Sinusoidal obstruction syndrome'), 20, '"Sinusoidal" over "obstruction syndrome"');
  assert.equal(twoLineChars('Portal vein thrombosis'), 11, '"Portal vein" over "thrombosis"');
  assert.equal(twoLineChars(''), 0);
  const rand = rng(3), words = ['a', 'portal', 'vein', 'thrombosis', 'obstruction', 'syndrome', 'of', 'the', 'liver', 'Schistosomiasis'];
  for (let t = 0; t < 300; t++) {
    const name = Array.from({ length: 1 + Math.floor(rand() * 6) }, () => words[Math.floor(rand() * words.length)]).join(' ');
    const w = twoLineChars(name), lines = (cap: number) => { let n = 1, used = 0; for (const x of name.split(' ')) { if (!used) used = x.length; else if (used + 1 + x.length <= cap) used += 1 + x.length; else { n++; used = x.length; } } return n; };
    assert.ok(w >= longestWord([name]) || name.split(' ').length === 1, 'never under the longest word');
    assert.ok(lines(w) <= 2 || w >= name.length, `"${name}" fits two lines at ${w}`);
    if (w > longestWord([name])) assert.ok(lines(w - 1) > 2, `"${name}": ${w} is the least`);
  }
  assert.equal(twoLineWidest(['Healthy', 'Sinusoidal obstruction syndrome', 'Cirrhosis']), 20);
  const css = readFileSync('src/ui/deck-ui.css', 'utf8'), tsx = readFileSync('src/ui/cards/TableCard.tsx', 'utf8');
  assert.match(css, /min\(max\(var\(--dk-name\), calc\(var\(--dk-wn2, 0\) \* \.62em \+ 20px\)\), calc\(100% - var\(--dk-cols, 0px\)\)\)/);
  assert.match(tsx, /twoLineWidest\(model\.rows\.map\(\(r\) => r\.title\)\)/);
});

test('tables: a column head that lies on its side has the body\'s ink and a full weight', () => {
  const css = readFileSync('src/ui/css3d-over-2d.css', 'utf8');
  assert.match(css, /thead tr\.th-up th\.num > \.hd \{ color: var\(--text-2\); font-weight: 700;/);
});

// Mohammad, 26 Nov, slide 13: "B", full flat heads staggered on two levels under group names, in place of the turned heads. The general rule, for every table on a phone.
import { chooseHeads, fitsStaggered, setHeads, groupRuns, showGroups, type ClassHost } from '../src/ui/cards/table-heads.ts';
import { groupOf } from '../src/ui/talk/table-model.ts';
const host = (...c: string[]): ClassHost & { set: Set<string> } => { const set = new Set(c); return { set, classList: { add: (x) => void set.add(x), remove: (x) => void set.delete(x), contains: (x) => set.has(x) } }; };

test('heads: the first way that fits wins (flat, then staggered, then turned)', () => {
  assert.equal(chooseHeads(false, false), 'flat');
  assert.equal(chooseHeads(false, true), 'flat', 'a table that fits flat never staggers');
  assert.equal(chooseHeads(true, false), 'stagger');
  assert.equal(chooseHeads(true, true), 'turned');
  // two columns of room less a gap; the end heads stay within the table's edge
  assert.ok(fitsStaggered(38, 30) && !fitsStaggered(55, 30));
  assert.ok(fitsStaggered(54, 30) && !fitsStaggered(55, 30), 'two columns less a 6 px gap');
});

test('heads: setHeads writes the one state on the page at once, leaving nothing of the others', () => {
  const row = host(), box = host('pz-table');
  assert.equal(setHeads(row, box, 'stagger'), true);
  assert.ok(row.set.has('th-st') && !row.set.has('th-up') && box.set.has('dk-up') && box.set.has('dk-st'));
  assert.equal(setHeads(row, box, 'stagger'), false);
  assert.equal(setHeads(row, box, 'turned'), true);
  assert.ok(row.set.has('th-up') && !row.set.has('th-st') && box.set.has('dk-up') && !box.set.has('dk-st'), 'turned: no group row');
  assert.equal(setHeads(row, box, 'flat'), true);
  assert.ok(!row.set.has('th-up') && !row.set.has('th-st') && !box.set.has('dk-up') && !box.set.has('dk-st') && box.set.has('pz-table'));
});

test('heads: columns group by what they are (pressures, ascites); the group row shows only when a group names two or more', () => {
  assert.deepEqual(['pv', 'whvp', 'fhvp', 'ra', 'hvpg', 'ppg', 'saag', 'tp'].map(groupOf), ['Pressures', 'Pressures', 'Pressures', 'Pressures', 'Pressures', 'Pressures', 'Ascites', 'Ascites']);
  const runs = groupRuns(['Pressures', 'Pressures', 'Pressures', 'Ascites', 'Ascites']);
  assert.deepEqual(runs, [{ label: 'Pressures', span: 3 }, { label: 'Ascites', span: 2 }]);
  assert.equal(showGroups(runs), true);
  assert.equal(showGroups(groupRuns(['', 'Pressures', '', 'Ascites'])), false, 'single columns need no group row');
  assert.deepEqual(groupRuns(['Pressures', '', '', 'Pressures']), [{ label: 'Pressures', span: 1 }, { label: '', span: 2 }, { label: 'Pressures', span: 1 }], 'a run is consecutive columns only');
  const css = readFileSync('src/ui/css3d-over-2d.css', 'utf8'), tsx = readFileSync('src/ui/cards/TableCard.tsx', 'utf8');
  assert.match(css, /\.pz-table\.dk-pztable thead tr\.th-grp \{ display: none; \}/);
  assert.match(css, /\.pz-table\.dk-pztable\.dk-st thead tr\.th-grp \{ display: grid; grid-template-columns: var\(--dk-grid\)/);
  assert.match(css, /thead tr\.th-st th\.num:nth-child\(even\) > \.hd \{ bottom: 22px; \}/, 'every other head a line higher');
  assert.match(tsx, /chooseHeads\(true, staggerOver\(\)\)/);
  assert.match(css, /th\.num:last-child > \.hd \{ left: auto; right: 2px/, 'the last head keeps to the table\'s edge');
  assert.match(css, /thead tr\.th-grp th\.num\.g \{[^}]*font-size: 12px/, 'the group names keep the 12 px floor');
});
