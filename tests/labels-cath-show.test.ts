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

test('a stack whose two points move apart (the camera turns) eases out instead of hanging its leaders in place', () => {
  const show = new CathShow();
  show.solve({ ...base, cath: 'result' }); run(show, 1500);
  assert.ok(show.frame.sum && show.frame.sum.alpha > 0.99);
  show.ride([610, 405], [640, 330]);   // the tip moved 10 px, the point ahead 10 px the other way: the average hides it
  run(show, 400);
  assert.equal(show.frame.sum, null, 'gone while the points disagree with its leaders');
  show.ride([600, 400], [650, 330]);
  run(show, 1500);
  assert.ok((show.frame.sum as { alpha: number } | null)?.alpha! > 0.99, 'back once they agree');
});

test('the EUS-PPG camera pans a little to the left of its shot (23 Nov)', async () => {
  const { eusPan, EUS_PAN } = await import('../src/ui/deck/procs-plan.ts');
  const sh = { yaw: 0, pitch: 0, r: 1, target: [1, 2, 3] as [number, number, number], half: [0.6, 0.5] as [number, number] };
  const p = eusPan(sh)!;
  assert.ok(Math.abs(p.target[0] - (1 - 0.6 * EUS_PAN)) < 1e-9 && p.target[1] === 2 && p.target[2] === 3, 'only x moves, left');
});

test('the EUS-PPG\'s stack stands midway between its two points, beside them, not at the top of the screen (23 Nov)', async () => {
  const { placeMid } = await import('../src/scene/labels/cath.ts');
  const p = placeMid([400, 200], [380, 900], 330, 150, { x0: 0, y0: 56, x1: 1280, y1: 1000 }, []);
  assert.ok(Math.abs(p.y + 75 - 550) < 1, 'centred on the middle of the two points');
  assert.ok(p.x >= 400, 'beside them, clear of both');
  const show = new CathShow();
  show.solve({ ...base, cath: 'result', tip: [400, 200], ahead: [380, 900], band: { x0: 0, y0: 56, x1: 1280, y1: 1000 }, mid: true });
  run(show, 1500);
  const s = show.frame.sum!;
  assert.ok(s.y > 300 && s.y + s.geom.h < 800, `the stack is in the middle, not at the top (y ${s.y})`);
});

test('every stack leader is straight or has a few angular turns, never a curve or a zigzag, whatever the stack\'s place (24 Nov)', async () => {
  const { planLeaders, sumLayout, tagType, placeStack } = await import('../src/scene/labels/cath.ts');
  const t = tagType(vp), r = (kicker: string, v: string) => ({ kicker, value: v, unit: 'mmHg', tone: 'free' as const });
  const band = { x0: 0, y0: 56, x1: 1280, y1: 800 };
  for (const [tip, ahead] of [[[320, 250], [300, 600]], [[300, 600], [320, 250]], [[600, 400], [650, 330]], [[200, 700], [700, 120]], [[640, 400], [640, 410]]] as const) {
    for (const swap of [false, true]) {
      const geom = sumLayout(t, [r('PV', '20.0'), r('HV', '5.2')], r('EUS-PPG', '14.8'), measure, false, swap);
      for (const mid of [false, true]) {
        const at = placeStack(tip, ahead, geom.w, geom.h, band, [], mid);
        const plan = planLeaders([at.x, at.y], geom, [ahead, tip], swap);
        for (const d of plan.d) assert.match(d, /^M[-\d.]+ [-\d.]+( L[-\d.]+ [-\d.]+){1,3}$/, `angular turns only (no curves), got "${d}"`);
      }
    }
  }
});

test('no stack leader crosses any text: neither row, the bracket nor the HVPG card, nor the other leader (24 Nov: the FHVP leader ran through the bracket on an iPhone)', async () => {
  const { placeClean, sumLayout, tagType, placeStack } = await import('../src/scene/labels/cath.ts');
  const { segHitsBox, segsCross } = await import('../src/scene/labels/cath2d/seg-hits.copied.js');
  const r = (kicker: string, v: string, unit = 'mmHg') => ({ kicker, value: v, unit, tone: 'free' as const });
  const cases = [
    { vp: { w: 430, h: 932 }, tip: [230, 514], ahead: [140, 539] },
    { vp: { w: 430, h: 932 }, tip: [140, 539], ahead: [230, 514] },
    { vp: { w: 430, h: 932 }, tip: [300, 560], ahead: [120, 520] },
    { vp: { w: 1280, h: 800 }, tip: [600, 400], ahead: [650, 330] },
    { vp: { w: 1280, h: 800 }, tip: [320, 250], ahead: [300, 600] },
    { vp: { w: 932, h: 430 }, tip: [500, 250], ahead: [420, 200] },
  ] as const;
  for (const c of cases) {
    const band = { x0: 0, y0: 56, x1: c.vp.w, y1: c.vp.h };
    for (const swap of [false, true]) for (const mid of [false, true]) {
      const g0 = sumLayout(tagType(c.vp), [r('WHVP', '16.3'), r('FHVP', '5.2')], r('HVPG', '11.1'), measure, false, swap);
      const at = placeStack(c.tip as never, c.ahead as never, g0.w, g0.h, band, [], mid);
      const { plan, ...at2 } = placeClean(at, g0, [c.ahead as never, c.tip as never], swap, band, []); void at2;
      const g = sumLayout(tagType(c.vp), [r('WHVP', '16.3'), r('FHVP', '5.2')], r('HVPG', '11.1'), measure, false, plan.swap);
      const off = { x: at2.x, y: at2.y };
      const bm = g.rows.map((q) => q.y + q.h / 2);
      const boxes = [...g.rows.map((q) => ({ x: q.x, y: q.y, w: q.w, h: q.h })), { x: g.calc.x, y: g.calc.y, w: g.calc.w, h: g.calc.h }, { x: g.brace.x, y: Math.min(bm[0]!, bm[1]!), w: 6, h: Math.abs(bm[0]! - bm[1]!) }];
      const segs = plan.d.flatMap((d) => { const v = d.match(/-?[\d.]+/g)!.map(Number); return Array.from({ length: v.length / 2 - 1 }, (_, i) => [v[2 * i]!, v[2 * i + 1]!, v[2 * i + 2]!, v[2 * i + 3]!] as [number, number, number, number]); });
      const label = `${c.vp.w}x${c.vp.h} tip ${c.tip} swap ${swap} mid ${mid}`;
      assert.ok(plan.clean, `a clean leader plan exists (${label})`);
      for (const s of segs) for (const b of boxes) {
        // a leader leaves its own row's edge: shrink by 1.5 px so the starting edge is not a hit
        assert.ok(!segHitsBox({ x0: s[0], y0: s[1], x1: s[2], y1: s[3] }, { x0: b.x + 1.5, y0: b.y + 1.5, x1: b.x + b.w - 1.5, y1: b.y + b.h - 1.5 }, 0), `a leader crosses text (${label})`);
      }
      const m = plan.d[0]!.match(/-?[\d.]+/g)!.length / 2 - 1;
      for (const p of segs.slice(0, m)) for (const q of segs.slice(m)) assert.ok(!segsCross(p, q), `the leaders cross (${label})`);
    }
  }
});
