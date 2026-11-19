// The slide fields that draw on the figure (glow, marks, callout, sites, labels, tint, spot, steps, calipers, the lapse's glow, since ...) reach the scene: for every slide of every
// deck (A to G, H to P, R to W: the copied 2D decks) each field resolves to calls on a vessel, an organ or a place the figure has, and nothing it names is dropped silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { AG_IDS, loadAgDeck } from '../src/decks/ag/index.ts';
import { RW_IDS, RW_LOADERS } from '../src/decks/rw/copied/index.ts';
import { HP_IDS, loadHpDeck } from '../src/decks/hp/index.ts';
import type { CopiedDeck, CopiedSlide } from '../src/decks/hp/types.ts';
import { figurePlan, expandIds, termsInLine, EMPTY_PLAN } from '../src/ui/deck/figure-plan.ts';
import { figureCalls, clotWords, liveLabel, EMPTY_CALLS } from '../src/ui/deck/figure-calls.ts';
import { anchorPoint, placeCards, toneOf } from '../src/scene/labels/figure-cards.ts';
import { STATIONS, TERM_STATIONS, stationsOfTerms } from '../src/scene/labels/stations.ts';
import { ORGAN_STYLE } from '../src/scene/organs/layer.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { TARGETS_FIG, SETS_FIG } from '../src/scene/labels/figure2d.copied.ts';
import { missingStations, missingTerms } from '../src/decks/hp/hooks.ts';

const decks: CopiedDeck[] = [];
for (const id of AG_IDS) decks.push((await loadAgDeck(id)) as unknown as CopiedDeck);
for (const id of RW_IDS) decks.push((await RW_LOADERS[id]!()) as unknown as CopiedDeck);
for (const id of HP_IDS) decks.push(await loadHpDeck(id));
const slides: { id: string; s: CopiedSlide }[] = decks.flatMap((d) => d.slides.map((s) => ({ id: `${d.id}/${s.id}`, s })));

// the numbers a slide's cards read (the slide's state is the engine's: here, plain numbers, so node judges the calls)
const FP = { pv: 12.3, ivc: 6.1, ra: 4.2, shunt: 0.3, spleen: 14.8, varix: 5.2, asc: 3.1, at: { D: new Float32Array(400).fill(8) } };
const reads = { fp: FP as never, params: { thrombus: new Proxy({}, { get: () => 1 }) as Record<string, number>, tips: { on: true, d: 8 }, dips: { on: true, d: 10 } }, pressure: () => 9.1, indexOf: () => 1 };
const lobule = (_n: string, out: Vector3) => out.set(0, 0, 0);

test('there are the 42 decks and their slides', () => { assert.equal(decks.length, 42); assert.ok(slides.length >= 508); });

test('every slide of every deck: each figure field it uses resolves, nothing it names is left unplaced', () => {
  for (const { id, s } of slides) {
    const p = figurePlan(s);
    assert.deepEqual(p.unresolved, [], `${id}: ${p.unresolved.join('; ')}`);
    for (const st of p.labels) assert.ok(STATIONS.some((x) => x.id === st), `${id}: station ${st}`);
    for (const st of Object.keys(p.tones)) assert.ok(STATIONS.some((x) => x.id === st), `${id}: toned station ${st}`);
    const c = figureCalls(p, reads);
    for (const g of c.named) assert.ok(NETWORK_BY_ID.has(g.id), `${id}: named vessel ${g.id}`);
    for (const o of c.pins) assert.ok(o in ORGAN_STYLE, `${id}: organ ${o}`);
    for (const e of c.marked) assert.ok(NETWORK_BY_ID.has(e), `${id}: standing-out vessel ${e}`);
    const ids = new Set<string>();
    for (const k of c.cards) {
      assert.ok(!ids.has(k.id), `${id}: card ${k.id} twice`); ids.add(k.id);
      assert.ok(anchorPoint(k.anchor, new Vector3(), lobule), `${id}: card ${k.id} points at nothing the figure has (${JSON.stringify(k.anchor)})`);
      assert.ok(k.text.length > 0, `${id}: card ${k.id} has no words`);
      assert.ok(toneOf(k.tone).attr, `${id}: card ${k.id} tone`);
    }
    for (const k of c.calipers) { assert.ok(k.text.length > 0); if ('across' in k.line) assert.ok(NETWORK_BY_ID.has(k.line.across), `${id}: caliper across ${k.line.across}`); }
  }
});

const has = (s: CopiedSlide, f: string) => s[f] != null && !(Array.isArray(s[f]) && (s[f] as unknown[]).length === 0);

