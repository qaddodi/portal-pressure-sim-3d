// The worker items of the external review of capture 3531bdfa that Mohammad ruled on (27 Nov 2026: W2, W3, W5, W6, W7, W11, W18). Each rule is held across every deck, not the one slide that showed it:
//   W2   a slide whose words say blood "returns to the liver" shows a bar whose liver share moved (shunted % counts all the TIPS blood since 28 Nov, so a wider stent reads higher)
//   W3   the bar's collateral segment is named for what it is, and the longer name still lays out inside the card
//   W5   a line that sets a reading against "the healthy" one prints the healthy patient's own reading (a token), never a typed number
//   W6a  the bleed path's case header says its "active bleeding" is the first endoscopy's
//   W6b  a blood pressure under 80 mmHg that has fallen 5 or more from the state the slide counts from rates amber ("Falling"), never green, in the line's pill and on the tile alike
//   W7   an aliasing slide's scale lies below the velocity it teaches aliasing of; after a TIPS the hepatic vein strip is called monophasic
//   W11  a slide that plays a procedure prints, at every step, only readings the state on show at that step holds; the words before the result are in the future tense
//   W18  a table compares with `first`, a named row, or nothing: no stale tag
// Node only (the baked states of the decks when they are current, else the engine's own chain).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { chainOf, sequencer } from '../src/decks/hp/numbers.ts';
import { deckOrder, loadBuiltin } from '../src/decks/registry.ts';
import { copiedOf } from '../src/decks/hp/deck.ts';
import { bakedById } from '../src/ui/charts/baked/store.ts';
import { tokensOf, valueText, plainText, VALUE_PENDING } from '../src/ui/text/tokens.ts';
import { ROUTES, flowParts, flowsInputOf, portalSplit } from '../src/ui/charts/flows/parts.ts';
import { routeLayout, routeGeo, routePills } from '../src/ui/charts/flows/layout.ts';
import { MAX_PILL_ROWS } from '../src/ui/charts/flows/frame.ts';
import { measure } from '../src/ui/charts/measure.ts';
import { PATHS, patientOf, chipsOf } from '../src/ui/charts/path/model.ts';
import { RATE, MAP_WATCH, MAP_FALL, rateShown } from '../src/ui/deck/from2d/table-marks.js';
import { tileView, deltaFpAt } from '../src/ui/cards/tiles-2d.ts';
import { aheadUntil, wordsAhead, resultStepOf } from '../src/ui/deck/step-words.ts';
import { specFor, procPlanOf } from '../src/ui/deck/procs-plan.ts';
import type { CopiedDeck, CopiedSlide } from '../src/decks/hp/types.ts';
import { ensureChartsBaked } from './baked-decks.ts';
ensureChartsBaked();

type Fp = Record<string, number | null | undefined>;
interface State { fp: Fp; before?: { fp?: Fp } | null }

/** Every deck's copied words, in the registered order (loading a deck also lays its baked file in when the file is for these words). */
const decks: CopiedDeck[] = [];
for (const id of deckOrder()) { await loadBuiltin(id); const c = copiedOf(id); if (c) decks.push(c); }
const deckOf = (id: string): CopiedDeck => decks.find((d) => d.id === id)!;

const chains = new Map<string, Promise<State[]>>();
/** A deck's state at each slide (index i is slide i): the baked one when it is current, else the engine's own chain. */
function statesOf(id: string): Promise<State[]> {
  let p = chains.get(id);
  if (!p) {
    p = (async () => {
      const baked = bakedById(id);
      if (baked) return baked.states.map((s) => (s ?? { fp: {} }) as State);
      const d = deckOf(id), seq = sequencer(1), core = createCore((m: never) => seq.message(m));
      core.handle({ type: 'run', running: false });
      await core.handle({ type: 'sequence', steps: chainOf(d.slides), reqId: 1 });
      core.dispose();
      return d.slides.map((_, i) => ({ fp: (seq.results[i + 1]?.fp ?? {}) as Fp, before: seq.results[i + 1]?.before as State['before'] }));
    })();
    chains.set(id, p);
  }
  return p;
}
const valueTokens = (text: string) => tokensOf(text).flatMap(({ raw, token }) => (token.kind === 'value' && !token.at ? [{ raw, key: token.key, whole: token.whole }] : []));

