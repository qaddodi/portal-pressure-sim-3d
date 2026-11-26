// A stop's card in a clinician's words and numbers (Mohammad, 26 Nov, capture 0bc14020 review): (1) an event said in the engine's voice ("Lymph formation exceeds ...", "(index = ΔP·r / w)")
// is said as a physician says it, once, by the event's id; (2) the card and its Look closer read the same HVPG and PPG while the case waits at the stop; (3) before → after leads with what
// the step acts on (a tricuspid repair: the right atrium), by one rule for every step. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HISTORIES, LOAD } from '../src/ui/histories/index.generated.ts';
import { entriesOf } from '../src/ui/histories/entries.ts';
import { Timeline, type TimelineHost } from '../src/ui/timeline/model.ts';
import { viewOf } from '../src/ui/timeline/story-view.ts';
import { dayReadings, actsOn, type Moment } from '../src/ui/timeline/story.ts';
import { ENGINE_VOICE, eventDetail, hasEventWords } from '../src/ui/timeline/event-words.ts';
import { stopReadsOf, setStopSource, withStopReads } from '../src/ui/case/stop-read.ts';
import { sideOf } from '../src/ui/tests/ir/side.ts';
import type { Baked } from '../src/ui/histories/types.ts';

const noop = () => undefined;
const host = (): TimelineHost => ({
  snapshot: async () => ({ t: 0, day: 0, params: {} }), restore: noop, frame: () => null, params: () => ({}), advance: noop, scenarioLabel: () => '',
  labelsOf: () => new Map(), say: noop, announce: noop, now: () => 0, later: () => 0, cancel: noop,
});
async function storyOf(id: string): Promise<{ b: Baked; tl: Timeline; v: ReturnType<typeof viewOf> }> {
  const h = HISTORIES.find((x) => x.id === id)!, b = await LOAD[id]!();
  const tl = new Timeline(host());
  tl.adopt(entriesOf(b, h.name), b.snap.params);
  return { b, tl, v: viewOf({ tl, days: b.days, future: [], hidden: null, labelsOf: () => new Map(), chapters: h.chapters ?? null }) };
}
type Key = Extract<Moment, { type: 'key' }>;

test('11. no event on a card speaks in the engine\'s voice: every baked history, through the page\'s own entries', async () => {
  let seen = 0;
  for (const h of HISTORIES) {
    const { tl } = await storyOf(h.id);
    for (const e of tl.entries()) {
      if (e.kind !== 'event' || !e.detail) continue;
      seen++;
      assert.ok(!ENGINE_VOICE.test(e.detail), `${h.id} Day ${e.day} ${e.evId}: "${e.detail}"`);
    }
  }
  assert.ok(seen > 20);
});

test('11. the lines: the engine\'s sentence becomes a clinical one, its numbers kept', () => {
  assert.equal(eventDetail('RED_WALE', 'Modeled wall stress is approaching the rupture threshold (index = ΔP·r / w).'), 'The wall of the varix is under high tension and close to tearing.');
  assert.equal(eventDetail('ASCITES_FORMING', 'Lymph formation exceeds lymphatic drainage capacity.'), 'Fluid is forming in the abdomen faster than the lymphatics can drain it.');
  assert.equal(eventDetail('LIVER_HYPOPERFUSION', 'Total sinusoidal flow is 55% of normal or less.'), 'Blood flow through the liver is 55% of normal or less.');
  assert.equal(eventDetail('COLL_C7', '5% of splanchnic inflow now takes this route.'), 'About 5% of the splanchnic inflow now runs through this collateral.');
  // (an event already in clinical words, and one with no detail, pass through)
  assert.equal(eventDetail('VARIX_LARGE', 'Diameter ≥5 mm: high-risk varices.'), 'Diameter ≥5 mm: high-risk varices.');
  assert.equal(eventDetail('BLEED_STOPPED', undefined), undefined);
});