test('each field lands as scene calls: the ones that draw something draw it, the ones 2D draws nothing for say so', () => {
  const seen: Record<string, number> = {};
  const bump = (k: string) => { seen[k] = (seen[k] ?? 0) + 1; };
  for (const { id, s } of slides) {
    const p = figurePlan(s), c = figureCalls(p, reads);
    if (has(s, 'labels')) { bump('labels'); for (const l of s.labels as string[]) assert.ok(p.labels.includes(l), `${id}: label ${l} not shown`); }
    if (has(s, 'tint')) { bump('tint'); for (const k of s.tint as string[]) assert.ok(p.tones[TARGETS_FIG[k]!.node!], `${id}: tint ${k} has no colour`); }
    if (has(s, 'glow')) { bump('glow'); assert.ok(c.named.length || c.pins.length || p.res.length || p.lit.length, `${id}: glow lights nothing`); }
    if (has(s, 'glowSeq')) { bump('glowSeq'); assert.ok(c.named.some((g) => g.at > 0) || (s.glow as unknown[]).length < 2 || !c.named.length, `${id}: glowSeq steps are not spaced`); }
    if (has(s, 'steps')) { bump('steps'); assert.ok(c.cards.some((k) => k.kind === 'step'), `${id}: steps draws no numbers`); }
    if (has(s, 'lapseGlow')) { bump('lapseGlow'); assert.ok(c.pins.length, `${id}: lapseGlow outlines nothing`); }
    if (has(s, 'spot')) { bump('spot'); assert.ok(c.marked.length || c.pins.length, `${id}: spot stands nothing out`); }
    if (has(s, 'normalOutline')) { bump('normalOutline'); assert.ok(c.normalSpleen, `${id}`); }
    if (has(s, 'ripple')) { bump('ripple'); assert.ok(c.notDrawn.some((x) => x.startsWith('ripple')), `${id}: ripple is accounted for`); }
    if (has(s, 'mark') || has(s, 'marks')) { bump('mark'); assert.ok(c.cards.some((k) => k.kind === 'mark') || p.marks.length === 0 || c.notDrawn.length, `${id}: marks draw nothing`); }
    if (has(s, 'callout')) { bump('callout'); assert.ok(c.cards.some((k) => k.id === 'callout'), `${id}: callout draws no card`); }
    if (has(s, 'sites')) {
      bump('sites');
      for (const k of s.sites as string[]) {
        const shown = c.cards.some((x) => x.id === `site:${k}`) || c.res.some((r) => r === k) || p.labels.length > 0;
        assert.ok(shown, `${id}: site ${k} shows nowhere`);
      }
    }
    if (has(s, 'calipers')) { bump('calipers'); assert.equal(c.calipers.length, new Set(s.calipers as string[]).size, `${id}: a caliper is lost`); }
    if (s.lens === 'since') { bump('since'); assert.ok(p.since, id); }
  }
  // (the survey: each field is on some slides; if the copy changes, this says so)
  for (const f of ['labels', 'tint', 'glow', 'glowSeq', 'steps', 'lapseGlow', 'spot', 'normalOutline', 'ripple', 'mark', 'callout', 'sites', 'calipers', 'since']) assert.ok(seen[f]! > 0, `no slide uses ${f}`);
});

test('a slide that lights nothing draws nothing: the plan of a slide with no figure field is empty, so a slide change starts from nothing', () => {
  const bare = slides.find(({ s }) => !s.glow && !s.mark && !s.marks && !s.callout && !s.sites && !s.labels && !s.terms && !s.calipers && !s.spot && !s.line.includes(']('))!;
  const p = figurePlan(bare.s);
  assert.deepEqual({ ...p, unresolved: [] }, { ...EMPTY_PLAN });
  assert.deepEqual(figureCalls(p, reads), EMPTY_CALLS);
});

test('the words of the line decide which terms light: a term the line does not say lights nothing; a [link] does', () => {
  const s = { id: 'x', line: 'The portal vein and the {pv} reading.', terms: { 'portal vein': 'pv', 'right atrium': 'ra' } } as unknown as CopiedSlide;
  assert.deepEqual(termsInLine(s), ['pv']);
  assert.deepEqual(figurePlan(s).labels, ['CONF']);
  assert.equal(figurePlan(s).tones.CONF, 'pv');
  const t = { id: 'y', line: 'See the [fundal varices](gv).', terms: [] } as unknown as CopiedSlide;
  assert.deepEqual(figurePlan(t).labels, ['GV']);
  assert.ok(STATIONS.some((x) => x.id === 'GV'), 'the fundal varices have a station');
});

test('a named set stands for its vessels, an organ in the glow is outlined, a list is one step', () => {
  assert.deepEqual(expandIds(['@hepatic-veins', 'PV_TRUNK']), [...SETS_FIG['hepatic-veins']!, 'PV_TRUNK']);
  const s = { id: 'z', line: '', glow: [['V_INT', 'V_SPL'], 'liver'], glowSeq: 500, steps: true } as unknown as CopiedSlide;
  const p = figurePlan(s);
  assert.deepEqual(p.glow.map((g) => [g.id, g.at]), [['V_INT', 0], ['V_SPL', 0]]);
  assert.deepEqual(p.organs.map((o) => o.id), ['liver']);
  assert.deepEqual(p.steps?.map((x) => [x.n, x.at, x.group]), [[1, 0, true], [2, 500, false]]);
  assert.equal(figureCalls(p, reads).cards.filter((k) => k.kind === 'step').length, 2);
});

