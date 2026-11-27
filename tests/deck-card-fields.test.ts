// Every field of a 2D slide reaches the screen (batch B13, CARDS): the copied slide's fields are all classified (decks/hp/fields.ts), each one carried onto the Slide shows up there, and the
// teaching card's model (ui/cards/card-fields.ts) prints the level tab, the rail, the guidelines side by side, the source line, the causes and the line's pill for every slide that has them.
// Pure functions only (the cards are thin TSX over them); the decks are the real copied 2D decks, nothing is typed per slide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { copiedOf } from '../src/decks/hp/deck.ts';
import { FIELD_HOME, SLIDE_PROP } from '../src/decks/hp/fields.ts';
import { CARD_LANDED, readiness } from '../src/decks/hp/hooks.ts';
import { loadSource, SOURCE_IDS } from '../src/decks/source.ts';
import { AG_IDS, loadAgDeck } from '../src/decks/ag/index.ts';
import { cardFields, SITE_TAGS, siteTag, tabOf, railOf, RAIL_LEVELS, autoPill, listCase } from '../src/ui/cards/card-fields.ts';
import { stopsOf, viewAt, next, back, goto } from '../src/ui/deck/presenter-machine.ts';
import { variantWords, howOf, speaks } from '../src/decks/controls.ts';
import { parseLine } from '../src/ui/text/line.ts';
import { tileRows } from '../src/decks/hp/tiles-model.ts';
import { planeOf } from '../src/ui/charts/plane/model.ts';
import { CHARTS } from '../src/ui/charts/registry.ts';
import { wallsFrame, WALLS_COPY } from '../src/ui/charts/walls/frame.ts';
import { ctxOf } from './charts-helpers.ts';
import type { Deck, Slide } from '../src/decks/schema.ts';
import type { CopiedSlide } from '../src/decks/hp/types.ts';

const ids = UI.decks.map((d) => d.id);
const loaded: { id: string; deck: Deck; src: CopiedSlide[] }[] = [];
for (const id of ids) { const deck = (await loadBuiltin(id))!, c = copiedOf(id); if (deck && c) loaded.push({ id, deck, src: c.slides }); }
const everySlide = () => loaded.flatMap(({ id, deck, src }) => deck.slides.map((s, i) => ({ id, deck, s, c: src[i]! })));
const has = (v: unknown) => v != null && v !== false && v !== '' && !(Array.isArray(v) && !v.length);

test('every field of every slide of every deck is classified: none can be dropped quietly', () => {
  assert.equal(loaded.length, ids.length, 'every talk loads');
  const unknown = new Set<string>();
  let slides = 0;
  for (const { id, c } of everySlide()) { slides++; for (const f of Object.keys(c)) if (!(f in FIELD_HOME)) unknown.add(`${id}: ${f}`); }
  assert.deepEqual([...unknown], [], 'a 2D field that decks/hp/fields.ts does not name');
  assert.ok(slides >= 508, `slides read (${slides})`);
});

/** When a `slide` field is carried (the rest of the time the Slide rightly has no use for it). */
const WHEN: Record<string, (c: CopiedSlide) => boolean> = {
  question: (c) => !c.vignette && !c.preset && !c.procedure,
  tiles: (c) => c.data === 'tiles' && !!c.tiles?.length, key: (c) => c.data === 'tiles' && !!c.tiles?.length, delta: (c) => c.data === 'tiles' && !!c.tiles?.length, data: (c) => c.data === 'tiles' && !!c.tiles?.length,
  hvpgResp: (c) => c.data === 'tiles' && !!c.tiles?.length,
  hvpgRule: (c) => c.data === 'tiles' && !!c.tiles?.length,
  tool: (c) => !!(c.tool && typeof (c.tool as { kind?: unknown }).kind === 'string'),
  lapse: (c) => !!c.lapse && typeof c.days === 'number' && c.days > 0,
  cath: (c) => ['route', 'free', 'wedge', 'result'].includes(c.cath ?? ''),
  compare: (c) => Array.isArray(c.compare) && !c.compare.some((o) => 'gate' in o || 'tool' in o),   // (the instruments' own buttons belong to the Tests cards)
  whatIf: (c) => !(c.whatIf as { tool?: unknown } | undefined)?.tool,
  scales: () => false,                                                                              // (carried only as a switch of two or more views: decks-controls.test.ts)
  response: (c) => c.response === true,
  cols: (c) => c.visual === 'table', of: (c) => c.visual === 'table', vs: (c) => c.visual === 'table', asc: (c) => c.visual === 'table', rowHead: (c) => c.visual === 'table',
  foot: (c) => c.visual === 'table', note: (c) => c.visual === 'table', calm: (c) => c.visual === 'table', focusRow: (c) => c.visual === 'table',
  terms: () => false,                                                                               // (only the words the figure's labels can place: hp/deck.ts knownTerms)
  pill: (c) => c.pill === false, rail: (c) => !!c.rail,
};

