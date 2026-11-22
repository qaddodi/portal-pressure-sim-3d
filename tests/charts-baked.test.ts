// Plan 33: every chart opens with its data. The data of every deck is worked out at build time (scripts/bake-charts.mjs); these tests read the files it wrote (node scripts/bake-charts.mjs makes them) and prove that
// a chart's data comes back on the spot with the engine never answering, that it is the number the live sweep gives, and that another engine or another deck's words can never be served stale numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allCopiedDecks, nodeEngine } from '../src/ui/charts/baked/make.ts';
import { bakedById, bakedCurve, bakedHealthy, forgetBaked, setBaked, trustBaked, type BakedDeck } from '../src/ui/charts/baked/store.ts';
import { deckSig, engineKey } from '../src/ui/charts/baked/key.ts';
import { mergeStates } from '../src/ui/charts/baked/view.ts';
import { curveKey, curveWork, courseWork, goalOf } from '../src/ui/charts/curve/data.ts';
import { bakedSeries, cohortSeries, hasCohort } from '../src/ui/charts/small/data.ts';
import { bakedLadders, ladderData } from '../src/ui/charts/ladder/data.ts';
import { patientFp, planeRows, pointsSync, patientKey } from '../src/ui/charts/plane/data.ts';
import { healthyFp } from '../src/ui/charts/profile/data.ts';
import type { CopiedDeck } from '../src/decks/hp/types.ts';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const decks = await allCopiedDecks();
const toolOf = (s: Any) => (s.tool ?? {}) as Any;
/** An engine that never answers: whatever is returned, it did not come from the worker. */
const never = { sequence: () => new Promise<never>(() => undefined) };
const neverRun = () => new Promise<never>(() => undefined);
// (a macrotask is the sentinel: whatever settles before it did not wait on a worker that never answers)
const settledNow = async <T>(p: Promise<T>, what = ''): Promise<T> => { const gone = Symbol('pending'); const r = await Promise.race([p, new Promise((ok) => setImmediate(() => ok(gone)))]); assert.notEqual(r, gone, `the data came back without the engine ${what}`); return r as T; };

test('gate 1: every deck has its file, and every chart slide has its entry under the key the card asks with', () => {
  const missing: string[] = [];
  for (const d of decks) {
    if (!trustBaked(d)) { missing.push(`${d.id}: no file for this engine and these words (node scripts/bake-charts.mjs)`); continue; }
    const b = bakedById(d.id)!;
    assert.equal(b.states.length, d.slides.length, `${d.id}: a state for every slide`);
    d.slides.forEach((s: Any, i) => {
      const t = toolOf(s), id = `${d.id}/${s.id}`;
      if (!b.states[i]?.fp) missing.push(`${id}: no state`);
      if ((t.kind === 'curve' || t.kind === 'course') && !bakedCurve(id, curveKey(t, id))) missing.push(`${id}: no ${t.kind}`);
      if (s.visual === 'allpatients' && hasCohort(s) && !bakedSeries(s, d)) missing.push(`${id}: no cohort series`);
      if (s.visual === 'ladders' && !bakedLadders(s, d)) missing.push(`${id}: no ladders`);
      if (s.visual === 'table' && Array.isArray(s.of) && b.tables[s.id]?.length !== s.of.length) missing.push(`${id}: no table rows`);
      if (s.visual === 'plane') { const now = pointsSync(s.of, d.slides as Any, (x) => b.states[d.slides.findIndex((q) => q.id === x)]?.fp as Any); if (now.length !== planeRows(s.of, d.slides as Any).length) missing.push(`${id}: a plane point is not known at once`); }
    });
  }
  assert.deepEqual(missing, []);
});

test('gate 2: with the engine never answering, every chart\'s data function returns on the spot', async () => {
  let seen = 0;
  for (const d of decks) {
    assert.ok(trustBaked(d), d.id);
    for (const s of d.slides as Any[]) {
      if (s.visual === 'allpatients' && hasCohort(s)) { assert.ok(await settledNow(cohortSeries(s, d as Any, neverRun as Any)!), s.id); seen++; }
      if (s.visual === 'ladders') { assert.ok((await settledNow(ladderData(s, d as Any, neverRun as Any))).rows.length, s.id); seen++; }
    }
  }
  assert.ok(seen >= 4, 'the all-patients chart and the three ladders');
  for (const d of decks) for (const s of (d.slides as Any[]).filter((q) => q.visual === 'plane' || toolOf(q).kind === 'plane')) for (const x of [s.of, toolOf(s).of].flat().filter((o: Any) => o && typeof o === 'object' && !o.id && o.preset)) { assert.ok(await settledNow(patientFp(never as Any, x), `${d.id}/${s.id} ${patientKey(x)}`), `${d.id}/${s.id} patient`); seen++; }
  assert.ok(await settledNow(healthyFp()));
  assert.ok(bakedHealthy());
});

