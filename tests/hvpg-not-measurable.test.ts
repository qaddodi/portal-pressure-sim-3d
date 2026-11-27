// "Not measurable" is decided in ONE place and every surface that prints or draws an HVPG goes through it (owner ruling 27 Nov 2026, review 3531bdfa W1: Budd-Chiari prints "HVPG 0.3" on 26.10 and 27.10 to
// 27.13 while the words say it cannot be measured). The rule, held across every deck rather than the slides that showed it:
//   1. The fact is the PATIENT's: `hvpgBlockedBy(params)` is the engine's hvBlocked, `presetBlocked(id)` agrees with it for every preset, and the state the page takes from the engine (the deck's sequence,
//      the client's, the baked file) carries it in its fingerprint as `hvBlocked` exactly when its own params block the vein.
//   2. A slide whose state is blocked prints no HVPG number in its words ({hvpg}, {hvpg:0}, {hvpg@slide} read "Not measurable"), its tiles, its profile's brackets, its summary table's cells, its plane's points,
//      its ladders' pills; and no tool that would print one unrouted (a trace, a cohort, a curve on the HVPG) stands on such a slide.
//   3. The authored flags agree with the patient: a slide whose `cath` is 'blocked' stands on a blocked state, and no slide's words call a blocked patient's HVPG "near zero" or "normal".
//   4. No file but engine/hv-flag.ts asks the engine's hvBlocked itself (lint rule hv-blocked-direct, tests/lint-rules.test.ts).
// Node only. A deck's states are read from its baked file when there is one (the deploy bakes them), else worked out by the engine's own chain.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { PRESETS, defaultParams } from '../src/engine/hales/portal/scenario.js';
import { hvBlocked } from '../src/engine/hales/portal/pressure-cuts.js';
import { HV_BLOCKED_KEY, NOT_MEASURABLE, flagFp, flagStep, hvpgBlockedBy, hvpgNotMeasurable, presetBlocked } from '../src/engine/hv-flag.ts';
import { csphFingerprint } from '../scripts/gen-engine-fixture.mjs';
import { chainOf, sequencer, changes } from '../src/decks/hp/numbers.ts';
import { SOURCE_IDS, loadSource } from '../src/decks/source.ts';
import { trustBaked, bakedById } from '../src/ui/charts/baked/store.ts';
import { tokensOf, valueText, plainText } from '../src/ui/text/tokens.ts';
import { slideTiles, tileView, respFp } from '../src/ui/cards/tiles-2d.ts';
import { tableModel, type ResolvedRow } from '../src/ui/talk/table-model.ts';
import { spansFor, pillReadings, HEPATIC_VEIN_SPANS, SPANS } from '../src/ui/charts/profile/model.ts';
import { planeLayout, planeOf, planeReading, planeWords } from '../src/ui/charts/plane/model.ts';
import { ladderRows, gapOf } from '../src/ui/cards/ladder-model.ts';
import { chipsOf } from '../src/ui/menu/umenu-logic.ts';
import { hiddenOf, HV_BLOCKED } from '../src/ui/tests/hidden.ts';
import { readings as profileReadings } from '../src/ui/tests/profile/readings.ts';
import { stripLabel } from '../src/ui/wallet/wallet-machine.ts';
import type { CopiedDeck, CopiedSlide } from '../src/decks/hp/types.ts';
import { ensureChartsBaked } from './baked-decks.ts';
ensureChartsBaked();

type Fp = Record<string, number | null | undefined>;
const BCS: Fp = flagFp({ hvpg: 0.3, whvp: 25.1, fhvp: 24.8, ppg: 21.7, pv: 25.7, ivc: 4 }, { thrombus: { RHV_IVC: 1, MHV_IVC: 1, LHV_IVC: 1 } });
const OPEN: Fp = { hvpg: 12.4, whvp: 17, fhvp: 4.6, ppg: 14, pv: 18, ivc: 4 };

