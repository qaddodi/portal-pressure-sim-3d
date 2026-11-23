// The catheter's cards from the case's state to the frame: which stand, where, and how they come, the 2D app's timings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CathShow, calloutsFor, toneOf, type CathIn } from '../src/scene/labels/cath-show.ts';
import { LS } from '../src/scene/labels/type.ts';
import { STACK_MIN_H, SUM_MS, cathLook, cathVars } from '../src/scene/labels/cath.ts';
import { hits } from '../src/scene/labels/geometry.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';

const measure = (t: string, size: number, weight: number, track = 0) => t.length * size * 0.56 * (weight >= 700 ? 1.05 : 1) + track * t.length;
const vp = { w: 1280, h: 800 };
const band = { x0: 0, y0: 56, x1: 1280, y1: 800 };
const text = { f: '5.0', w: '16.5', h: '11.5', hv: 11.5 };
const base: CathIn = { vp, cath: 'free', measure, band, blockers: [], tip: [600, 400], ahead: [650, 330], got: 2, text };

function run(show: CathShow, ms: number, hold = false, step = 16): void { for (let t = 0; t < ms; t += step) show.step(step, hold); }

test('which cards a state shows: FHVP; FHVP and WHVP; then the stack; the route none', () => {
  assert.deepEqual(calloutsFor('free'), ['f']);
  assert.deepEqual(calloutsFor('wedge'), ['f', 'w']);
  assert.deepEqual(calloutsFor('result'), ['s']);
  assert.deepEqual(calloutsFor('route'), []); assert.deepEqual(calloutsFor(null), []);
});

test('the HVPG card takes its band: below 5 normal, 5 to 10 amber, over 10 red (the engine\'s one table)', () => {
  assert.equal(toneOf(3), 'ok'); assert.equal(toneOf(7), 'caution'); assert.equal(toneOf(12), 'danger');
});

test('a card comes in over a surface step with a 6 px rise, never before the catheter is there, and goes in a small step', () => {
  const show = new CathShow();
  show.solve({ ...base, got: 0 }); run(show, 100);
  assert.equal(show.frame.pills.length as number, 0, 'the tip is not there yet');
  show.solve(base);
  show.step(16, false); show.step(16, false);
  assert.ok(show.frame.pills.length === 1 && show.frame.pills[0].alpha < 0.6 && show.frame.pills[0].rise > 2, 'it starts nearly invisible, a few px low');
  run(show, LS.CATH.MS.surface + 50);
  const p = show.frame.pills[0];
  assert.ok(p.alpha > 0.999); assert.ok(p.rise < 0.01);
  show.solve({ ...base, cath: null }); run(show, LS.CATH.MS.small / 2);
  assert.ok(show.frame.pills[0].alpha < 1 && show.frame.pills[0].alpha > 0, 'leaving');
  run(show, 400);
  assert.equal(show.frame.pills.length, 0);
});

test('a tag faded on its own children: the frame holds its words\' box and the point its leader ends on; there is no glass and no pointer in it', () => {
  const show = new CathShow();
  show.solve(base); run(show, 600);
  const p = show.frame.pills[0];
  assert.deepEqual(Object.keys(p).sort(), ['above', 'alpha', 'h', 'id', 'key', 'reading', 'rise', 'to', 'w', 'x', 'y'], 'a tag draws nothing but words, a place and the point it names');
  assert.equal(p.above, true, 'the free reading stands above its point');
  assert.deepEqual(p.to, [600, 400], 'its leader ends on the tip');
  assert.ok(p.y + p.h < 400, 'above the tip');
});

test('the wedged card stands below its point and both stand clear of a screen card', () => {
  const card = { x0: 480, y0: 100, x1: 760, y1: 250 };
  const show = new CathShow();
  show.solve({ ...base, cath: 'wedge', ahead: [720, 520], blockers: [card] }); run(show, 600);
  assert.equal(show.frame.pills.length, 2);
  for (const b of show.cards) assert.ok(!hits(b, card));
  const [a, b] = show.cards; assert.ok(!hits(a, b));
});

