// The slide to instrument and chart hookup (ui/talk/ToolCard.tsx): every tool kind and every option of a tool that any copied 2D slide uses is handled, derived from the decks, pure (no browser).
// A new kind or option in a 2D deck fails here until ToolCard (through ui/talk/instruments.ts and the chart registry) carries it, and a readiness flag is held to the evidence that backs it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { AG_IDS, loadAgDeck } from '../src/decks/ag/index.ts';
import { HP_IDS, loadHpDeck } from '../src/decks/hp/index.ts';
import { RW_IDS, RW_LOADERS } from '../src/decks/rw/copied/index.ts';
import type { CopiedSlide } from '../src/decks/hp/types.ts';
import { CHART_TOOLS, INSTRUMENT_TOOLS, hasToolChart } from '../src/decks/charts.ts';
import { CHARTS } from '../src/ui/charts/registry.ts';
import { INSTRUMENTS, instrumentOf, planOf, unhandledOptions } from '../src/ui/talk/instruments.ts';
import { toolEvidence, toolLanded } from '../src/ui/talk/tool-landed.ts';
import { controlsOf } from '../src/decks/controls.ts';
import { readingPlan } from '../src/ui/talk/reading-plan.ts';
import { stepsOf, levelsOf, STEP_T, HVPG_STEPS } from '../src/ui/talk/hvpg-plan.ts';
import { withPatch } from '../src/ui/talk/tool-options.ts';
import { PROBES } from '../src/ui/tests/doppler/copied/doppler-tables.copied.js';
import { hookOf, needsOf } from '../src/decks/ag/needs.ts';
import { registerBuiltinHooks } from '../src/decks/rw/hooks-builtin.ts';
import { hasHook } from '../src/decks/rw/hooks.ts';
import { FEATURES } from '../src/decks/hp/hooks.ts';

type Rec = Record<string, unknown>;
const rec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);

const DECKS: { id: string; slides: CopiedSlide[] }[] = [];
for (const id of AG_IDS) DECKS.push({ id, slides: (await loadAgDeck(id)).slides as CopiedSlide[] });
for (const id of HP_IDS) DECKS.push({ id, slides: (await loadHpDeck(id)).slides as CopiedSlide[] });
for (const id of RW_IDS) DECKS.push({ id, slides: (await RW_LOADERS[id]!()).slides as CopiedSlide[] });
const SLIDES = DECKS.flatMap((d) => d.slides.map((s) => ({ at: `${d.id}/${s.id}`, s })));
const TOOLS = SLIDES.filter((x) => rec(x.s.tool)).map((x) => ({ at: x.at, s: x.s, tool: x.s.tool as Rec, kind: String((x.s.tool as Rec).kind) }));

const SOURCE = readFileSync(new URL('../src/ui/talk/ToolCard.tsx', import.meta.url), 'utf8');

test('the decks carry the whole set of slides, and a good share of them put a tool in the data card', () => {
  assert.ok(SLIDES.length >= 508, `slides (${SLIDES.length})`);
  assert.ok(TOOLS.length >= 300, `tool slides (${TOOLS.length})`);
});

test('every tool kind a slide uses is one the data card draws, and ToolCard has a case for it', () => {
  const kinds = [...new Set(TOOLS.map((t) => t.kind))].sort();
  for (const k of kinds) {
    assert.ok(([...CHART_TOOLS, ...INSTRUMENT_TOOLS] as string[]).includes(k), `tool kind "${k}" is neither a chart nor an instrument of the data card`);
    assert.match(SOURCE, new RegExp(`case '${k}'`), `ToolCard.tsx has no case for "${k}"`);
  }
  for (const t of TOOLS) assert.ok(hasToolChart({ tool: { kind: t.kind } } as never), `${t.at}: the card would not mount`);
});

test('every instrument kind has one entry and every one of the data card\'s instrument kinds is listed', () => {
  assert.deepEqual(INSTRUMENTS.map((e) => e.kind).sort(), [...INSTRUMENT_TOOLS].sort());
  for (const e of INSTRUMENTS) {
    assert.ok(existsSync(new URL(`../${e.evidence}`, import.meta.url)), `${e.kind}: evidence file ${e.evidence} is missing`);
    if (e.status === 'partial') assert.ok(e.gap, `${e.kind}: a partial entry says what is missing`);
  }
});

test('every option of every instrument tool in the copied decks is read by the instrument (the audit of the 2D list)', () => {
  const bad: string[] = [];
  const seen = new Map<string, Set<string>>();
  for (const t of TOOLS) {
    if (!instrumentOf(t.kind)) continue;
    for (const k of unhandledOptions(t.tool)) bad.push(`${t.at}: ${t.kind}.${k}`);
    const set = seen.get(t.kind) ?? new Set<string>(); Object.keys(t.tool).forEach((k) => k !== 'kind' && set.add(k)); seen.set(t.kind, set);
  }
  assert.deepEqual(bad, []);
  // (the 2D decks use these options: if one stopped being used, the table can drop it)
  for (const k of ['vessel', 'gate', 'mode', 'waves', 'pair', 'calipers', 'probe', 'points', 'scale', 'delta', 'title']) assert.ok(seen.get('doppler')!.has(k), `doppler.${k} is used by a slide`);
  for (const k of ['open', 'readings', 'air']) assert.ok(seen.get('scope')!.has(k), `scope.${k} is used by a slide`);
  assert.ok(seen.get('fibroscan')!.has('organ') && seen.get('hvpg')!.has('catheter'));
});