test('a note mark is a pointer: its vessel glows in its colour, and goes where a station label already names it', () => {
  const note = { id: 'n', line: '', mark: { edges: ['C6'], label: 'Splenorenal shunt', kind: 'note' } } as unknown as CopiedSlide;
  assert.deepEqual(figurePlan(note).glow.map((g) => g.id), ['C6']);
  assert.equal(figurePlan(note).marks.length, 1);
  const named = { id: 'n', line: '', labels: ['CONF'], mark: { edges: ['PV_TRUNK'], label: 'Portal vein, near stasis', kind: 'note' } } as unknown as CopiedSlide;
  assert.equal(figurePlan(named).marks.length, 0, 'the label already names it');
});

test('a mark with a live word carries the reading; a clot mark follows the clot; 0 % is no mark', () => {
  assert.equal(liveLabel('Ascites {asc}', FP as never).startsWith('Ascites '), true);
  assert.ok(!/\{asc\}/.test(liveLabel('Ascites {asc}', FP as never)));
  assert.equal(liveLabel('Plain {nonsense}', FP as never), 'Plain {nonsense}');
  assert.equal(clotWords(1), 'Occlusive thrombus'); assert.equal(clotWords(0.4), 'Nonocclusive thrombus'); assert.equal(clotWords(0), null);
  const clot = { id: 'c', line: '', mark: { edges: ['PV_TRUNK'], clot: true } } as unknown as CopiedSlide;
  assert.equal(figureCalls(figurePlan(clot), reads).cards[0]!.text, 'Occlusive thrombus');
  assert.equal(figureCalls(figurePlan(clot), { ...reads, params: { thrombus: { PV_TRUNK: 0 } } }).cards.length, 0);
});

test('the sites: a reading on a station, the portal blood split, the resistors go to the Circuit; a station the label names is not called out twice', () => {
  const s = { id: 's', line: '', sites: ['pv', 'ra', 'split', 'rLiver'], labels: ['RA'] } as unknown as CopiedSlide;
  const p = figurePlan(s), c = figureCalls(p, reads);
  assert.deepEqual(p.sites.sort(), ['pv', 'rLiver', 'split']);
  assert.ok(c.cards.some((k) => k.id === 'site:pv' && k.value === '12.3'));
  assert.ok(c.cards.some((k) => k.kind === 'split' && k.split!.shunt === 30 && k.split!.liver === 70));
  assert.ok(!c.cards.some((k) => k.id === 'site:ra'));
  assert.deepEqual(c.res, ['rLiver']);
});

test('the calipers: the spleen along its axis, a varix across its vessel, a stent by its set diameter', () => {
  const c = figureCalls(figurePlan({ id: 'k', line: '', calipers: ['spleen', 'varix', 'TIPS'] } as unknown as CopiedSlide), reads);
  assert.deepEqual(c.calipers.map((k) => k.id), ['spleen', 'varix', 'TIPS']);
  assert.ok('ends' in c.calipers[0]!.line);
  assert.deepEqual(c.calipers[1]!.line, { across: 'C1a' });
  assert.equal(c.calipers[2]!.text, '8 mm');
});

test('the figure\'s names: every term the decks use is answered, none is missing (the readiness gate reads the same tables)', () => {
  for (const { id, s } of slides) { assert.deepEqual(missingStations(s), [], id); assert.deepEqual(missingTerms(s), [], id); }
  assert.deepEqual([...stationsOfTerms(['varix', 'gv', 'lpv', 'lrv', 'azy', 'lgv', 'sin'])].sort(), ['AZY', 'GV', 'LGV', 'LPV', 'LRV', 'SIN_R', 'VAR']);
  for (const [t, ids] of Object.entries(TERM_STATIONS)) for (const st of ids) assert.ok(STATIONS.some((x) => x.id === st), `${t}: ${st}`);
});

test('the cards are placed in the view, clear of the cards and of one another, each pointing at its point', () => {
  const view = { x0: 0, y0: 40, x1: 800, y1: 600 };
  const blockers = [{ x0: 0, y0: 40, x1: 200, y1: 600 }];
  const items = [{ id: 'a', x: 400, y: 300, w: 120, h: 40 }, { id: 'b', x: 410, y: 310, w: 120, h: 40 }, { id: 'c', x: 330, y: 100, w: 90, h: 40, below: true }, { id: 'd', x: 780, y: 200, w: 120, h: 40 }];
  const out = placeCards(items, view, blockers);
  assert.equal(out.length, 4);
  for (const o of out) { assert.ok(o.ok, o.id); assert.ok(o.x0 >= view.x0 && o.x0 + items.find((i) => i.id === o.id)!.w <= view.x1, `${o.id} in the view`); }
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
    const a = out[i]!.box, b = out[j]!.box;
    assert.ok(!(a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0), `${out[i]!.id} and ${out[j]!.id} overlap`);
  }
  for (const o of out) assert.ok(!(o.box.x0 < 200 && o.box.x1 > 0 && o.box.y0 < 600 && o.box.y1 > 40), `${o.id} keeps off the card`);
});