test('the result: the cards\' readings travel from where they stood, the bracket and leaders wait 650 ms, the HVPG 750 ms and rises', () => {
  const show = new CathShow();
  show.solve({ ...base, cath: 'wedge' }); run(show, 600);
  const stood = show.frame.pills.map((p) => [p.id, p.x, p.y] as const);
  show.solve({ ...base, cath: 'result' });
  show.step(16, false);
  assert.equal(show.frame.pills.length, 0, 'the cards are the stack\'s rows now');
  let s = show.frame.sum!;
  assert.ok(s, 'the stack stands from the first frame');
  assert.equal(s.lead, 0); assert.equal(s.calcAlpha, 0); assert.equal(s.calcRise, LS.CATH.RISE);
  assert.ok(Math.abs(s.row[0].dx) + Math.abs(s.row[0].dy) > 1 || Math.abs(s.row[1].dx) + Math.abs(s.row[1].dy) > 1, 'a row starts away from its place, where its card was');
  assert.ok(stood.length === 2);
  assert.ok(s.row[0].alpha === 1 && s.row[1].alpha === 1, 'a travelling row is there at once');
  run(show, 300); s = show.frame.sum!; assert.equal(s.lead, 0, 'the bracket waits');
  run(show, SUM_MS.travel - 300 + 20); s = show.frame.sum!;
  assert.equal(s.row[0].dx, 0); assert.equal(s.row[0].dy, 0, 'landed');
  assert.equal(s.lead, 0);
  run(show, 330); s = show.frame.sum!; assert.ok(s.lead > 0 && s.calcAlpha > 0 && s.calcAlpha < 1, 'bracket and HVPG are coming');
  run(show, SUM_MS.travel + 100); s = show.frame.sum!;
  assert.equal(s.lead, 1); assert.equal(s.calcAlpha, 1); assert.equal(s.calcRise, 0);
  assert.equal(s.calc.tone, 'danger'); assert.equal(s.calc.value, '11.5'); assert.equal(s.rows[0].kicker, 'WHVP'); assert.equal(s.rows[1].kicker, 'FHVP');
});

test('a result with no cards before it rises 6 px and fades in instead of travelling', () => {
  const show = new CathShow();
  show.solve({ ...base, cath: 'result' }); show.step(16, false);
  const s = show.frame.sum!;
  assert.ok(s.row[0].alpha < 0.3 && s.row[0].rise > 4 && s.row[0].dx === 0);
  run(show, SUM_MS.travel + 30);
  assert.equal(show.frame.sum!.row[0].alpha, 1);
});

test('the stack box is never shorter than the 2D app\'s (the bracket\'s svg has the default 150 px height there)', () => {
  assert.equal(STACK_MIN_H, 150);
  const show = new CathShow();
  show.solve({ ...base, cath: 'result', band: { x0: 0, y0: 56, x1: 390, y1: 300 } }); run(show, 100);
  const g = show.frame.sum!.geom;
  assert.equal(g.tight, true); assert.ok(g.h >= 150, `tight stack ${g.h}`);
  const r0 = g.rows[0], r1 = g.rows[1];
  assert.ok(r0.y >= 0 && Math.max(r0.y + r0.h, r1.y + r1.h) <= g.h && Math.abs((Math.min(r0.y, r1.y) + Math.max(r0.y + r0.h, r1.y + r1.h)) / 2 - g.h / 2) < 0.01, 'the rows stand centred in it');
});