test('W2: a slide whose words say blood returns to the liver shows a liver share that moved; a narrower stent shunts less but still most (so the narrower-stent slide says so)', async () => {
  const claim = /\breturns? (portal|mesenteric) (venous )?blood to the liver|more (portal )?blood (reaches|returns to) the liver/i;
  let seen = 0;
  for (const d of decks) {
    for (const [i, s] of d.slides.entries()) {
      const tool = s.tool as { kind?: string } | undefined;
      if (tool?.kind !== 'flows' || !s.delta || !claim.test(`${s.title ?? ''} ${s.line ?? ''}`)) continue;
      const st = await statesOf(d.id), from = d.slides.findIndex((x) => x.id === s.delta);
      const liver = (fp: Fp) => portalSplit(fp.shunt as number).liver;
      assert.notEqual(liver(st[i]!.fp), liver(st[from]!.fp), `${d.id}/${s.id}: the words say blood returns to the liver, the bar reads ${liver(st[i]!.fp)}% as it did on ${s.delta}`);
      seen++;
    }
  }
  assert.equal(seen, 0, 'no slide with a bar claims the blood returns to the liver while its share is unchanged (the narrower-stent slide was the one)');
  // the model's fact the slide's words must not contradict: shunted % counts all the blood through the stent (28 Nov, his ruling), so a 6 mm stent (the narrower-stent slide) reads lower than the 8 mm one before it,
  // and still most of the blood ("still most of it" in the slide's words).
  const d = deckOf('encephalopathy'), st = await statesOf('encephalopathy'), at = (id: string) => st[d.slides.findIndex((x) => x.id === id)]!.fp;
  const wide = (at('tips').shunt as number) * 100, narrow = (at('narrow').shunt as number) * 100;
  assert.ok(narrow < wide - 1, `a narrower stent shunts less (${narrow.toFixed(2)}% at 6 mm, ${wide.toFixed(2)}% at 8 mm)`);
  assert.ok(narrow > 50, 'most of the blood still bypasses the liver on the narrower stent, as the slide says');
  assert.doesNotMatch(d.slides.find((s) => s.id === 'narrow')!.line ?? '', /returns portal blood to the liver/);
});

test('W3: the collateral segment of the bar is "Gastroesophageal collaterals", and the longer name lays out inside the card at every width', async () => {
  const route = ROUTES.find(([k]) => k === 'var')!;
  assert.equal(route[1], 'Gastroesophageal collaterals');
  assert.ok(!ROUTES.some(([, name]) => name === 'Varices'), 'no route is named Varices: the bar shows collaterals, not varices (23.6 is a patient with no varices)');
  // every bar of every deck lays out inside the card at the three widths wherever it laid out under the old, shorter name
  let bars = 0;
  for (const d of decks) {
    const st = await statesOf(d.id);
    for (const [i, sl] of d.slides.entries()) {
      if ((sl.tool as { kind?: string } | undefined)?.kind !== 'flows') continue;
      const input = flowsInputOf(st[i]!.fp as never);
      const parts = input ? flowParts(input) : null;
      if (!parts) continue;
      for (const w of [260, 330, 430]) {
        const g = routeGeo(13), hh = g.pillsT + MAX_PILL_ROWS * g.ph + (MAX_PILL_ROWS - 1) * g.pg;
        const was = routeLayout(parts.map((p) => (p.id === 'var' ? { ...p, name: 'Varices' } : p)), w, hh, 13, measure, null, null);
        const now = routeLayout(parts, w, hh, 13, measure, null, null);
        if (was.ok) assert.ok(now.ok && now.rows <= MAX_PILL_ROWS, `${d.id}/${sl.id} at ${w}: laid out under "Varices", so it must under the longer name`);
        for (const p of now.pills) assert.ok(p.cx - p.w / 2 >= -1e-6 && p.cx + p.w / 2 <= w + 1e-6, `${d.id}/${sl.id}: ${p.id} inside the card at ${w}`);
        bars++;
      }
    }
  }
  assert.ok(bars >= 30, `bars laid out (${bars})`);
});

