// Every tile bar draws the normal range, and its bands wear the colours the rest of the app uses for the same reading (owner, 27 Nov 2026: "tiles should always have the normal values in the
// bars, or what is the point of the bars; and the colour coding, amber, orange, etc."). The WHVP, portal vein and sinusoidal tiles had a bare grey track because ruling C1 took their ratings off
// without keeping their bands: the bar's bands and the tile's rating are one table (src/ui/cards/ratings.ts over the 2D table's SCALE), so a bar can no longer be bare where a normal exists.
// Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE, dirAbs, rateAbs, atShown, RAW } from '../src/ui/deck/from2d/table-marks.js';
import { rateOf, scaleOf, NO_NORMAL, MODEL_BANDED, FLOW_NORMAL } from '../src/ui/cards/ratings.ts';
import { cardOf, tileView } from '../src/ui/cards/tiles-2d.ts';
import { loadSource } from '../src/decks/source.ts';
import { AG_IDS } from '../src/decks/ag/index.ts';
import { HP_IDS } from '../src/decks/hp/index.ts';
import { RW_IDS } from '../src/decks/rw/copied/index.ts';

const KEYS = Object.keys(TILE).filter((k) => scaleOf(k));

test('every tile of every deck draws a bar with a normal (green) band, unless it is listed with the reason none exists', async () => {
  const used = new Set<string>();
  for (const id of [...AG_IDS, ...HP_IDS, ...RW_IDS]) {
    const d = await loadSource(id);
    for (const s of d.slides as never[]) for (const phone of [false, true]) for (const k of cardOf(s, phone).keys) used.add(k);
  }
  const bad: string[] = [];
  for (const k of new Set([...used, ...KEYS])) {
    if (k === 'scope') continue;
    const t = tileView(k, {});
    if (!t.bar) { bad.push(`${k}: no bar at all`); continue; }
    const z = t.bar.zones;
    if (!z.length) { bad.push(`${k}: a bare track${NO_NORMAL[k] ? ' (listed)' : ''}`); continue; }
    // (the bands tile the whole track: no gap, no overlap)
    let at = 0;
    for (const b of z) { if (Math.abs(b.left - at) > 1e-6) bad.push(`${k}: a gap or overlap at ${at}`); at = b.left + b.width; }
    if (Math.abs(at - 100) > 1e-6) bad.push(`${k}: the bands end at ${at}`);
    const normal = z.some((b) => b.rate === 'ok');
    if (!normal && !NO_NORMAL[k]) bad.push(`${k}: no normal band, and not listed in NO_NORMAL`);
    if (normal && NO_NORMAL[k]) bad.push(`${k}: listed in NO_NORMAL but draws a normal band`);
  }
  // (a listed tile's bar is a plain track or has no green band: either way the list says why)
  assert.deepEqual(bad.filter((b) => !/\(listed\)/.test(b)), []);
  for (const [k, why] of Object.entries(NO_NORMAL)) assert.ok(why.length > 20, `${k}: a reason is required`);
});

test('WHVP, portal vein and sinusoidal pressure draw the model\'s bands and the same ones the summary table\'s arrows use', () => {
  for (const k of MODEL_BANDED) {
    const cuts = scaleOf(k)![2];
    assert.ok(cuts.length >= 2, `${k}: normal, high and very high`);
    const z = tileView(k, { [k]: 5 }).bar!.zones.map((b) => b.rate);
    assert.deepEqual(z, ['ok', 'mid', 'hi'], `${k}: green, amber, red`);
    // (the tile's words are plain: never the table's "Severe")
    assert.deepEqual(['ok', 'mid', 'hi'], [0, cuts[0]! + 0.5, cuts[1]! + 0.5].map((v) => rateOf(k, { [k]: v })[0]));
    assert.deepEqual([0, cuts[0]! + 0.5, cuts[1]! + 0.5].map((v) => rateOf(k, { [k]: v })[1]), ['Normal', 'High', 'Very high']);
  }
  // the 16.3 and 16.7 of the owner's capture: both past the second line
  assert.equal(tileView('whvp', { whvp: 16.3 }).rate, 'hi');
  assert.equal(tileView('sin', { sin: 16.7 }).rate, 'hi');
  assert.equal(tileView('whvp', { whvp: 7 }).rate, 'ok');
  // the table's arrows: ↑ past the first line, ↑↑ at the second (table-marks.js RAW)
  for (const k of ['pv', 'whvp'] as const) {
    assert.deepEqual(scaleOf(k)![2], [RAW[k][0], RAW[k][1] + 1], `${k}: the bar's lines are the arrows' lines`);
  }
});