test('the patient decides: the engine\'s own rule, for params and for every preset, and the flag rides in the fingerprint only when it holds', () => {
  assert.equal(NOT_MEASURABLE, 'Not measurable');
  for (const p of PRESETS as { id: string; apply: (p: unknown) => unknown }[]) {
    assert.equal(presetBlocked(p.id), !!hvBlocked(p.apply(defaultParams())), `${p.id}: presetBlocked is the engine's hvBlocked on the preset's params`);
  }
  assert.ok(presetBlocked('budd-chiari') && !presetBlocked('healthy') && !presetBlocked('cirrhosis') && !presetBlocked('no-such-patient'));
  const clot = (v: number) => ({ thrombus: { RHV_IVC: v } });
  assert.ok(hvpgBlockedBy(clot(0.8)) && !hvpgBlockedBy(clot(0.79)) && !hvpgBlockedBy({}) && !hvpgBlockedBy(null) && !hvpgBlockedBy(undefined), 'at the engine\'s 0.8 line, the right vein the HVPG is taken in');
  assert.ok(hvpgNotMeasurable(BCS) && !hvpgNotMeasurable(OPEN) && !hvpgNotMeasurable(null) && BCS[HV_BLOCKED_KEY] === 1);
  assert.equal(flagFp(OPEN, clot(0)), OPEN, 'an open vein gets the same object back: no copy, no new key');
  assert.ok(!(HV_BLOCKED_KEY in flagFp(OPEN, clot(0.5))));
  // a step's fingerprint, and the fingerprints of its `start` and `before` states, are flagged by their own params
  const step = flagStep({ fp: { ...OPEN }, params: clot(1), start: { fp: { ...OPEN }, params: clot(0) }, before: { fp: { ...OPEN }, params: clot(1) } });
  assert.ok(hvpgNotMeasurable(step.fp as Fp) && !hvpgNotMeasurable((step.start as { fp: Fp }).fp) && hvpgNotMeasurable((step.before as { fp: Fp }).fp));
});

test('the words: {hvpg}, {hvpg:0} and {hvpg@slide} read "Not measurable" for a blocked state, and the same text still reads the number for an open one', () => {
  const text = 'the HVPG is {hvpg}, whole {hvpg:0}, then {hvpg@before}, and the PPG {ppg}';
  assert.equal(valueText('hvpg', BCS), NOT_MEASURABLE);
  assert.equal(valueText('hvpg', BCS, true), NOT_MEASURABLE);
  assert.equal(plainText(text, BCS, () => OPEN), `the HVPG is ${NOT_MEASURABLE}, whole ${NOT_MEASURABLE}, then 12.4 mmHg, and the PPG 21.7 mmHg`);
  assert.equal(plainText(text, OPEN, () => BCS), `the HVPG is 12.4 mmHg, whole 12.4 mmHg, then ${NOT_MEASURABLE}, and the PPG 14.0 mmHg`);
  assert.equal(valueText('ppg', BCS), '21.7 mmHg', 'every other reading of the patient stands');
});

test('the tiles: the HVPG tile of a blocked state has no number, no band, no needle and no change; an open one is as it was', () => {
  const t = tileView('hvpg', BCS, { ref: OPEN }), o = tileView('hvpg', OPEN, { ref: { ...OPEN, hvpg: 9 } });
  assert.equal(t.word, NOT_MEASURABLE);
  assert.doesNotMatch(`${t.text}${t.head.text.replace(NOT_MEASURABLE, '')}`, /\d/, 'no digit in the number\'s place');
  assert.deepEqual([t.rate, t.unit, t.delta, t.bar?.now, t.bar?.was], ['none', '', '', null, null]);
  assert.equal(t.head.text, NOT_MEASURABLE);
  assert.match(o.text, /^12\.4$/);
  assert.notEqual(o.word, NOT_MEASURABLE);
  // the response tile counts no fall to or from an HVPG nobody can measure
  const resp = (f: Fp) => respFp({ id: 'x', hvpgResp: true } as CopiedSlide, f, 12);
  assert.equal(resp(BCS)!.hvpgFall, null);
  assert.ok(typeof resp(OPEN)!.hvpgFall === 'number');
});

test('the profile: a blocked state draws no HVPG or EUS-PPG bracket whatever the slide\'s own flag says, and its pill says why', async () => {
  assert.deepEqual(spansFor(['hvpg', 'eus', 'ppg'], BCS).map((s) => s[0]), ['ppg']);
  assert.deepEqual(spansFor(['hvpg', 'eus', 'ppg'], OPEN).map((s) => s[0]), ['hvpg', 'eus', 'ppg']);
  assert.ok(!spansFor(undefined, BCS).some(([k]) => HEPATIC_VEIN_SPANS.includes(k)), 'the default pair, less the HVPG');
  // (the Budd-Chiari patient as the engine has them: the profile reads the whole fingerprint, the node pressures included)
  const real = flagFp((await csphFingerprint('budd-chiari')) as Fp, { thrombus: { RHV_IVC: 1 } });
  const pills = pillReadings(real);
  assert.deepEqual(spansFor(['hvpg', 'ppg'], real).map((s) => s[0]), ['ppg']);
  assert.deepEqual(pills.map((p) => [p.k, p.v]).filter(([k]) => k === 'hvpg'), [['hvpg', NOT_MEASURABLE]]);
  assert.deepEqual(SPANS.length > 0, true);
});