test('W3: a long name beside a short one to its right still gets rows (the short one on the upper row, the long one under it, no leader through a name)', () => {
  const g = routeGeo(13), items = [{ id: 'var', text: 'Gastroesophageal collaterals 45%', mid: 196.5 }, { id: 'other', text: 'Other 12%', mid: 282 }];
  const r = routePills(items, 300, g, measure, MAX_PILL_ROWS);
  assert.ok(r.ok && r.rows <= MAX_PILL_ROWS, `rows ${r.rows}`);
  const row = (id: string) => r.pills.find((p) => p.id === id)!.row;
  assert.ok(row('other') < row('var'));
  for (const p of r.pills) assert.ok(p.lx >= p.cx - p.w / 2 - 1e-6 && p.lx <= p.cx + p.w / 2 + 1e-6, `${p.id}: its leader lands under its own words`);
});

test('W5: a line that sets a reading against "the healthy" one names the healthy slide by token, and that slide is a healthy patient', async () => {
  const bad: string[] = [];
  let seen = 0;
  for (const d of decks) {
    // the patient each slide stands on: its own preset, else the one before's
    let preset = '';
    const presetAt = d.slides.map((s) => (preset = (s.preset as string | undefined) ?? preset));
    for (const s of d.slides) {
      for (const text of [s.line ?? '', s.title ?? '']) {
        for (const m of text.matchAll(/healthy (\d[\d.,]* ?(?:cm\/s|mmHg|L\/min|kPa|%|mm|g\/dL|L)\b)/g)) bad.push(`${d.id}/${s.id}: "healthy ${m[1]}" typed, not a token`);
        for (const m of text.matchAll(/healthy \{(\w+)@([\w-]+)\}/g)) {
          const at = d.slides.findIndex((x) => x.id === m[2]);
          if (at < 0 || presetAt[at] !== 'healthy') bad.push(`${d.id}/${s.id}: {${m[1]}@${m[2]}} is not a healthy patient`);
          seen++;
        }
      }
      assert.doesNotMatch(s.line ?? '', /about half of normal/, `${d.id}/${s.id}`);
    }
  }
  assert.deepEqual(bad, []);
  assert.ok(seen >= 1, 'Doppler 9 reads the healthy portal vein velocity from its healthy slide');
  // the live value: 16 cm/s is well below the healthy 27 (59%), as the line says
  const d = deckOf('doppler'), st = await statesOf('doppler'), a3 = d.slides.findIndex((s) => s.id === 'a3'), normal = d.slides.findIndex((s) => s.id === 'normal');
  const text = plainText(d.slides[a3]!.line!, st[a3]!.fp, (id) => st[d.slides.findIndex((s) => s.id === id)]!.fp);
  assert.match(text, /falls to 16 cm\/s, well below the healthy 27 cm\/s,/);
  assert.ok(st[a3]!.fp.pvVel! < 0.65 * st[normal]!.fp.pvVel!, '"well below" holds');
});

test('W6a: the bleed path\'s case header says its active bleeding is the first endoscopy\'s, whichever way the patient is', () => {
  for (const active of [true, false]) {
    const chips = chipsOf('bleed', patientOf('bleed', { src: 'ov', cp: 8, active, ctrl: false, fit: true }, null)) as string[];
    assert.ok(chips.includes(`${active ? 'Active' : 'No active'} bleeding at the first endoscopy`), chips.join(' | '));
  }
  assert.ok(PATHS.bleed);
});