test('the platelet bar\'s normal band starts at the one Baveno VIII line, and the number at or above it is green with no word', () => {
  const z = tileView('plt', { plt: 250 }).bar!.zones;
  assert.deepEqual(z.map((b) => b.rate), ['info', 'ok']);
  assert.deepEqual(rateOf('plt', { plt: 250 }), ['ok', '']);
  assert.deepEqual(rateOf('plt', { plt: 120 }), ['info', '<150']);
});

test('the portal flow bar shows the fasting range (0.9 to 1.3 L/min) the summary table\'s arrows read', () => {
  assert.deepEqual(scaleOf('pvFlow')![2], [0, ...FLOW_NORMAL]);
  assert.deepEqual(tileView('pvFlow', { pvFlow: 1 }).bar!.zones.map((b) => b.rate), ['hi', 'mid', 'ok', 'info']);
  for (const [v, rate] of [[-0.3, 'hi'], [0, 'hi'], [0.5, 'mid'], [1, 'ok'], [1.6, 'info']] as const) assert.equal(rateOf('pvFlow', { pvFlow: v })[0], rate, `${v}`);
});

// Where the tile and the summary table both print a reading the same, they colour it the same. (The table prints a pressure in whole mmHg and the tile in one decimal, so only readings both
// print alike are compared.) The disagreements that remain are listed, each with its reason, so a new one fails here.
const DISAGREE: Record<string, string> = {
  fhvp: 'the tile has one line (red above 8), the table two (amber over 8, red over 16): the owner decides',
  ra: 'the tile has one line (red above 8), the table two (amber over 8, red over 16): the owner decides',
  ivc: 'the tile has one line (red above 8), the table two (amber over 8, red over 16): the owner decides',
  plt: 'ruling C1: the tile says only "<150" (never the table\'s Low or Severe)',
  pvFlow: 'a flow under 0.9 is amber on the tile and, when the trunk is in stasis, red in the table (dirAbs reads the velocity too)',
  clot: 'the tile is red past half the lumen; the table\'s arrows are by grade',
};
test('a tile and the summary table\'s arrow colour the same reading the same', () => {
  const bad: string[] = [];
  for (const k of KEYS) {
    if (DISAGREE[k] || NO_NORMAL[k] || k === 'rpp') continue;
    const s = scaleOf(k)!, T = (TILE as Record<string, { x?: number; d?: number }>)[k]!, x = T.x ?? 1, dg = T.d ?? 1;
    for (let i = 0; i <= 400; i++) {
      const shown = +(s[0] + ((s[1] - s[0]) * i) / 400).toFixed(dg), v = shown / x;
      if (atShown(k, v) !== v) continue;
      const f = { [k]: v, asc: 1000, sbp: 120, pvVel: 20 } as Record<string, number>;
      const t = rateOf(k, f)[0], a = rateAbs(k, dirAbs(k, f));
      if ((t === 'hi' ? 'hi' : t === 'mid' ? 'mid' : null) !== a) { bad.push(`${k} at ${shown}: tile ${t}, arrow ${a}`); break; }
    }
  }
  assert.deepEqual(bad, []);
  for (const [k, why] of Object.entries(DISAGREE)) assert.ok(why.length > 20, `${k}: a reason is required`);
});