test('the camera moving fades every card out where it stands; a result that has played does not play again when the picture is still', () => {
  const show = new CathShow();
  show.solve({ ...base, cath: 'result' }); run(show, 2000);
  assert.equal(show.frame.sum!.calcAlpha, 1);
  run(show, 300, true);
  assert.equal(show.frame.sum, null, 'gone while the picture moves');
  show.solve({ ...base, cath: 'result' }); run(show, 100);
  const s = show.frame.sum!;
  assert.ok(s.alpha > 0 && s.lead === 1 && s.calcAlpha === 1 && s.row[0].dx === 0, 'back whole, nothing replays');
});

test('a card that must flip to the other side fades out where it stands and comes in there; one that only moves glides (it never slides across a fade)', () => {
  const show = new CathShow();
  show.solve(base); run(show, 600);
  const was = show.frame.pills[0];
  show.solve({ ...base, tip: [600, 70], blockers: [] }); // the point went under the band's top: its card cannot stand above it any more, so it flips below
  show.step(16, false);
  const during = show.frame.pills[0];
  assert.ok(!during || (during.above === was.above && during.alpha < 1), 'still the old card (riding its point), fading');
  run(show, 1200);
  const now = show.frame.pills[0];
  assert.ok(now && now.alpha === 1 && now.above !== was.above);
  // (a move that keeps its side is the steady-card test's: cath-cards-steady.test.ts)
});

test('the stylesheet and the layer carry the tag: words only, the tones, no opacity on the tag', () => {
  const css = readFileSync('src/scene/labels/labels.css', 'utf8');
  assert.match(css, /\.cl > \* \{ opacity: 0; \}/, 'opacity lives on the children');
  assert.match(css, /\.cl > small, \.cl > b, \.cl > span \{[^}]*-webkit-text-stroke: var\(--lb-halo-w\) var\(--lb-halo\)/, 'every word wears the labels\' halo');
  for (const t of ['free', 'wedge', 'ok', 'caution', 'danger']) assert.match(css, new RegExp(`\\.cl\\[data-tone="${t}"\\]`), `${t} has its ink`);
});

test('every look carries the ink of the free and wedged readings and the three bands; light and soft step toward the text, dark keeps the trace colour', () => {
  for (const l of LOOK_IDS) { const k = cathLook(l); for (const n of ['--cl-hv-ink', '--cl-wedge-ink', '--cl-ok-ink', '--cl-caution-ink', '--cl-danger-ink']) assert.ok(k[n], `${l} ${n}`); }
  assert.match(cathLook('light')['--cl-hv-ink'], /60%/); assert.match(cathLook('soft')['--cl-hv-ink'], /54%/); assert.equal(cathLook('navy')['--cl-hv-ink'], 'var(--cl-hv)');
  assert.ok(cathVars(vp)['--cl-air']);
});

test('the stack\'s order and leaders are the 2D planner\'s: the lower point\'s reading is the lower row, and no leader crosses another or the other row', async () => {
  const { planLeaders, sumLayout, tagType } = await import('../src/scene/labels/cath.ts');
  const t = tagType(vp), rd = (k: string, v: string, tone: 'free' | 'wedge') => ({ kicker: k, value: v, unit: 'mmHg', tone }) as const;
  const geom = sumLayout(t, [rd('WHVP', '16.5', 'wedge'), rd('FHVP', '5.0', 'free')], { kicker: 'HVPG', value: '11.5', unit: 'mmHg', tone: 'danger' }, measure, false, false);
  const tip: [number, number] = [500, 400], ahead: [number, number] = [540, 330];
  const p = planLeaders([700, 300], geom, [ahead, tip], false);
  assert.equal(p.swap, false, 'WHVP\'s point is the higher one: its row is the upper');
  assert.equal(p.clean, true);
  const q = planLeaders([700, 300], geom, [tip, ahead], false);
  assert.equal(q.swap, true, 'the other way round, the other order');
  assert.match(p.d[0], /^M/); assert.deepEqual(p.dots[0], [ahead[0] - 700, ahead[1] - 300]);
  // both orders put a leader on each reading, and the planner reports a cross it could not avoid
  assert.ok(p.d.every((d) => d.split('L').length >= 2));
});