test('each slide field the Slide carries is on the Slide, under the property the table names', () => {
  const missing: string[] = [];
  let carried = 0;
  for (const { id, s, c } of everySlide()) {
    for (const [f, home] of Object.entries(FIELD_HOME)) {
      if (home !== 'slide' || !(f in c) || !has(c[f])) continue;
      if (WHEN[f] && !WHEN[f]!(c)) continue;
      const prop = SLIDE_PROP[f] ?? f;
      // (the slice's four slides keep the HVPG ladder card in place of the 2D hvpg instrument: the Tests cards' tool:hvpg)
      if (id === 'hvpg' && f === 'tool' && ['route', 'free', 'wedge', 'hvpg'].includes(s.id)) continue;
      carried++;
      if (!has((s as unknown as Record<string, unknown>)[prop])) missing.push(`${id}/${s.id}: ${f} -> ${prop}`);
    }
  }
  assert.deepEqual(missing, []);
  assert.ok(carried > 2500, `fields checked (${carried})`);
});

test('the level tab: every slide of a deck that teaches more than one level names its level, in its own colour; a rail slide names it on the tab where the rail is hidden', () => {
  let tabs = 0, rails = 0;
  for (const { id, deck, s } of everySlide()) {
    const t = tabOf(deck, s);
    if (!s.site || s.visual) { assert.equal(t, null, `${id}/${s.id}: no level, no tab`); continue; }
    const many = deck.slides.some((x) => x.site && x.site !== 'sin'), name = SITE_TAGS[s.site];
    assert.ok(name, `${id}/${s.id}: site "${s.site}" has a name`);
    if (s.rail) { if (s.rail !== 'all' && many) { assert.equal(t?.rail, true); rails++; } continue; }
    if (!many || s.kicker.toLowerCase().includes(name!.toLowerCase())) { assert.equal(t, null, `${id}/${s.id}`); continue; }
    assert.equal(t?.name, name, `${id}/${s.id}`); assert.equal(t?.site, s.site === 'pvt' ? 'pre' : s.site);
    tabs++;
  }
  assert.ok(tabs >= 100, `level tabs (${tabs})`);
  assert.ok(rails >= 1);
  // a deck about cirrhosis alone carries none
  assert.equal(siteTag({ slides: [{ site: 'sin' }, { site: 'sin' }] as Slide[] }, { site: 'sin', kicker: 'x' }), null);
});

test('the level tab: a slide about two levels carries a second tab (Prehepatic 13, carvedilol in cirrhosis with a prehepatic clot)', () => {
  const rows = [...everySlide()].filter(({ s }) => s.also);
  assert.deepEqual(rows.map(({ id, s }) => `${id}/${s.id}`), ['prehepatic/carv']);
  const { deck, s } = rows[0]!;
  assert.equal(s.site, 'sin');
  assert.deepEqual(tabOf(deck, s), { site: 'sin', name: 'Sinusoidal', also: { site: 'pre', name: 'Pre-hepatic' } });
  // the same level twice is one tab
  assert.equal(siteTag({ slides: [{ site: 'pre' }, { site: 'sin' }] as Slide[] }, { site: 'pre', also: 'pvt', kicker: 'x' })?.also, undefined);
});

