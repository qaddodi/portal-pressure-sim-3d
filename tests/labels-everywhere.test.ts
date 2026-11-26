// The general rules for what the figure writes on itself, swept over EVERY slide of EVERY deck on a phone (390 x 844) and a Mac (1440 x 900), with the real camera, the real card plan and the real solver (no browser).
// Capture 3531bdfa F-D3 / F-D4 / A-D10 / A-D11: names stood on vessels, and one figure said "mmHg" on some readings and not on others.
//  1. Label boxes are pairwise disjoint, inside the view and off every card.
//  2. A name nobody asked for never stands on a vessel; a name the slide asked for (named, shown) stands clear of every vessel where a clear spot exists (strict pass first, solver.ts `pass`): the few that
//     cannot are counted and the count may only go down. Organ names are drawn on their organ (approved placement, docs/approved/anatomy-placement.md): their count is a ratchet, not a rule, until Mohammad rules.
//  3. Units are consistent per figure: every reading label of a figure says its unit or none does (unit-rule.ts), for a pressure (mmHg) and a flow (L/min) unit.
//  4. A label more than 24 px from the point it names has a leader.
// Not covered (needs the live engine frame or a browser): collaterals and shunts the slide draws, the catheter, the needle, the scope's shaft and the web or band marks (the scope's settled body is a solver blocker at run time, probe-claims.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDecks, slideFigure, SCREENS, type ScreenName } from './helpers-slide-labels.ts';
import { onLine } from '../src/scene/labels/solver.ts';
import { hits } from '../src/scene/labels/geometry.ts';

const decks = await loadDecks();
const isOrgan = (id: string) => id.startsWith('organ:');
/** Budgets (the count today; they only go down). */
const ASKED_ON_VESSEL_MAX = 60;
const ORGAN_ON_VESSEL_MAX = 575;

interface Sweep { slides: number; labels: number; problems: string[]; askedOn: string[]; organOn: number; unasked: string[]; mixed: string[]; noLeader: string[] }

function sweep(unit: string): Sweep {
  const r: Sweep = { slides: 0, labels: 0, problems: [], askedOn: [], organOn: 0, unasked: [], mixed: [], noLeader: [] };
  for (const [id, stops] of decks) {
    for (let i = 0; i < stops.length; i++) {
      for (const sc of Object.keys(SCREENS) as ScreenName[]) {
        const f = slideFigure(id, stops, i, sc, { unit });
        if (!f || f.panel) continue;
        f.settle(800);
        r.slides++;
        const at = `${id}#${i} ${sc}`;
        const out = f.ctl.out.filter((d) => (d.kind === 'station') && !d.ghost && d.alpha > 0.5);
        const boxes = out.map((d) => ({ d, b: { x0: d.x, y0: d.y, x1: d.x + d.w, y1: d.y + d.h } }));
        let withUnit = 0, bare = 0;
        const shown = f.shown;
        for (const { d, b } of boxes) {
          r.labels++;
          if (b.x0 < f.view.x0 - 0.01 || b.y0 < f.view.y0 - 0.01 || b.x1 > f.view.x1 + 0.01 || b.y1 > f.view.y1 + 0.01) r.problems.push(`${at} ${d.id} leaves the view`);
          for (const c of f.blockers) if (hits(b, c)) r.problems.push(`${at} ${d.id} stands under a card`);
          const onN = f.lines.filter((l) => onLine(l, b, 0)).length;
          if (onN > 0) {
            if (isOrgan(d.id)) r.organOn++;
            else if (d.id === 'HA') { /* the hepatic artery keeps the old rule (its name alone) */ } else if (f.named.has(d.id) || shown.has(d.id)) r.askedOn.push(`${at} ${d.id}`);
            else r.unasked.push(`${at} ${d.id}`);
          }
          if (!isOrgan(d.id) && d.anchor) {
            const g = Math.hypot(Math.max(b.x0 - d.anchor.x, 0, d.anchor.x - b.x1), Math.max(b.y0 - d.anchor.y, 0, d.anchor.y - b.y1));
            if (g > 24 && !d.dot) r.noLeader.push(`${at} ${d.id} ${Math.round(g)} px`);
          }
          if (!isOrgan(d.id) && d.value) { if (d.unit) withUnit++; else bare++; }
        }
        for (let a = 0; a < boxes.length; a++) for (let c = a + 1; c < boxes.length; c++) if (hits(boxes[a]!.b, boxes[c]!.b)) r.problems.push(`${at} ${boxes[a]!.d.id} overlaps ${boxes[c]!.d.id}`);
        if (withUnit && bare) r.mixed.push(`${at}: ${withUnit} with ${unit}, ${bare} bare`);
      }
    }
  }
  return r;
}

const mm = sweep('mmHg');

test('every slide, phone and Mac: label boxes are pairwise disjoint, in the view and off every card', () => {
  assert.ok(mm.slides > 600, `${mm.slides} slide figures judged`);
  assert.ok(mm.labels > 3000, `${mm.labels} labels judged`);
  assert.deepEqual(mm.problems, []);
});

test('a name nobody asked for never stands on a vessel; the slide\'s own names stand clear where a clear spot exists (the count only goes down)', () => {
  assert.deepEqual(mm.unasked, []);
  assert.ok(mm.askedOn.length <= ASKED_ON_VESSEL_MAX, `${mm.askedOn.length} asked names on a vessel (budget ${ASKED_ON_VESSEL_MAX}): ${mm.askedOn.slice(0, 12).join('; ')}`);
});

test('organ names on a vessel line: the count of the approved placement may only go down (a question for Mohammad whether they give way)', () => {
  assert.ok(mm.organOn <= ORGAN_ON_VESSEL_MAX, `${mm.organOn} organ names on a vessel line (budget ${ORGAN_ON_VESSEL_MAX})`);
});

test('units are consistent per figure: every reading label says its unit or none does (mmHg and L/min)', () => {
  assert.deepEqual(mm.mixed, []);
  assert.deepEqual(sweep('L/min').mixed, []);
});

test('a label more than 24 px from the point it names has a leader, on every slide', () => {
  assert.deepEqual(mm.noLeader, []);
});

test('the velocity key names the colour most vessels wear: Slow, Normal, Fast, in every look (F-D10)', async () => {
  const { legendFor } = await import('../src/scene/lenses/legend.ts');
  const { LOOK_IDS } = await import('../src/looks/looks.ts');
  for (const look of LOOK_IDS) {
    const g = legendFor('velocity', look, 'healthy');
    assert.deepEqual(g.bar!.nums.map((n) => [n.at, n.text]), [[0, 'Slow'], [50, 'Normal'], [100, 'Fast']], look);
  }
});