test('the baked curve of the stiffness talk\'s "relation" slide is the live sweep\'s, to 1e-6', async () => {
  const d = decks.find((x) => x.id === 'stiffness') as CopiedDeck, i = d.slides.findIndex((s) => s.id === 'relation'), s = d.slides[i] as Any, t = toolOf(s), id = `stiffness/${s.id}`;
  assert.ok(trustBaked(d));
  const b = bakedById('stiffness')!, eng = nodeEngine();
  // the live way: the deck's chain and the sweep run again on the engine core
  const { bakeDeck } = await import('../src/ui/charts/baked/make.ts');
  const again = await bakeDeck(d, eng, bakedHealthy());
  eng.dispose();
  const near = (a: Any, c: Any, at: string): void => {
    if (typeof a === 'number' && typeof c === 'number') { assert.ok(Math.abs(a - c) <= 1e-6 * Math.max(1, Math.abs(c)), `${at}: ${a} vs ${c}`); return; }
    if (a && c && typeof a === 'object') { assert.deepEqual(Object.keys(a), Object.keys(c), at); for (const k of Object.keys(a)) near(a[k], c[k], `${at}.${k}`); return; }
    assert.equal(a, c, at);
  };
  const key = curveKey(t, id);
  assert.ok(b.curves[key] && again.curves[key]);
  near(b.curves[key], again.curves[key], 'curve');
  near(b.states.map((x) => x?.fp), again.states.map((x) => x?.fp), 'states');
});

test('gate 3: a what-if reads the case on the baked series (its first frame holds the baked curve, not an empty one)', () => {
  const d = decks.find((x) => x.id === 'stiffness') as CopiedDeck, s = d.slides.find((x) => x.id === 'relation') as Any, t = toolOf(s), id = `stiffness/${s.id}`;
  trustBaked(d);
  const work = bakedCurve(id, curveKey(t, id)) as Any, st = bakedById('stiffness')!.states[d.slides.findIndex((x) => x.id === 'relation')]!;
  const slide = { fp: st.fp as Any, params: st.params };
  const goal = goalOf(t, work.s, slide, { params: st.params, fp: st.fp as Any });
  assert.ok(goal && Number.isFinite(goal.x), 'a goal on the baked series');
  assert.ok(work.s.xs.length >= 5, 'the series has its points');
});

test('merged states: the baked reading fills every slot the second engine has not, and a baked state has no snapshot to sweep from', () => {
  const d = decks[0]!;
  trustBaked(d);
  const merged = mergeStates(d.id, undefined)!;
  assert.equal(merged.length, d.slides.length);
  assert.ok(merged.every((r) => r?.fp && r.baked && r.snap === undefined));
  const live = [{ fp: { pv: 1 }, snap: {}, params: null }, undefined];
  const m2 = mergeStates(d.id, live as Any)!;
  assert.equal(m2[0], live[0], 'the live state wins where it is in');
  assert.ok(m2[1]?.baked);
});

test('gate 4: another engine or other words are never served; the live path still works', async () => {
  const d = decks.find((x) => x.id === 'stiffness') as CopiedDeck, s = d.slides.find((x) => x.id === 'relation') as Any, t = toolOf(s), id = `stiffness/${s.id}`;
  assert.ok(trustBaked(d));
  const good = JSON.parse(JSON.stringify(bakedById('stiffness'))) as BakedDeck;
  forgetBaked();
  assert.equal(setBaked('stiffness', { ...good, key: `${engineKey()}x` }), false, 'a file of another engine is refused');
  assert.equal(bakedCurve(id, curveKey(t, id)), null);
  // the same file for a deck whose words have changed: dropped, never read
  setBaked('stiffness', good);
  const edited = { ...d, slides: d.slides.map((x, k) => (k === 0 ? { ...x, title: `${x.title} (edited)` } : x)) } as CopiedDeck;
  assert.notEqual(deckSig(edited), good.sig);
  assert.equal(trustBaked(edited), false);
  assert.equal(bakedCurve(id, curveKey(t, id)), null);
  // and the live sweep still gives the curve (no baked data in the way)
  const eng = nodeEngine(), i = d.slides.findIndex((x) => x.id === 'relation');
  const st = good.states[i]!;
  const run = ((steps: unknown[], from?: unknown) => eng.sequence(steps, from === undefined ? undefined : from ?? undefined)) as Any;
  const w = await curveWork(t, { fp: st.fp as Any, params: st.params }, run, () => null);
  eng.dispose();
  assert.ok(w && w.s.xs.length >= 5, 'the live path works');
  void courseWork;
});