test('the summary table: the HVPG cell of a blocked row is the "not measurable" ring, whatever the row\'s own `blank` says, and the legend says what the ring is', () => {
  const row = (id: string, f: Fp | null, spec: object = {}): ResolvedRow => ({ spec: { id, ...spec } as never, i: 1, f, title: id, kicker: '' });
  const m = tableModel({ cols: ['pv', 'whvp', 'fhvp', 'ra', 'hvpg', 'ppg'], asc: false, of: ['a', 'b'] } as never, [row('a', OPEN, { ref: true }), row('b', BCS)]);
  const cell = (r: number, k: string) => m.rows[r]!.cells.find((c) => c.k === k)!;
  assert.equal(cell(1, 'hvpg').kind, 'blank');
  assert.equal(cell(1, 'hvpg').sr, NOT_MEASURABLE.toLowerCase());
  assert.equal(cell(1, 'hvpg').text, '');
  assert.notEqual(cell(1, 'ppg').kind, 'blank', 'the PPG of the same patient is read');
  assert.notEqual(cell(0, 'hvpg').kind, 'blank');
  assert.match(m.legend, new RegExp(`○ ${NOT_MEASURABLE.toLowerCase()}`));
});

test('the plane: a blocked patient has no point on a plane that plots the HVPG, and the words say so', () => {
  const pl = planeOf('hvpg-ppg')!;
  const pts = [{ f: OPEN, name: 'Cirrhosis' }, { f: BCS, name: 'Budd–Chiari' }];
  const L = planeLayout({ plane: pl, W: 330, H: 275, fs: 13, points: pts });
  assert.deepEqual(L.at.map((p) => p.name), ['Cirrhosis']);
  assert.match(planeWords(pl, pts, null), /Budd–Chiari: HVPG not measurable, so not plotted/);
  assert.doesNotMatch(planeWords(pl, pts, null).replace(/Budd–Chiari: HVPG not measurable/, ''), /Budd–Chiari, /, 'it is not listed with a value');
  assert.equal(planeLayout({ plane: pl, W: 330, H: 152, fs: 13, card: true, ring: BCS }).dot, null, 'the card\'s own case has no dot either');
  assert.equal(planeReading(pl, BCS), `HVPG ${NOT_MEASURABLE} · PPG 21.7 mmHg`);
  assert.match(planeReading(pl, OPEN), /HVPG 12\.4 mmHg/);
  // a plane that plots other readings does not care
  assert.ok(planeLayout({ plane: planeOf('csph')!, W: 330, H: 275, fs: 13, points: [{ f: { ...BCS, lsm: 20, plt: 120 }, name: 'x' }] }).at.length === 1);
});

test('the pressure ladder card, the strip, the menu\'s patient chips and the Tests panes say it too', () => {
  const rd = { whvp: 25.1, fhvp: 24.8, hvpg: 0.3, [HV_BLOCKED_KEY]: 1 };
  const rows = ladderRows(['whvp', 'fhvp', 'hvpg'], rd);
  assert.equal(rows[2]!.value, null);
  assert.equal(rows[2]!.frac, 0);
  assert.equal(rows[0]!.text, '25.1', 'the two pressures stand');
  const g = gapOf(rd);
  assert.deepEqual([g.hvpg, g.value, g.sev, g.pill], [NOT_MEASURABLE, null, null, '']);
  assert.equal(gapOf({ whvp: 17, fhvp: 4.6, hvpg: 12.4 }).hvpg, '12.4');
  assert.equal(stripLabel('data', NOT_MEASURABLE, 'x').rest, 'HVPG not measurable');
  assert.equal(stripLabel('data', '12.4', 'x').rest, 'HVPG 12.4');
  const snap = { P: [], hvpg: 0.3, pv: 25.7, pvFlow: 0.69, ascites: 8 };
  assert.deepEqual(chipsOf(snap, true)[0], { cls: 'hp-chip', title: 'Hepatic venous pressure gradient', word: 'HVPG ', value: 'not measurable' });
  assert.match(chipsOf(snap, false)[0]!.value, /^0\.3$/);
  // the Tests panes: the true HVPG is hidden for a blocked patient, on a slide too, with the reason in the set
  const bcs = { thrombus: { RHV_IVC: 1 } }, open = {};
  for (const presenting of [false, true]) {
    const h = hiddenOf({ params: bcs, presenting });
    assert.ok(h?.has('trueHVPG') && h.has(HV_BLOCKED), `blocked, presenting ${presenting}`);
    assert.ok(!hiddenOf({ params: open, presenting })?.has('trueHVPG'), `open, presenting ${presenting}`);
  }
  const hid = hiddenOf({ params: bcs });
  const hv = profileReadings({ hvpg: 0.3, ppg: 21.7, pv: 25.7 }, hid).find((x) => x.id === 'hvpg')!;
  assert.equal(hv.text, NOT_MEASURABLE);
  assert.equal(profileReadings({ hvpg: 12.4, ppg: 14, pv: 18 }, null).find((x) => x.id === 'hvpg')!.text, '12.4');
});

