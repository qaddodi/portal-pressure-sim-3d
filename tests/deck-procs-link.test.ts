// The talk's procedures, stents, layers, wash and blocked catheter: every slide of every deck that asks for one resolves to a procedure kind the layer plays (or one named open, with its reason), a vein the scene can stent, a
// layer the lobule has, and a catheter state the presenter draws. Node only: no scene is built (the layer's devices are held by the b5 tests); this holds the slide-to-scene mapping.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AG_IDS, loadAgDeck } from '../src/decks/ag/index.ts';
import { RW_IDS, RW_LOADERS } from '../src/decks/rw/copied/index.ts';
import { HP_IDS, loadHpDeck } from '../src/decks/hp/index.ts';
import type { CopiedDeck, CopiedSlide } from '../src/decks/hp/types.ts';
import { askOf, layersWant, legsOf, LAYER_KEYS, procPlanOf, specFor, stepsOfPlan, tipShot } from '../src/ui/deck/procs-plan.ts';
import { PROCEDURE_OPEN, PROCEDURE_PLAYS } from '../src/scene/procedures/plays.ts';
import { OSTIUM_U } from '../src/scene/procedures/ostium.ts';
import { route3d } from '../src/scene/procedures/route3d.ts';
import { canStent, VEIN_STENT_SPAN } from '../src/scene/devices/stent/vein-stent.ts';
import { CATHS } from '../src/decks/schema.ts';
import { catheterAt, stopsOf } from '../src/ui/deck/presenter-machine.ts';
import { toDeck } from '../src/decks/hp/deck.ts';
import { hookOf } from '../src/decks/ag/needs.ts';
import { CATH_END } from '../src/scene/procedures/copied/cath-arrival.js';

interface Row { deck: string; slide: CopiedSlide; i: number }
async function everySlide(): Promise<Row[]> {
  const rows: Row[] = [];
  const add = (d: CopiedDeck) => d.slides.forEach((slide, i) => rows.push({ deck: d.id, slide, i }));
  for (const id of AG_IDS) add((await loadAgDeck(id)) as never);
  for (const id of RW_IDS) add((await RW_LOADERS[id]!()) as never);
  for (const id of HP_IDS) add(await loadHpDeck(id));
  return rows;
}
const rows = await everySlide();
const asking = rows.filter((r) => ['procedure', 'stented', 'layers', 'cath', 'cathKeep', 'wash'].some((k) => r.slide[k] != null));

test('the decks have slides that ask for procedures, stents, layers, a wash and a catheter', () => {
  for (const k of ['procedure', 'stented', 'layers', 'cath', 'cathKeep', 'wash']) assert.ok(rows.some((r) => r.slide[k] != null), `no slide has "${k}"`);
});

test('every procedure of every slide resolves to a spec with steps, legs to its end, and a way to show it', () => {
  let n = 0;
  for (const r of rows) {
    const plan = procPlanOf(r.slide);
    if (!plan) continue;
    n++;
    const where = `${r.deck}/${r.slide.id}`, sp = specFor(plan.kind);
    assert.ok(sp, `${where}: no procedure spec "${plan.kind}"`);
    assert.ok(stepsOfPlan(plan).length > 0, `${where}: no steps`);
    const legs = legsOf(plan.kind);
    assert.ok(legs.length > 0 && legs[legs.length - 1]![1] === sp!.T.end, `${where}: the legs do not run to the end`);
    legs.forEach(([a, b], k) => { assert.ok(b > a, `${where}: leg ${k} is empty`); if (k) assert.equal(a, legs[k - 1]![1]); });
    if (plan.then) assert.ok(specFor(plan.then), `${where}: no reading "${plan.then}"`);
    // the base kind of the slide is what the readiness tables key on
    const base = typeof r.slide.procedure === 'string' ? r.slide.procedure : (r.slide.procedure as { kind: string }).kind;
    assert.ok(PROCEDURE_PLAYS.has(base) || base in PROCEDURE_OPEN, `${where}: "${base}" is neither playing nor named open`);
    // shown: a catheter on a route the scene lays, the scope (EUS-PPG), or a graft whose model change draws it
    if (PROCEDURE_PLAYS.has(base)) {
      const s = sp as unknown as { graft?: boolean; route?: string };
      if (plan.kind === 'eus' || plan.kind === 'eusglue') assert.ok(sp!.steps.every((st) => st[0] === 'pv' || st[0] === 'hv' || st[0]), `${where}: scope steps`);
      else if (s.graft && (sp as unknown as { morph?: boolean }).morph) assert.ok(sp!.can({}) === '' && !sp!.had({}), `${where}: a morph procedure's change is the engine's (the slide's own state), so it is never "had"`);
      else if (s.graft) assert.ok(sp!.had(sp!.apply({ tips: {}, dips: {} })), `${where}: the graft's model change`);
      else assert.ok(route3d(s.route || plan.kind), `${where}: no route for "${plan.kind}"`);
    }
  }
  assert.ok(n >= 20, `only ${n} procedure slides`);
});