test('a Doppler slide names a vessel the pane samples, and its plan puts the probe on the figure unless the scope is the probe', () => {
  const ids = new Set((PROBES as { id: string }[]).map((p) => p.id));
  let scope = 0, points = 0, gated = 0;
  for (const t of TOOLS.filter((x) => x.kind === 'doppler')) {
    const plan = planOf('doppler', t.tool).doppler!;
    assert.ok(ids.has(plan.vessel), `${t.at}: the Doppler has no vessel ${plan.vessel}`);
    assert.equal(plan.figure, t.tool.probe !== 'scope');
    if (!plan.figure) scope++;
    if (plan.points) { points++; assert.equal(plan.vessel, 'TIPS', `${t.at}: points belong to a stent`); }
    if (plan.gate) { gated++; assert.ok(['proximal', 'mid', 'distal', 'site'].includes(plan.gate), `${t.at}: gate ${plan.gate}`); }
  }
  assert.ok(scope >= 1 && points >= 4 && gated >= 4, `scope ${scope}, points ${points}, gated ${gated}`);
  assert.deepEqual(planOf('doppler', {}).doppler, { vessel: 'PV_TRUNK', gate: null, figure: true, points: false }, 'no vessel named: the main portal vein, as 2D');
});

test('FibroScan stands over the organ the slide names, the scope is drawn down the esophagus, the wall is the scope pane\'s second view', () => {
  assert.equal(planOf('fibroscan', { organ: 'spleen' }).organ, 'spleen');
  assert.equal(planOf('fibroscan', {}).organ, 'liver');
  assert.equal(planOf('scope', {}).scope, true);
  assert.equal(planOf('wall', {}).view, 'wall');
  assert.equal(planOf('abdomen', {}).doppler, undefined);
});

test('the compare buttons and sliders that move an instrument are carried, and what they move is an option of that slide\'s instrument', () => {
  let gates = 0, tools = 0, sliders = 0;
  for (const t of SLIDES) {
    const c = controlsOf(t.s);
    const list = Array.isArray(t.s.compare) ? (t.s.compare as Rec[]) : [];
    if (list.some((o) => 'gate' in o || 'tool' in o)) {
      assert.ok(c?.compare, `${t.at}: a compare that moves an instrument has buttons`);
      assert.equal(c!.compare!.opts.length, list.length);
      assert.equal(String((t.s.tool as Rec | undefined)?.kind), String((t.s.tool as Rec | undefined)?.kind));
      for (const o of c!.compare!.opts) {
        if (o.gate) { gates++; assert.equal((t.s.tool as Rec).kind, 'doppler', `${t.at}: a gate button needs the Doppler`); assert.ok(['proximal', 'mid', 'distal', 'site'].includes(o.gate)); }
        if (o.tool) { tools++; const e = instrumentOf((t.s.tool as Rec).kind); assert.ok(e, `${t.at}: a tool button needs an instrument`); for (const k of Object.keys(o.tool)) assert.ok(e!.options.includes(k), `${t.at}: tool button moves ${k}, which ${e!.kind} does not read`); }
      }
      assert.ok(c!.compare!.opts.some((o) => o.own), `${t.at}: one button is the slide's own`);
    }
    if (rec(t.s.whatIf) && typeof t.s.whatIf.tool === 'string') {
      sliders++;
      const e = instrumentOf((t.s.tool as Rec).kind);
      assert.ok(e!.options.includes(t.s.whatIf.tool), `${t.at}: the slider moves ${t.s.whatIf.tool}`);
      assert.equal(c!.whatIf!.tool, t.s.whatIf.tool); assert.deepEqual(c!.whatIf!.paths, []);
    }
  }
  assert.ok(gates >= 3 && tools >= 3 && sliders >= 2, `gates ${gates}, tool buttons ${tools}, sliders ${sliders}`);
});

test('a button\'s patch lies over its own slide\'s options only, and the slide\'s own button puts them back', () => {
  const tool = { kind: 'scope', air: 10 };
  assert.deepEqual(withPatch(tool, 'a/b', { key: 'a/b', patch: { air: 3 } }), { kind: 'scope', air: 3 });
  assert.equal(withPatch(tool, 'a/b', { key: 'a/c', patch: { air: 3 } }), tool, 'another slide\'s patch is not this one\'s');
  assert.equal(withPatch(tool, 'a/b', { key: 'a/b', patch: {} }), tool, 'an empty patch is the slide\'s own');
});