test('W6b: a blood pressure under 80 that has fallen 5 or more from where the slide counts from is amber "Falling", not green, in the pill, on the tile, and nowhere else changes', async () => {
  const f = (map: number, from?: number) => ({ map, sbp: 100, dbp: 60, ...(from == null ? {} : { mapFrom: from }) });
  const rate = (v: number, from?: number) => RATE.map(v, f(v, from))[0];
  assert.equal(MAP_WATCH, 80);
  assert.equal(MAP_FALL, 5);
  assert.equal(rate(76, 83), 'mid', 'the rebleed: 83 to 76');
  assert.equal(rate(76), 'ok', 'no state to count from: as before');
  assert.equal(rate(76, 79), 'ok', 'a fall under 5 is not a trend');
  assert.equal(rate(76, 70), 'ok', 'a rise is better');
  assert.equal(rate(82, 95), 'ok', 'at 80 or more the pressure is not low enough to warn on');
  assert.equal(RATE.map(60, { map: 60, sbp: 100, mapFrom: 80 })[0], 'hi', 'under 65 is red, as before');
  assert.equal(rateShown('map', f(76, 83))[0], 'mid', 'the line\'s pill rates the pressure as shown');
  // the slide itself: Variceal bleed 12 (the rebleed) counts from "controlled", 83 mmHg
  const d = deckOf('variceal-bleed'), st = await statesOf('variceal-bleed'), i = d.slides.findIndex((s) => s.id === 'rebleed');
  const ref = deltaFpAt(d.slides as CopiedSlide[], st as never, i);
  assert.ok(ref && ref.map! - st[i]!.fp.map! >= MAP_FALL && st[i]!.fp.map! < MAP_WATCH, `rebleed falls from ${ref?.map} to ${st[i]!.fp.map}`);
  const tile = tileView('map', st[i]!.fp as never, { ref });
  assert.equal(tile.rate, 'mid');
  assert.equal(tile.word, 'Falling');
  assert.equal(tileView('map', st[i]!.fp as never).rate, 'ok', 'without a state to count from the tile reads as it did');
});

test('W7: an aliasing slide\'s scale lies below the stent\'s velocity at every gate (so the peaks wrap); after a TIPS the hepatic vein strip is monophasic, not flat', async () => {
  let seen = 0;
  for (const d of decks) {
    const st = await statesOf(d.id).catch(() => [] as State[]);
    for (const [i, s] of d.slides.entries()) {
      const tool = s.tool as { kind?: string; vessel?: string; scale?: number } | undefined;
      if (tool?.kind !== 'doppler' || !(tool.scale! > 0) || !/alias|nyquist/i.test(`${s.title} ${s.line}`)) continue;
      const fp = st[i]!.fp;
      const gates = tool.vessel === 'TIPS' ? [fp.tipsG0, fp.tipsG1, fp.tipsG2] : [Math.abs(fp.pvVel ?? 0)];
      for (const g of gates) assert.ok(g! > tool.scale!, `${d.id}/${s.id}: the velocity ${g} must exceed the Nyquist limit ${tool.scale} or nothing aliases`);
      seen++;
    }
  }
  assert.ok(seen >= 1);
  const tipsDoppler = deckOf('tips-doppler');
  assert.equal((tipsDoppler.slides.find((s) => s.id === 'alias')!.tool as { scale?: number }).scale, 120);
  const mpv = tipsDoppler.slides.find((s) => s.id === 'mpv')!.line!;
  assert.match(mpv, /the hepatic vein is monophasic: it no longer reverses/);
  assert.doesNotMatch(mpv, /hepatic vein is flat/);
});

