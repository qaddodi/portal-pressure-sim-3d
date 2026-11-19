// The Details face of the vessel and organ card is the 2D app's (card-details.js, copied by scripts/copy-card-details.mjs): every card with a name to tap has details that say something the card does not,
// the numbers they read are real on a real patient, the markup is 2D's class for class, and a tap on the name, Back and Esc are wired (ActionCard.tsx). Mirrors 2D's tests/card-details.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { patient } from '../src/engine/store.ts';
import { cardFor, type Card } from '../src/ui/action/cards.ts';
// (a .tsx cannot load here: Details.tsx's planOf is this one line, its markup is read as text below)
import { detailsPlan, stationName, DETAILS_WORDS } from '../src/ui/action/card-details.copied.ts';
type DetailsPlan = { kicker: string; between: string | null; stats: [string, (f: unknown, c: unknown) => string | null][]; about: string | null; why: string | null };
const planOf = (card: Card): DetailsPlan | null => (card.noDetails ? null : (detailsPlan(card) as DetailsPlan | null));
import { pinned2D } from './two-d-pin.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const fx: J = JSON.parse(readFileSync('tests/fixtures/actions-2d.json', 'utf8'));
const cards: [string, Card][] = [];
for (const e of EDGES as { id: string; kind: string }[]) if (e.kind !== 'wedge') { const c = cardFor({ type: 'edge', id: e.id }); if (c) cards.push([e.id, c]); }
for (const id of ['liver', 'heart', 'varices', 'gastric', 'spleen']) { const c = cardFor({ type: 'organ', id }); if (c) cards.push([id, c]); }
const edgePlan = (id: string): DetailsPlan => planOf(cardFor({ type: 'edge', id })!)!;
const statOf = (id: string, name: string, f: unknown) => edgePlan(id).stats.find(([k]) => k === name)![1](f, null) ?? '';
const frameOf = (id: string) => { const fr = fx.patients[id].frame; patient.reference = fx.patients[id].healthy; return { ...fr, P: Float32Array.from(fr.P), Pf: Float32Array.from(fr.Pf), Q: Float32Array.from(fr.Q), Qf: Float32Array.from(fr.Qf), D: Float32Array.from(fr.D) }; };

test('the vessels and organs have cards, and every one with a name to tap has details: its kind, its words, its Why?, and numbers that are real on a patient', () => {
  assert.ok(cards.length > 60, `${cards.length} cards`);
  for (const preset of Object.keys(fx.patients)) {
    const f = frameOf(preset);
    for (const [id, m] of cards) {
      if (m.noDetails) { assert.equal(planOf(m), null, `${id}: no details`); continue; }
      const plan = planOf(m)!;
      assert.ok(plan, `${id}: details`);
      assert.ok(plan.kicker && (plan.about == null || plan.about.length > 40), `${id}: says what it is, or has no paragraph at all`);
      assert.ok(!plan.about || !/Connects .* → /.test(plan.about), `${id}: no generated filler`);
      assert.equal(plan.why, m.why, `${id}: the card's own Why?`);
      for (const [name, fn] of plan.stats) {
        const text = fn(f, null);
        assert.equal(typeof text, 'string', `${id} ${name}`);
        assert.ok(!/^-?0\.00 WU/.test(text!), `${id} ${name}: a near-zero resistance reads "< 0.01 WU", not "0.00 WU"`);
        assert.ok(text!.length > 0 && !/NaN|undefined|Infinity/.test(text!), `${id} ${name}: "${text}" (${preset})`);
      }
    }
  }
});

test('a vessel\'s details name the two stations its bar reads and leave out what the card already shows', () => {
  const SAID = /^(In|Out)\b|Pressure drop|^Flow$|velocity|^Diameter$|Doppler/i;
  let vessels = 0, organs = 0;
  for (const [id, m] of cards) {
    const plan = planOf(m);
    if (!plan) continue;
    for (const [name] of plan.stats) assert.ok(!SAID.test(name), `${id}: "${name}" is on the card already`);
    if (m.edge) {
      vessels++;
      assert.match(plan.between!, / → /, `${id}: between two stations`);
      const e = (EDGES as { id: string; kind: string; from: string; to: string }[]).find((x) => x.id === m.edge)!;
      assert.notEqual(stationName(e.from), stationName(e.to), `${id}: no segment's two ends read alike`);
      assert.equal(plan.stats[0]![0], 'Resistance', `${id}: resistance first`);
      assert.deepEqual(plan.stats.slice(1).map((x) => x[0]), e.kind === 'collateral' ? ['Recruited'] : e.kind === 'shunt' ? [] : ['Healthy flow'], `${id}: a collateral says how far it has opened, a shunt nothing, else the healthy flow`);
    } else { organs++; assert.equal(plan.between, null, `${id}: an organ has no two ends`); }
  }
  assert.ok(vessels > 50 && organs >= 5, `${vessels} vessels, ${organs} organs`);
});