test('a procedure takes the model\'s change and gives it back (a patient who has it has it taken back first)', () => {
  for (const r of rows) {
    const plan = procPlanOf(r.slide);
    const sp = plan && specFor(plan.kind);
    if (!sp) continue;
    const p0 = { occluded: {}, tips: { on: false } } as Record<string, unknown>;
    if (sp.had(p0)) continue;
    const after = sp.apply(structuredClone(p0));
    if (sp.had(after)) assert.equal(sp.had(sp.undo(structuredClone(after))), false, `${r.deck}/${r.slide.id}: undo`);
  }
});

test('the kinds named open say why, and the readiness tables follow the list (the glue scope has landed: nothing is open)', () => {
  assert.ok(PROCEDURE_PLAYS.has('eusglue') && !('eusglue' in PROCEDURE_OPEN));
  for (const [k, why] of Object.entries(PROCEDURE_OPEN)) { assert.ok(why.length > 20); assert.equal(hookOf(`procedure:${k}`)!.landed(), false, k); }
  for (const k of PROCEDURE_PLAYS) assert.equal(hookOf(`procedure:${k}`)!.landed(), true, k);
});

test('every stented vein is one the scene can stent, and the stent covers the vein\'s middle', () => {
  const ids = asking.flatMap((r) => askOf(r.slide).stented);
  assert.ok(ids.length >= 2);
  for (const id of ids) assert.ok(canStent(id), `no vein ${id}`);
  assert.deepEqual([...VEIN_STENT_SPAN], [0.25, 0.75]);
});

test('every layer a slide names is one the lobule has; zones are off unless a slide names them, the viewer\'s others are kept', () => {
  const viewer = { lymph: true, zones: false, bile: false };
  const named = new Set(asking.flatMap((r) => askOf(r.slide).layers));
  assert.ok(named.has('zones') && named.has('lymph'));
  for (const k of named) assert.ok((LAYER_KEYS as readonly string[]).includes(k), k);
  assert.deepEqual(layersWant(viewer, { layers: ['zones'] }), { lymph: true, zones: true, bile: false });
  assert.deepEqual(layersWant({ lymph: false, zones: true, bile: true }, {}), { lymph: false, zones: false, bile: true });
  assert.deepEqual(layersWant({ ...viewer, lymph: false }, { layers: ['lymph'] }), { lymph: true, zones: false, bile: false });
});

test('a wash slide is in the lobule or the sinusoid (where the wash is drawn)', () => {
  const w = asking.filter((r) => askOf(r.slide).wash);
  assert.ok(w.length >= 1);
  for (const r of w) assert.match(String(r.slide.cam ?? ''), /lobule|sinusoid/, `${r.deck}/${r.slide.id}`);
});

test('every catheter state is one the presenter draws; blocked stops at the ostium, with its ring', async () => {
  for (const r of asking) { const c = r.slide.cath; if (c) assert.ok((CATHS as readonly string[]).includes(c), `${r.deck}/${r.slide.id}: ${c}`); }
  assert.ok(asking.some((r) => r.slide.cath === 'blocked'));
  const deck = toDeck(await loadHpDeck('hvpg'));
  const stops = stopsOf(deck), at = (id: string) => { const k = stops.findIndex((s) => s.kind === 'slide' && s.slide.id === id); return { stop: k, beat: stops[k]!.kind === 'slide' && (stops[k] as { beats: number }).beats > 1 ? 1 : 0 }; };
  assert.deepEqual(catheterAt(stops, at('bc')), { advance: OSTIUM_U, balloon: 0 });
  // cathKeep: the slide between the wedge and the HVPG keeps the wedged catheter, balloon up
  assert.deepEqual(catheterAt(stops, at('wedge-sinusoid')), { advance: 1, balloon: 1 });
  assert.equal(CATH_END.blocked.ring, 'bad');
  assert.equal(CATH_END.free.ring, 'free');
});

test('OSTIUM_U is where the 2D tip stops: two figure units before the hepatic vein begins', () => {
  const r = route3d('hvpg')!.route;
  assert.ok(Math.abs((r.hv0 - 2 - r.start) / (r.free - r.start) - OSTIUM_U) < 0.0005);
});

test('the camera follows the tip on the way in and at the work, and not for a step with no shot', () => {
  const at = { x: 0.1, y: 0.2, z: -0.1 };
  const way = tipShot('way', at)!, tip = tipShot('tip', at)!;
  assert.deepEqual(way.target, [0.1, 0.2, -0.1]);
  assert.ok(way.r > tip.r && way.half[0] > tip.half[0]);
  assert.equal(tipShot('', at), null);
});

// Capture 52ef8e63, TIPS complete 3: a slide that asks when to place a stent draws the stent as a ghost; no other slide does.
test('only the indications slide asks for a ghost stent', async () => {
  const rows = await everySlide();
  const ghosts = rows.filter((r) => askOf(r.slide).ghostStent).map((r) => `${r.deck}/${r.slide.id}`);
  assert.deepEqual(ghosts, ['tips-complete/indications']);
});