test('W11: at every step of a played procedure the words print only readings the state on show holds, and the words before the result are in the future tense', async () => {
  let checked = 0, withAhead = 0;
  for (const d of decks) {
    if (!d.slides.some((s) => s.procedure)) continue;
    const st = await statesOf(d.id);
    for (const [i, s] of d.slides.entries()) {
      if (!s.procedure) continue;
      const plan = procPlanOf(s)!, spec = specFor(plan.kind) as { morph?: boolean } | null;
      const after = st[i]!.fp, before: Fp | null | undefined = st[i]!.before?.fp ?? (spec?.morph && i > 0 ? st[i - 1]!.fp : null);
      const where = `${d.id}/${s.id}`;
      const until = aheadUntil(s as { procedure?: unknown; lineAhead?: string });
      if (s.lineAhead) {
        withAhead++;
        assert.ok(until !== null, `${where}: has words before the result, so its procedure has a result step`);
        assert.match(s.lineAhead, /\bwill\b/, `${where}: the words before the result are in the future tense`);
        assert.ok(plainText(s.lineAhead, after).length <= plainText(s.line!, after).length, `${where}: they are no longer than the result's, so the card never needs more room`);
      }
      if (!before) continue;
      const changed = (key: string, whole: boolean) => { const a = valueText(key, before, whole), b = valueText(key, after, whole); return a !== VALUE_PENDING && a !== b; };
      const moved = valueTokens(s.line!).filter((t) => changed(t.key, t.whole));
      if (moved.length) assert.ok(s.lineAhead, `${where}: the line prints ${moved.map((t) => t.raw).join(', ')}, which the procedure changes, so it needs words for before the result`);
      // each step: the words shown print the slide's own (result) readings, and the state shown is the one before the result until the result's step: they must agree
      const n = (specFor(plan.kind) as { steps: unknown[] }).steps.length;
      for (let k = -1; k < n; k++) {
        const ahead = wordsAhead({ lineAhead: s.lineAhead, ...(until !== null ? { aheadUntil: until } : {}) }, k);
        const shownFp: Fp = until !== null && k < until ? before! : after;
        for (const t of valueTokens(ahead ? s.lineAhead! : s.line!)) {
          if (valueText(t.key, shownFp, t.whole) === VALUE_PENDING) continue;
          assert.equal(valueText(t.key, after, t.whole), valueText(t.key, shownFp, t.whole), `${where} step ${k + 1}: ${t.raw} is printed from the result, the figure does not show it yet`);
        }
      }
      checked++;
    }
  }
  assert.ok(checked >= 10, `procedure slides checked (${checked})`);
  assert.ok(withAhead >= 10, `slides with words before the result (${withAhead})`);
  // where the result shows: the first step whose stop lies after the model takes the change
  assert.equal(resultStepOf('paracentesis'), 1);
  assert.equal(resultStepOf('tips'), 3);
  assert.equal(resultStepOf('evl'), 0);
  assert.equal(resultStepOf('hvpgcath'), null, 'a catheter that only reads has no result to wait for');
  assert.equal(wordsAhead({ lineAhead: 'x', aheadUntil: 3 }, 2), true);
  assert.equal(wordsAhead({ lineAhead: 'x', aheadUntil: 3 }, 3), false);
  assert.equal(wordsAhead({ lineAhead: 'x', aheadUntil: 3 }, -1), true, 'the slide lands before the procedure');
  assert.equal(wordsAhead({ aheadUntil: 3 }, 0), false);
});

test('W18: a table compares with "first", with a row it names, or with nothing (against normal): no stale tag', () => {
  const bad: string[] = [];
  for (const d of decks) {
    for (const s of d.slides) {
      const t = s as { visual?: unknown; of?: { id?: string; key?: string; vs?: string }[]; vs?: string };
      if (t.visual !== 'table') continue;
      if (t.vs !== undefined && t.vs !== 'first') bad.push(`${d.id}/${s.id}: table-level vs ${JSON.stringify(t.vs)} means nothing to the model`);
      for (const r of t.of ?? []) {
        if (!r.vs) continue;
        const named = (t.of ?? []).some((x) => x !== r && (x.key === r.vs || x.id === r.vs)) || d.slides.some((x) => x.id === r.vs);
        if (!named) bad.push(`${d.id}/${s.id}: row ${r.id ?? r.key} compares with ${r.vs}, which is no row and no slide`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