// ── every deck ──
const PRE = /budd-chiari|RHV_IVC|MHV_IVC|LHV_IVC|"thrombus"/;
const live = async (d: CopiedDeck) => {
  const seq = sequencer(1), core = createCore((m: never) => seq.message(m));
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps: chainOf(d.slides as never), reqId: 1 });
  core.dispose();
  return d.slides.map((_, i) => seq.results[i + 1] as { fp: Fp; params?: unknown } | undefined);
};
/** Every talk that can stand on a blocked vein (its words name the Budd-Chiari preset or a hepatic vein's clot) with each slide's state: the baked file's, else the engine's own chain. */
async function decks(): Promise<{ d: CopiedDeck; states: ({ fp: Fp; params?: unknown } | undefined)[] }[]> {
  const out = [];
  for (const id of SOURCE_IDS) {
    const d = (await loadSource(id)) as unknown as CopiedDeck;
    if (!PRE.test(JSON.stringify(d.slides))) continue;
    const baked = trustBaked(d as never) ? bakedById(d.id) : null;
    out.push({ d, states: baked ? (baked.states as never) : await live(d) });
  }
  return out;
}
let cached: ReturnType<typeof decks> | null = null;
const every = () => (cached ??= decks());
const WORDS = (s: CopiedSlide): string[] => [s.title, s.line, s.vignette, ...(((s.ask ?? []) as string[]))].filter((x): x is string => typeof x === 'string');
/** The state a slide stands on: its own, else the last one before it that changed the patient (a slide that changes nothing reads the one it stands on). */
const ownState = (states: ({ fp: Fp; params?: unknown } | undefined)[], i: number) => states[i];

test('every deck: the flag in a slide\'s state is exactly the engine\'s rule on that state\'s own params (the seam holds on the deck\'s sequence and on the baked file)', async () => {
  let blocked = 0, open = 0;
  for (const { d, states } of await every()) {
    states.forEach((st, i) => {
      if (!st) return;
      assert.equal(hvpgNotMeasurable(st.fp), !!hvBlocked(st.params), `${d.id}/${(d.slides[i] as CopiedSlide).id}: flag ${hvpgNotMeasurable(st.fp)}, engine ${!!hvBlocked(st.params)}`);
      if (hvpgNotMeasurable(st.fp)) blocked++; else open++;
    });
  }
  assert.ok(blocked >= 10, `the Budd-Chiari slides are found (${blocked})`);
  assert.ok(open >= 10, 'and the slides after the treatment are not');
});

