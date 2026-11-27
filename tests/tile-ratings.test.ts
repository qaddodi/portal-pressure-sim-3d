// What a data-card tile may say about its number (owner, 27 Nov 2026, rulings C1 and C2 on the external review of capture 3531bdfa). One rule for every place that reads a tile's rating
// (src/ui/cards/ratings.ts): the tile, its bar and the colour of a number in the words. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rateOf, rateShown, scaleOf, bandsOf, MODEL_BANDED, PLT_RULE_OUT, RESPONSE_CUT } from '../src/ui/cards/ratings.ts';
import { tileShown } from '../src/ui/deck/from2d/table-marks.js';
import { ratedShown, tileView, respFp } from '../src/ui/cards/tiles-2d.ts';
import { loadSource } from '../src/decks/source.ts';
import { AG_IDS } from '../src/decks/ag/index.ts';
import { HP_IDS } from '../src/decks/hp/index.ts';
import { RW_IDS } from '../src/decks/rw/copied/index.ts';

const NONE = [null, ''];

test('C1: the portal vein, wedged and sinusoidal pressures say "Normal", "High" and "Very high", never the 2D table\'s "Severe", and keep their bar (27 Nov, later)', () => {
  for (const k of MODEL_BANDED) for (const v of [0, 4, 9.5, 12, 16.3, 25, 40]) {
    const [cls, word] = rateOf(k, { [k]: v });
    assert.ok(cls === 'ok' || cls === 'mid' || cls === 'hi', `${k} ${v}`);
    assert.match(word, /^(Normal|High|Very high)$/, `${k} ${v}`);
    assert.deepEqual(rateShown(k, { [k]: v }), rateOf(k, { [k]: tileShown(k, v) }), `${k} ${v} as shown`);
    const t = tileView(k, { [k]: v });
    assert.equal(t.rate, cls, `${k} ${v}: the tile wears the rating's colour`);
    assert.ok(t.bar!.zones.length >= 3, `${k}: the bar draws its bands`);
  }
  assert.equal(bandsOf('sin')!.length, 3);
});

test('C1: platelets say "<150" below the Baveno VIII rule-out line and nothing above it, never "Low" or "Severe"', () => {
  assert.equal(PLT_RULE_OUT, 150);
  for (const v of [82, 50, 20, 149]) assert.deepEqual(rateOf('plt', { plt: v }), ['info', '<150'], `${v}`);
  for (const v of [150, 200, 300]) assert.deepEqual(rateOf('plt', { plt: v }), ['ok', ''], `${v}: green, no word`);
  assert.deepEqual(rateOf('plt', {}), NONE);
  assert.deepEqual(scaleOf('plt')![2], [150], 'the one line on the bar');
  const words = [20, 82, 110, 149, 150, 400].map((v) => ratedShown('plt', { plt: v })[1]).join(' ');
  assert.doesNotMatch(words, /Low|Severe|Mild|Moderate|High/);
});

test('C1: "CSPH" is said only where CSPH can be said (not in a liver with no sinusoidal scar)', () => {
  const cirrhotic = { hvpg: 14, scar: 0.8, lsm: 22, ppg: 14 };
  const sos = { hvpg: 14, scar: 0.05, lsm: 8, ppg: 14 };
  assert.deepEqual(rateOf('hvpg', cirrhotic), ['hi', 'CSPH']);
  assert.deepEqual(rateOf('hvpg', sos), NONE, 'sinusoidal obstruction: portal hypertension, not cirrhotic CSPH');
  assert.deepEqual(rateOf('eus', { ...sos, eus: 14 }), NONE);
  // a scar-free liver below the line keeps its (green) rating: only the red word is taken off
  assert.notDeepEqual(rateOf('hvpg', { hvpg: 3, scar: 0.05, lsm: 4, ppg: 3 }), ['hi', 'CSPH']);
});

test('C1: every tile rating the app prints is the 2D table\'s or one of the ratings above (no word of its own anywhere else)', () => {
  const src = readFileSync(new URL('../src/ui/cards/Line.tsx', import.meta.url), 'utf8') + readFileSync(new URL('../src/ui/cards/tiles-2d.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /from '\.\.\/deck\/from2d\/table-marks\.js'[^;]*\brate(Of|Shown)\b/, 'a rating is asked of ratings.ts, never the 2D table directly');
});

test('C2: the response tile judges the fall by the slide\'s use: 10% primary, 20% (or an HVPG of 12 or less) after a bleed', () => {
  assert.deepEqual(RESPONSE_CUT, { primary: 10, acute: 10, secondary: 20 });
  assert.deepEqual(rateOf('hvpgFall', { hvpgFall: 13, respCut: 10 }), ['ok', '≥10%']);
  assert.deepEqual(rateOf('hvpgFall', { hvpgFall: 13, respCut: 20, respAt: 15 }), ['hi', '<20%'], 'a 13% fall is not a secondary response');
  assert.deepEqual(rateOf('hvpgFall', { hvpgFall: 13, respCut: 20, respAt: 12 }), ['ok', '≤12 mmHg']);
  assert.deepEqual(rateOf('hvpgFall', { hvpgFall: 22, respCut: 20, respAt: 15 }), ['ok', '≥20%']);
  assert.deepEqual(rateOf('hvpgFall', { hvpgFall: 13 }), ['ok', '≥10%'], 'with no rule named it is the primary one');
  assert.deepEqual(scaleOf('hvpgFall', { respCut: 20 })![2], [20], 'the bar\'s line is the same cut');
  assert.deepEqual(scaleOf('hvpgFall', {})![2], [10]);
});

test('C2: respFp carries the slide\'s rule into the tile', () => {
  const s = (rule?: 'primary' | 'acute' | 'secondary') => ({ hvpgResp: true, hvpgRule: rule }) as never;
  assert.equal(respFp(s('secondary'), { hvpg: 15 }, 17)!.respCut, 20);
  assert.equal(respFp(s('primary'), { hvpg: 15 }, 17)!.respCut, 10);
  assert.equal(respFp(s(undefined), { hvpg: 15 }, 17)!.respCut, 10);
  const t = tileView('hvpgFall', respFp(s('secondary'), { hvpg: 15 }, 17)!);
  assert.equal(t.word, '<20%');
  assert.equal(t.rate, 'hi');
});

test('C1 and C2 sweep: every slide with a response tile names its rule', async () => {
  const bad: string[] = [];
  for (const id of [...AG_IDS, ...HP_IDS, ...RW_IDS]) {
    const d = await loadSource(id);
    for (const s of d.slides as { id: string; hvpgResp?: unknown; hvpgRule?: string }[]) {
      if (s.hvpgResp && !s.hvpgRule) bad.push(`${id}/${s.id}: a response tile with no rule`);
    }
  }
  assert.deepEqual(bad, []);
});