test('the level rail: six levels, the liver\'s three bracketed; `all` names every level and a one-level rail marks the slide\'s own', () => {
  let n = 0;
  for (const { id, s } of everySlide()) {
    const r = railOf(s);
    if (!s.rail) { assert.equal(r, null); continue; }
    n++;
    assert.equal(r!.levels.length, RAIL_LEVELS.length, `${id}/${s.id}`);
    if (s.rail === 'all') { assert.match(r!.cls, /\ball\b/); assert.equal(r!.levels.filter((l) => l.on).length, 0); } else {
      const known = RAIL_LEVELS.some(([k]) => k === s.site);
      assert.equal(r!.levels.filter((l) => l.on).length, known ? 1 : 0, `${id}/${s.id}`);
      if (known) assert.match(r!.label, new RegExp(SITE_TAGS[s.site!]!));
    }
    assert.equal(cardFields(undefined, s, s, 0, 1).rail?.levels.length, 6);
    assert.equal(cardFields(undefined, s, s, 0, 2).rail, null, 'the rail stands on the last page');
  }
  assert.ok(n >= 7, `rail slides (${n})`);
});

test('the words under the line: guidelines side by side, source, caution and causes are printed on the card\'s last page', () => {
  const seen = { sides: 0, cite: 0, caveat: 0, causes: 0 };
  for (const { id, s, c } of everySlide()) {
    const f = cardFields(undefined, s, s, 0, 1), early = cardFields(undefined, s, s, 0, 2);
    if (c.sides) { assert.equal(f.sides.length, 2, `${id}/${s.id}`); assert.equal(early.sides.length, 0); seen.sides++; }
    if (c.cite) { assert.ok(f.cite && f.cite.length > 4, `${id}/${s.id}`); assert.ok(!/Baveno VII(?!I)/.test(f.cite!), `${id}/${s.id}: never Baveno VII`); assert.equal(early.cite, null); seen.cite++; }
    if (c.caveat) { assert.equal(f.caveat, c.caveat); seen.caveat++; }
    if (Array.isArray(c.causes) && c.causes.length) { assert.ok(f.causes!.list.startsWith(String((c.causes as unknown as string[])[0]))); assert.equal(f.causes!.head, c.causesHead || 'Causes'); seen.causes++; }
  }
  assert.ok(seen.sides >= 1 && seen.cite >= 40 && seen.caveat >= 3 && seen.causes >= 4, JSON.stringify(seen));
  assert.equal(listCase(['Wilson disease', 'Cardiac disease', 'HIV']), 'Wilson disease, cardiac disease, HIV');
});

test('a source given as a list prints as one line', async () => {
  const lists = everySlide().filter(({ c }) => Array.isArray(c.cite));
  for (const { s, c } of lists) assert.equal(s.cite, (c.cite as unknown as string[]).join(' · '));
});

test('the line\'s one pill: a line with no braced value pills its first value with a unit; `pill: false` and a braced value leave none', () => {
  assert.equal(autoPill({ line: 'The gradient is 12 mmHg and falls to 8 mmHg.' }), '12 mmHg');
  assert.equal(autoPill({ line: 'The gradient is 12 mmHg.', pill: false }), null);
  assert.equal(autoPill({ line: 'The gradient is {hvpg} and the cut is 10 mmHg.' }), null);
  assert.equal(autoPill({ line: 'Step {#2} comes first, then 6 to 8 g per liter.' }), null, 'a step marker is no value, and g is no unit of the 2D rule');
  assert.equal(autoPill({ line: 'A varix ≥5 mm is large.' }), '≥5 mm');
  let off = 0;
  for (const { id, s } of everySlide()) if (s.pill === false) { assert.equal(autoPill(s), null, `${id}/${s.id}`); off++; }
  assert.ok(off >= 3, `pill: false slides (${off})`);
});