test('a measurement card follows a script for every procedure a reading slide names, and the HVPG card follows the catheter\'s step', () => {
  const readings = TOOLS.filter((t) => t.kind === 'reading');
  assert.ok(readings.length >= 10);
  const ids = new Set<string>();
  for (const t of readings) {
    const { script, title } = readingPlan(t.s.procedure, t.tool.of);
    assert.ok(script, `${t.at}: no script for the procedure ${JSON.stringify(t.s.procedure)}`);
    assert.ok(script!.kinds.length >= 1 && typeof title === 'string');
    ids.add(script!.id);
  }
  assert.deepEqual([...ids].sort(), ['eus', 'hvpg', 'ppg', 'tips'], 'every measuring procedure of 2D has a card');
  for (const t of TOOLS.filter((x) => x.kind === 'hvpg')) {
    const step = stepsOf(t.tool, t.s.cath);
    if (t.tool.catheter) assert.ok(step, `${t.at}: a catheter card sits on a slide whose catheter is free, wedge or result (${String(t.s.cath)})`);
    else assert.equal(step, null);
  }
  assert.ok(STEP_T.free < STEP_T.wedge && STEP_T.wedge < STEP_T.result, 'the readings are taken in order');
  assert.deepEqual(HVPG_STEPS, ['free', 'wedge', 'result']);
  assert.deepEqual(levelsOf({ fhvp: 8, whvp: 20.04, hvpg: 12 }), { fhvp: 8, whvp: 20.04, hvpg: 12 });
  assert.equal(levelsOf({ fhvp: 8 }), null);
});

test('the treatment menu is offered to every menu slide: each slide\'s `rows` name treatments the menu has', async () => {
  const { MENU_IDS, menuOptions } = await import('../src/ui/charts/menu/model.ts');
  for (const t of TOOLS.filter((x) => x.kind === 'menu')) {
    if (Array.isArray(t.tool.rows)) for (const r of t.tool.rows) assert.ok(MENU_IDS.includes(String(r)), `${t.at}: unknown treatment ${String(r)}`);
    assert.ok(menuOptions({}, t.tool.rows).length > 0, `${t.at}: nothing offered to a plain patient`);
  }
  assert.ok(TOOLS.some((t) => t.kind === 'menu'));
});

test('a tool kind is landed only with evidence: a chart the registry calls done, or an instrument whose entry says it plays; the file exists', () => {
  for (const k of new Set(TOOLS.map((t) => t.kind))) {
    const ev = toolEvidence(k);
    assert.equal(toolLanded(k), ev != null);
    if (ev) assert.ok(existsSync(new URL(`../${ev}`, import.meta.url)), `${k}: evidence ${ev} is missing`);
    const chart = CHARTS.some((c) => c.kind === (k === 'course' ? 'curve' : k) && c.status === 'done');
    const inst = instrumentOf(k)?.status === 'plays';
    assert.equal(toolLanded(k), chart || inst, `${k}: landed ${toolLanded(k)}, chart ${chart}, instrument ${inst}`);
  }
  assert.equal(toolLanded('wall'), false, 'Wall mechanics is not drawn in the 3D app: its slides keep waiting');
  assert.equal(toolLanded('menu'), true);
  assert.equal(toolLanded('course'), true);
});

test('the three readiness tables read the same answer for every tool kind', () => {
  registerBuiltinHooks();
  for (const k of new Set(TOOLS.map((t) => t.kind))) {
    const here = toolLanded(k);
    assert.equal(hookOf(`tool:${k}`)!.landed(), here, `ag tool:${k}`);
    assert.equal(hasHook(`tool:${k}`), here, `rw tool:${k}`);
    const f = FEATURES.get(`tool:${k}`);
    if (f) assert.equal(f.landed, here, `hp tool:${k}`);
  }
  // the compare buttons that move an instrument are carried by ui/talk/controls-run.ts
  assert.equal(hookOf('compare:gate')!.landed(), true); assert.equal(hookOf('compare:tool')!.landed(), true);
  assert.equal(hasHook('compare:gate'), true); assert.equal(hasHook('compare:tool'), true);
  // every slide that names a tool has its need
  for (const t of TOOLS) assert.ok(needsOf(t.s as never).includes(`tool:${t.kind}`));
});

test('the hold-to-strain button is carried by every slide that asks for it, and its readiness flags are true', () => {
  const strained = SLIDES.filter((x) => x.s.strain);
  assert.ok(strained.length >= 1, 'a deck uses strain');
  for (const x of strained) {
    const c = controlsOf(x.s);
    assert.ok(c?.strain, `${x.at}: the strain button`);
    const v = x.s.strain as unknown;
    const want = rec(v) && typeof v.label === 'string' && v.label.trim() ? v.label.trim() : 'Hold to strain';
    assert.equal(c!.strain!.label, want, x.at);
  }
  for (const x of SLIDES.filter((y) => !y.s.strain)) assert.equal(controlsOf(x.s)?.strain, undefined, `${x.at}: no strain button`);
  assert.equal(hookOf('fig:strain')!.landed(), true);
  const evidence = readFileSync(new URL('../src/ui/cards/SlideControls.tsx', import.meta.url), 'utf8');
  assert.ok(/strainHold\(/.test(evidence), 'SlideControls drives strainHold');
});