test('the numbers follow the model: a collateral that has opened says so, and the healthy flow is the reference patient\'s', () => {
  const f = frameOf('cirr-decomp');
  const c2 = statOf('C2', 'Recruited', f);
  assert.match(c2, /^\d+%$/);
  const pv = statOf('PV_TRUNK', 'Healthy flow', f);
  assert.match(pv, /L\/min$/);
  patient.reference = null;
  assert.equal(statOf('PV_TRUNK', 'Healthy flow', f), '—', 'no reference yet: a dash, never NaN');
});

test('the words are the 2D app\'s: its stations, its About paragraphs, its three strings', () => {
  assert.equal(stationName('PVH'), 'Portal vein, at the hilum');
  assert.equal(stationName('CONF'), 'Portal vein, at the confluence');
  const pv = planOf(cardFor({ type: 'edge', id: 'PV_TRUNK' })!)!;
  assert.match(pv.about!, /^Carries about 75% of hepatic blood flow/);
  assert.equal(pv.kicker, 'Vein');
  assert.equal(planOf(cardFor({ type: 'edge', id: 'C2' })!)!.kicker, 'Collateral · C2');
  assert.equal(planOf(cardFor({ type: 'organ', id: 'spleen' })!)!.kicker, 'Organ');
  assert.equal(planOf(cardFor({ type: 'organ', id: 'varices' })!)!.kicker, 'Collateral bed');
  assert.equal(DETAILS_WORDS.between, 'Between');
  assert.equal(DETAILS_WORDS.why, 'Why this value?');
  assert.equal(DETAILS_WORDS.back('Portal vein'), 'Back to Portal vein');
  assert.equal(DETAILS_WORDS.region('Portal vein'), 'Portal vein: details');
});

test('the face is 2D\'s markup, class for class (createCardDetails), and the card wires it: the name opens it, Back and Esc close it, Why? opens the explainer, the glide and the plate are the card\'s', () => {
  const det = readFileSync('src/ui/action/Details.tsx', 'utf8'), card = readFileSync('src/ui/action/ActionCard.tsx', 'utf8');
  for (const c of ['ac-details', 'ad-head', 'ad-back', 'ad-kicker', 'ad-scroll', 'ad-between', 'ad-stats', 'ad-stat', 'ad-v', 'ad-why', 'ad-about']) assert.ok(det.includes(`"${c}`), `Details.tsx has .${c}`);
  assert.match(det, /role="region"/);
  for (const t of ['onClick={onDetails}', 'ac-chev', 'ac-under', 'Escape', 'openWhy', 'glideCard', 'sheet-plate', 'SIDE_FACE_OUT', 'SIDE_DET_IN', 'SIDE_FACE_IN', 'SIDE_DET_OUT']) assert.ok(card.includes(t), `ActionCard.tsx has ${t}`);
  assert.ok(!/requestAnimationFrame/.test(det + card), 'one clock: no raw requestAnimationFrame');
  const css2d = readFileSync('src/ui/css2d/app-03-layouts.css', 'utf8');
  for (const c of ['.ac-details', '.ad-head', '.ad-back', '.ad-kicker', '.ad-scroll', '.ad-between', '.ad-stats', '.ad-stat', '.ad-v', '.ad-why', '.ad-about', '.ac-under']) assert.ok(css2d.includes(c), `the 2D stylesheet styles ${c}`);
  // the lifted .ac-body is absolute in 2D's card; 3D's card keeps the face in its flow (it gives the card its height), as 2D's shelf does: action.css says so
  assert.match(readFileSync('src/ui/action/action.css', 'utf8'), /\.ac-card \.ac-body \{ position: relative; inset: auto;/);
});

test('the copy is the 2D app\'s at the pin (skipped against any other checkout)', (t) => {
  const two = pinned2D('src/ui/card-details.js');
  if (two.skip) return t.skip(two.skip);
  execFileSync('node', ['scripts/copy-card-details.mjs', '--from', two.repo, '--check'], { stdio: 'pipe' });
});