test('a step marker of the line ({#n}) is a step, not a typed number', () => {
  assert.deepEqual(parseLine('First {#1} then {#2}.').filter((p) => p.t === 'step'), [{ t: 'step', n: 1 }, { t: 'step', n: 2 }]);
  const withSteps = everySlide().filter(({ c }) => /\{#\d+\}/.test(c.line ?? ''));
  assert.ok(withSteps.length >= 2, 'the decks use step markers');
  for (const { c } of withSteps) assert.ok(parseLine(c.line ?? '').some((p) => p.t === 'step'));
});

test('a time-lapse\'s graph is its instrument card: a slide with a `graph` list has the flow-time or procedure chart (the copy gives it, 2D slide-instrument.js) and the data card mounts it', () => {
  const src = readFileSync(new URL('../src/ui/talk/ToolCardBody.tsx', import.meta.url), 'utf8');
  for (const k of ['flowtime', 'evgraph']) assert.match(src, new RegExp(`case '${k}'`));
  const graphs = everySlide().filter(({ c }) => Array.isArray(c.graph));
  assert.ok(graphs.length >= 4, `slides that name their graph (${graphs.length})`);
  for (const { id, s, c } of graphs) {
    assert.ok(['flowtime', 'evgraph'].includes((c.tool as { kind: string } | undefined)?.kind ?? ''), `${id}/${s.id}: the graph is an instrument`);
    assert.equal(s.tool?.kind, (c.tool as { kind: string }).kind, `${id}/${s.id}: the Slide carries it`);
    assert.ok(!s.visual, 'no graph on a visual');
  }
  // `graph: false` turns it off
  for (const { id, s, c } of everySlide()) if (c.graph === false) assert.ok(!['flowtime', 'evgraph'].includes(s.tool?.kind ?? ''), `${id}/${s.id}`);
});

test('the plane visual hands each slide\'s own plane (a name, or a base with its own axis and iso lines) to the chart, which knows it', () => {
  let n = 0;
  for (const { id, s, c } of everySlide()) {
    if (c.plane == null) continue;
    n++;
    const def = planeOf(c.plane as never);
    assert.ok(def, `${id}/${s.id}: plane ${JSON.stringify(c.plane)}`);
    if (typeof c.plane === 'object') for (const k of Object.keys(c.plane)) if (k !== 'base') assert.ok(k in def!, `${id}/${s.id}: the plane's own ${k} reaches the definition`);
  }
  assert.ok(n >= 9, `planes (${n})`);
  const src = readFileSync(new URL('../src/ui/talk/ToolCardBody.tsx', import.meta.url), 'utf8');
  assert.match(src, /plane=\{cs\.plane as never\}/);
});

test('the two walls are drawn on the GPU as a frame of their own for each wall, with the words of 2D', () => {
  assert.ok(CHARTS.some((k) => k.kind === 'walls' && k.status === 'done'));
  const c = ctxOf('light', 330);
  const gut = wallsFrame(false, c), sin = wallsFrame(true, c);
  assert.ok(sin.shapes.length > gut.shapes.length, 'the sinusoid has its plates, pores and bands');
  assert.ok(Math.abs(sin.h / sin.w - 276 / 600) < 1e-9);
  assert.match(WALLS_COPY.sin.c1, /Protein crosses/);
  assert.match(WALLS_COPY.gut.c1, /Protein retained/);
  const w = everySlide().filter(({ c }) => c.visual === 'walls');
  assert.equal(w.length, 1);
  assert.equal(w[0]!.s.visual, 'walls');
});

test('compare buttons: each says what it does; a button that switches the patient brings its words and days', () => {
  let kinds = new Set<string>(), words = 0;
  for (const { id, s, c } of everySlide()) {
    const opts = s.controls?.compare?.opts;
    if (!opts || c.response === true) continue;
    opts.forEach((o) => { assert.ok(['lens', 'state', 'params'].includes(o.how), `${id}/${s.id}`); kinds.add(o.how); });
    const raw = c.compare as Record<string, unknown>[];
    raw.forEach((o, k) => {
      assert.equal(opts[k]!.how, howOf(raw as never, k));
      if (typeof o.title === 'string') { assert.equal(opts[k]!.title, o.title); words++; }
      if (typeof o.days === 'number') assert.equal(opts[k]!.days, o.days);
      if (typeof o.line === 'string') assert.equal(opts[k]!.line, o.line);
    });
  }
  assert.deepEqual([...kinds].sort(), ['lens', 'params', 'state']);
  assert.ok(words >= 2, `buttons that bring words (${words})`);
  const shunt = loaded.find((l) => l.id === 'budd-chiari')!.deck.slides.find((s) => s.id === 'shunt')!;
  const [tips, dips] = shunt.controls!.compare!.opts;
  assert.equal(tips!.how, 'state'); assert.equal(tips!.preset, 'budd-chiari'); assert.equal(tips!.days, 60); assert.deepEqual((tips!.params as { tips: { on: boolean } }).tips, { on: true });
  const w = variantWords(shunt, tips!);
  assert.equal(w.title, shunt.title, 'a button never brings a title (owner, 27 Nov, L7)'); assert.match(w.line, /\{pv\}/);
  assert.deepEqual(variantWords(shunt, dips!), { title: shunt.title, line: shunt.line, kicker: shunt.kicker, ...(shunt.site ? { site: shunt.site } : {}) }, 'the slide\'s own button puts the slide\'s words back');
  assert.ok(speaks(shunt.controls!.compare!.opts));
  // a time-point button brings the words of the slide it names
  const at = { title: 'Later', line: 'Eight weeks on.', kicker: 'k' };
  assert.equal(variantWords(shunt, { label: 'x', slide: 'y', how: 'state' }, at).title, shunt.title, 'the slide\'s own title, not the named slide\'s (L7)');
});

test('beats: a slide with several camera beats is one stop of several views, the words and data staying', () => {
  const lob = loaded.find((l) => l.id === 'lobule')!.deck;
  const s = lob.slides.find((x) => x.id === 'lobule')!;
  assert.equal(s.beats?.length, 2);
  const stops = stopsOf(lob), at = stops.findIndex((x) => x.kind === 'slide' && x.slide === s);
  const st = stops[at] as { beats: number };
  assert.equal(st.beats, 3);
  const v0 = viewAt(stops, { stop: at, beat: 0 }), v1 = viewAt(stops, { stop: at, beat: 1 }), v2 = viewAt(stops, { stop: at, beat: 2 });
  assert.equal(v0.slide, s); assert.equal(v1.slide, s); assert.equal(v1.words, 'teach'); assert.equal(v0.data, v1.data);
  assert.equal(v1.scene, s.beats![0]); assert.equal(v2.scene, s.beats![1]);
  assert.equal(v1.scene!.view, 'lobule'); assert.ok(v1.scene!.lobuleCam && v2.scene!.lobuleCam && v1.scene!.lobuleCam !== v2.scene!.lobuleCam, 'each beat has its own lobule camera');
  assert.notEqual(v1.shot, v0.shot);
  // Next walks the beats before the next slide; Back walks them the other way; a jump lands on the last view
  assert.deepEqual(next(stops, { stop: at, beat: 0 }), { stop: at, beat: 1 });
  assert.deepEqual(next(stops, { stop: at, beat: 2 }), { stop: at + 1, beat: 0 });
  assert.deepEqual(back(stops, { stop: at + 1, beat: 0 }), { stop: at, beat: 2 });
  assert.deepEqual(goto(stops, at), { stop: at, beat: 2 });
  // a slide with a case has its case first, then its views
  const withCase = everySlide().filter(({ s }) => s.beats?.length && s.vignette);
  for (const { deck, s } of withCase) { const ss = stopsOf(deck), a = ss.findIndex((x) => x.kind === 'slide' && x.slide === s); assert.equal((ss[a] as { beats: number }).beats, 1 + 1 + s.beats!.length); }
  const all = everySlide().filter(({ c }) => Array.isArray(c.beats) && c.beats.length);
  assert.ok(all.length >= 5);
  for (const { s, c } of all) assert.equal(s.beats!.length, (c.beats as unknown[]).length);
});

test('the response tile: the HVPG fall from the slide the field names, with the HVPG it counts from', () => {
  const spec = { deck: 'd', slide: 'b', keys: ['map'], key: ['hvpgFall'], delta: null, resp: 'a' as const };
  const rows = tileRows(spec, { hvpg: 8.4, map: 90 }, null, undefined, { hvpg: 12.6 });
  const fall = rows.find((r) => r.key === 'hvpgFall')!;
  assert.equal(fall.text, '33%'); assert.equal(fall.sub, 'from 12.6 mmHg'); assert.equal(fall.key_, true);
  assert.equal(tileRows(spec, { hvpg: 8.4 }, null, undefined, null).find((r) => r.key === 'hvpgFall')!.text, '—', 'no baseline, no number');
  assert.ok(tileRows({ ...spec, keys: ['map', 'hvpgFall'] }, { hvpg: 8.4 }, null, undefined, { hvpg: 12.6 }).filter((r) => r.key === 'hvpgFall').length === 1, 'listed once');
  const carv = loaded.find((l) => l.id === 'carvedilol')!.deck.slides.find((s) => s.id === 'start')!;
  assert.equal(carv.tiles?.resp, 'rise');
});

test('the intrahepatic resistance column of the summary table is the engine\'s rih', async () => {
  const { tableModel } = await import('../src/ui/talk/table-model.ts');
  const m = tableModel({ cols: ['pvFlow', 'res', 'ppg'], asc: false, of: [{ id: 'a' }] } as never, [{ spec: { id: 'a' }, i: 0, f: { rih: 3.2, ppg: 9, pvFlow: 1.1 }, title: 'A', kicker: '' }] as never, () => null);
  const cell = m.rows[0]!.cells.find((x) => x.k === 'res')!;
  assert.match(cell.text, /3\.2/);
});

test('a need counts as landed on the cards only with a file that prints it', () => {
  for (const [id, file] of Object.entries(CARD_LANDED)) {
    assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `${id}: ${file} is not there`);
  }
  // the markers the cards print, each in the file named
  const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  assert.match(src('src/ui/cards/TeachingCard.tsx'), /pz-sitetab/);
  assert.match(src('src/ui/cards/TeachingCard.tsx'), /pz-cite/);
  assert.match(src('src/ui/cards/TeachingCard.tsx'), /pz-sides/);
  assert.match(src('src/ui/cards/TeachingCard.tsx'), /pz-rail/);
  assert.match(src('src/ui/cards/TeachingCard.tsx'), /pz-causes/);
  assert.match(src('src/ui/cards/Line.tsx'), /pz-step/);
  assert.match(src('src/ui/cards/TableCard.tsx'), /noteHeads/);
  assert.match(src('src/ui/charts/small/AllPatientsCard.tsx'), /chartFoot/);
  assert.match(src('src/ui/cards/SlideControls.tsx'), /useVariant/);
  // the Circuit's bracket is the figure's (labels/figure-cards.ts), judged in tests/deck-spans.test.ts
  assert.ok('data:spans' in CARD_LANDED);
});

test('every slide of every deck is wired: each feature it needs is owned by the one readiness table and has landed', async () => {
  const waiting = new Set<string>();
  for (const id of SOURCE_IDS) for (const s of (await loadSource(id)).slides) { const r = readiness(s); for (const n of [...r.unowned, ...r.open.map((f) => f.id)]) waiting.add(`${id}/${s.id}: ${n}`); }
  assert.deepEqual([...waiting].sort(), [], 'a slide waits on a feature');
});