test('every deck: a slide on a blocked state prints no HVPG number, in its words, tiles, brackets, table cells, plane points or pills, and runs no tool that would', async () => {
  let slides = 0, tables = 0, planes = 0, ladders = 0;
  const NUMBERY = /\bHVPG\b[^.;]{0,40}\b(near zero|normal|low)\b/i, SAYS = /cannot be measured|not measurable|no HVPG/i, UNROUTED = new Set(['trace', 'small', 'path', 'shift']);
  for (const { d, states } of await every()) {
    const slidesOf = d.slides as CopiedSlide[], idx = (id: string) => slidesOf.findIndex((x) => x.id === id);
    const fpAt = (id: string): Fp | null => (idx(id) >= 0 ? states[idx(id)]?.fp ?? null : null);
    slidesOf.forEach((s, i) => {
      const st = ownState(states, i);
      if (!st || !hvpgNotMeasurable(st.fp)) return;
      slides++;
      const at = `${d.id}/${s.id}`;
      // words: every {hvpg…} of the slide's text prints the word for this state, and no sentence calls a blocked patient's HVPG near zero or normal
      for (const w of WORDS(s)) {
        for (const { token } of tokensOf(w)) {
          if (token.kind !== 'value' || token.key !== 'hvpg') continue;
          const f: Fp | null = token.at ? fpAt(token.at) : st.fp;
          if (f && hvpgNotMeasurable(f)) assert.equal(valueText('hvpg', f, token.whole), NOT_MEASURABLE, at);
        }
        // (a slide that sets its own patient speaks of that patient; one that only stands on the last one (a plane of five others) speaks of its own subject)
        if (changes(s)) for (const sentence of plainText(w, st.fp, fpAt).split(/(?<=[.?!])\s+/)) if (NUMBERY.test(sentence)) assert.ok(SAYS.test(sentence), `${at}: "${sentence}" says a blocked patient's HVPG is normal or near zero`);
      }
      // tiles: the card's HVPG tile, wherever the slide shows it
      for (const t of slideTiles(s, st.fp).tiles.filter((x) => x.k === 'hvpg')) assert.deepEqual([t.word, t.bar?.now ?? null], [NOT_MEASURABLE, null], `${at}: the HVPG tile`);
      // the profile: no hepatic-vein bracket
      const tool = (s.tool ?? {}) as { kind?: string; spans?: string[]; x?: string; y?: string; lines?: string[]; plane?: unknown };
      if (tool.kind === 'profile') assert.ok(!spansFor(tool.spans, st.fp, !!s.cath && s.cath === 'blocked').some(([k]) => HEPATIC_VEIN_SPANS.includes(k)), `${at}: a bracket on a blocked vein`);
      // no tool that would print the HVPG as a number or a line of them without going through the rule
      assert.ok(!UNROUTED.has(tool.kind ?? ''), `${at}: a ${tool.kind} card prints the HVPG without the rule`);
      if (tool.kind === 'curve' || tool.kind === 'flowtime') assert.ok(![tool.x, tool.y, ...(tool.lines ?? [])].includes('hvpg'), `${at}: a ${tool.kind} of the HVPG`);
    });
    // the authored flag agrees with the patient (a slide's catheter is blocked only where the vein is)
    slidesOf.forEach((s, i) => { if (s.cath === 'blocked' && states[i]) assert.ok(hvpgNotMeasurable(states[i]!.fp), `${d.id}/${s.id}: cath 'blocked' on an open vein`); });
    // the summary tables, planes and ladders that name a blocked slide's patient
    for (const s of slidesOf) {
      const spec = (s.table ?? s) as { of?: (string | { id?: string })[]; cols?: string[] };
      const ofRows = (spec.of ?? []).map((x) => (typeof x === 'string' ? { id: x } : x));
      const named = ofRows.filter((r) => r.id && idx(r.id) >= 0 && states[idx(r.id!)] && hvpgNotMeasurable(states[idx(r.id!)]!.fp));
      if (!named.length) continue;
      if (s.visual === 'table') {
        tables++;
        const rows: ResolvedRow[] = ofRows.map((r, j) => ({ spec: r as never, i: j, f: r.id && idx(r.id) >= 0 ? states[idx(r.id)]?.fp ?? null : null, title: String(r.id), kicker: '' }));
        const m = tableModel({ ...spec, of: ofRows, cols: spec.cols ?? ['pv', 'whvp', 'fhvp', 'ivc', 'ra', 'hvpg', 'ppg'] } as never, rows);
        for (const r of named) {
          const row = m.rows[ofRows.indexOf(r)]!, cell = row.cells.find((c) => c.k === 'hvpg');
          if (cell) assert.equal(cell.kind, 'blank', `${d.id}/${s.id}: ${r.id}'s HVPG cell`);
        }
      }
      if (s.visual === 'plane') {
        planes++;
        const pl = planeOf((s as { plane?: string }).plane ?? 'csph');
        if (pl && (pl.x.key === 'hvpg' || pl.y.key === 'hvpg')) {
          const pts = ofRows.filter((r) => r.id && states[idx(r.id)]).map((r) => ({ f: states[idx(r.id!)]!.fp, name: String(r.id) }));
          const L = planeLayout({ plane: pl, W: 330, H: 275, fs: 13, points: pts });
          for (const r of named) assert.ok(!L.at.some((p) => p.name === r.id), `${d.id}/${s.id}: ${r.id} has a point on a plane of the HVPG`);
        }
      }
      if (s.visual === 'ladders') {
        ladders++;
        for (const r of named) assert.deepEqual(pillReadings(states[idx(r.id!)]!.fp as never).filter((p) => p.k === 'hvpg').map((p) => p.v), [NOT_MEASURABLE], `${d.id}/${s.id}: ${r.id}'s pill`);
      }
    }
  }
  assert.ok(slides >= 10, `blocked slides found: ${slides}`);
  assert.ok(tables >= 1 && planes >= 1 && ladders >= 1, `tables ${tables}, planes ${planes}, ladders ${ladders}: each surface met a blocked patient`);
});