test('11. the engine\'s own events: one that speaks in engine words has a line here (a new one fails until it is said)', () => {
  const src = readFileSync(new URL('../src/engine/hales/portal/events.js', import.meta.url), 'utf8');
  const defs = [...src.matchAll(/\{ id: '([A-Z_0-9]+)'[\s\S]*?title: [^\n]*?detail: (`[^`]*`|'[^']*'|null)/g)];
  assert.ok(defs.length >= 18, `read ${defs.length} events`);
  for (const [, id, detail] of defs) if (ENGINE_VOICE.test(detail!)) assert.ok(hasEventWords(id!), `${id} says "${detail}" and has no clinical line`);
  assert.ok(ENGINE_VOICE.test('Modeled wall stress (index = ΔP·r / w)'));
});

test('2. the card and its Look closer read one number: a stop\'s pinned HVPG and PPG are the card\'s "that day" line, for every stop of every course', async () => {
  let n = 0;
  for (const h of HISTORIES) {
    const { v, tl } = await storyOf(h.id);
    for (const m of v.chapters.flatMap((c) => c.moments)) {
      if (m.type === 'quiet' || m.type === 'trimmed') continue;
      const card = dayReadings(v.series, m.day), pin = stopReadsOf(v.series, m.day);
      for (const k of ['hvpg', 'ppg'] as const) {
        const row = card.rows.find((r) => r.k === k);
        assert.equal(pin[k], row?.b, `${h.id} Day ${m.day}: ${k} as the card prints it`);
        n += row ? 1 : 0;
      }
    }
    void tl;
  }
  assert.ok(n > 40);
});

test('2. with a stop pinned, the HVPG card reads the card\'s tenth and its three readings add up; off a stop nothing moves', () => {
  const live = { hvpg: 9.9, whvp: 14.37, fhvp: 4.5, ppg: 12.3, co: 6 };
  setStopSource(null);
  assert.equal(withStopReads(live), live, 'no stop: the same metrics back');
  const reads = { hvpg: 10.1, ppg: 12.4 };
  setStopSource(() => reads);
  const m = withStopReads(live);
  assert.equal(m.hvpg, 10.1); assert.equal(m.ppg, 12.4); assert.equal(m.co, 6);
  assert.equal(withStopReads(live), m, 'the same object for the same metrics and readings (a pane asks every frame)');
  assert.equal(live.hvpg, 9.9, 'the model\'s own metrics are not touched');
  const side = sideOf({ ph: 'idle', t: 0, started: false, blocked: false, blockedNow: false, v: { fhvp: m.fhvp, whvp: m.whvp, hvpg: m.hvpg }, hasFrame: true });
  assert.equal(side.texts.hvpg, '10.1', 'the pane says what the card says');
  assert.equal(Math.round((Number(side.texts.whvp) - Number(side.texts.fhvp)) * 10) / 10, Number(side.texts.hvpg), 'WHVP less FHVP is the HVPG on the pane');
  setStopSource(() => ({ ppg: 11 }));
  const only = withStopReads(live);
  assert.equal(only.hvpg, 9.9, 'a reading the stop does not name stays the model\'s'); assert.equal(only.ppg, 11);
  setStopSource(null);
});

test('12. what a step acts on leads its before → after, by one rule', async () => {
  assert.deepEqual(actsOn(['contractility', 'tr']), ['ra']);
  assert.deepEqual(actsOn(['tips']), ['ppg', 'shunt']);
  assert.deepEqual(actsOn(['occ:C5']), ['shunt', 'ppg']);
  assert.deepEqual(actsOn(['drug:carvedilol']), []);
  const { v } = await storyOf('hist-cardiac');
  const repair = v.chapters.flatMap((c) => c.moments).find((m): m is Key => m.type === 'key' && m.day === 120)!;
  assert.equal(repair.nums.mode, 'change');
  assert.equal(repair.nums.rows[0]?.k, 'ra', 'a tricuspid repair says the right atrium first');
  const ra = repair.nums.rows[0]!;
  assert.ok(ra.a! > ra.b, `RA falls (${ra.a} → ${ra.b})`);
  // (the record's step is there: the line is not smoothed across the repair, which dropped the RA from 17.4 to 14.4, not by 0.9)
  assert.ok(ra.a! - ra.b > 2.5, `the whole step is said (${ra.a} → ${ra.b})`);
  // every change that acts on a reading and moved it says that reading first, in every course
  for (const h of HISTORIES) {
    const { v: vv, tl } = await storyOf(h.id);
    for (const m of vv.chapters.flatMap((c) => c.moments)) {
      if (m.type !== 'key' || m.nums.mode !== 'change') continue;
      const keys = m.ids.flatMap((i) => (tl.entries()[i]?.kind === 'change' && !tl.entries()[i]?.action ? tl.entries()[i]?.keys ?? [] : []));
      const focus = actsOn(keys), top = m.nums.rows.find((r) => focus.includes(r.k));
      if (top) assert.equal(m.nums.rows.findIndex((r) => focus.includes(r.k)), 0, `${h.id} Day ${m.day}: ${top.k} leads`);
    }
  }
});

test('12. the right atrium is for the steps that act on it: a day\'s card keeps the portal readings', async () => {
  for (const h of HISTORIES) {
    const { v } = await storyOf(h.id);
    for (const m of v.chapters.flatMap((c) => c.moments)) if (m.type === 'key' && m.nums.mode === 'day') assert.ok(!m.nums.rows.some((r) => r.k === 'ra'), `${h.id} Day ${m.day}`);
  }
});
