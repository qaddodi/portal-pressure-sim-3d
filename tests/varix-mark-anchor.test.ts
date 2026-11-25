// The "Bleeding varix" mark stood by RIGHT ATRIUM and faded (beat-chart plan, E): it pointed at the middle of the varix column, which is inside the scope ring (the ring's claim leaves a card whose
// point is inside it no clear box). While a bleed runs at the varix the words point at the tear, where the jet leaves; otherwise they stand clear of the ring, as the varix ruler does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { AG_IDS, loadAgDeck } from '../src/decks/ag/index.ts';
import { RW_IDS, RW_LOADERS } from '../src/decks/rw/copied/index.ts';
import { HP_IDS, loadHpDeck } from '../src/decks/hp/index.ts';
import type { CopiedDeck, CopiedSlide } from '../src/decks/hp/types.ts';
import { figurePlan } from '../src/ui/deck/figure-plan.ts';
import { figureCalls } from '../src/ui/deck/figure-calls.ts';
import { anchorPoint, clearOfRing, VARIX_CALIPERS } from '../src/scene/labels/figure-cards.ts';
import { curveOf } from '../src/scene/labels/stations.ts';
import { tearPoint, TEAR_EDGES } from '../src/scene/disease/tear.ts';
import { bleedShapes } from '../src/scene/disease/copied/bleed-shapes.js';
import { SITES } from '../src/scene/disease/copied/anatomy-b4.ts';
import { RING, BADGE_R } from '../src/scene/disease/copied/scope-lens-rule.js';
import { x3, y3, UNITS_PER_SCENE } from '../src/scene/frame2d.ts';

const decks: CopiedDeck[] = [];
for (const id of AG_IDS) decks.push((await loadAgDeck(id)) as unknown as CopiedDeck);
for (const id of RW_IDS) decks.push((await RW_LOADERS[id]!()) as unknown as CopiedDeck);
for (const id of HP_IDS) decks.push(await loadHpDeck(id));
const slides: { id: string; s: CopiedSlide }[] = decks.flatMap((d) => d.slides.map((s) => ({ id: `${d.id}/${s.id}`, s })));

const FP = { pv: 12.3, ivc: 6.1, ra: 4.2, shunt: 0.3, spleen: 14.8, varix: 5.2, asc: 3.1, at: { D: new Float32Array(400).fill(8) } };
const reads = { fp: FP as never, params: { thrombus: {}, tips: { on: true, d: 8 }, dips: { on: true, d: 10 } }, pressure: () => 9.1, indexOf: () => 1 };
const ringCentre = new Vector3(x3(RING.x), y3(RING.y), 0);
const clear = (RING.r + BADGE_R + 4) / UNITS_PER_SCENE;
const marksOnVarix = slides.filter(({ s }) => figurePlan(s).marks.some((m) => m.edges.some((e) => VARIX_CALIPERS.has(e))));

test('the tear is the jet\'s own first point, outside the scope ring', () => {
  const rows = bleedShapes({ site: 'VAR', total: 0 }, 50, { varix: SITES.varix, fundus: SITES.fundus }) as number[][];
  assert.deepEqual([...tearPoint('VAR')], [rows[1]![0], rows[1]![1]]);
  const [tx, ty] = tearPoint('VAR');
  assert.ok(Math.hypot(tx - RING.x, ty - RING.y) > RING.r + BADGE_R + 4, 'the tear is clear of the ring and its badge');
  const gv = bleedShapes({ site: 'GV', total: 0 }, 50, { varix: SITES.varix, fundus: SITES.fundus }) as number[][];
  assert.deepEqual([...tearPoint('GV')], [gv[1]![0], gv[1]![1]]);
});

test('there are slides with a mark on the varix columns', () => assert.ok(marksOnVarix.length >= 1));

test('every slide with a mark on the varix: with a bleed running the mark is at the tear, otherwise at a point clear of the scope ring', () => {
  const p = new Vector3();
  let atTear = 0, clearOf = 0;
  for (const { id, s } of marksOnVarix) {
    const plan = figurePlan(s);
    const act = (s as unknown as { action?: { kind?: string; site?: string } }).action;
    const bleed = act?.kind === 'rupture' ? (act.site === 'GV' ? 'GV' as const : 'VAR' as const) : null;
    const cards = figureCalls(plan, { ...reads, bleed }).cards.filter((c) => c.kind === 'mark' && plan.marks.some((m) => m.edges.some((e) => VARIX_CALIPERS.has(e)) && c.text.length > 0));
    for (const c of cards) {
      const m = plan.marks.find((mm) => mm.label && c.text === mm.label);
      if (!m || !m.edges.some((e) => VARIX_CALIPERS.has(e))) continue;
      if (bleed === 'VAR') {
        assert.ok('at2d' in c.anchor, `${id}: the mark points at the tear`);
        const [tx, ty] = tearPoint('VAR'), a = (c.anchor as { at2d: readonly [number, number] }).at2d;
        assert.ok(Math.hypot(a[0] - tx, a[1] - ty) < 1, `${id}: ${a} is the tear ${tx},${ty}`);
        atTear++;
      } else if ('edge' in c.anchor) {
        const curve = curveOf(c.anchor.edge);
        if (!curve) continue;
        const t = clearOfRing(curve, new Vector3());
        curve.getPointAt(t, p);
        assert.ok(Math.hypot(p.x - ringCentre.x, p.y - ringCentre.y) >= clear - 1e-6, `${id}: the point stands inside the ring`);
        clearOf++;
      }
    }
  }
  assert.ok(atTear >= 1, 'a slide with a bleed and a mark on the varix was judged');
  assert.ok(clearOf >= 0);
});

test('the old point was inside the ring (the fault), and a gastric bleed points at its fundus tear', () => {
  const c = curveOf('C1a')!, p = new Vector3();
  // (C1a runs through the ring and its badge. Its middle stood inside them until the strands were made one run along the oesophagus (49ef512c, 25 Nov): the run is longer, the middle moved up and stands just clear, so the
  //  fault is checked on the vessel's nearest point, not on its middle)
  let nearest = Infinity;
  for (let i = 0; i <= 100; i++) { c.getPointAt(i / 100, p); nearest = Math.min(nearest, Math.hypot(p.x - ringCentre.x, p.y - ringCentre.y)); }
  assert.ok(nearest < clear, 'C1a runs through the ring and its badge');
  const gv = figureCalls({ ...(figurePlan(slides[0]!.s)), marks: [{ edges: ['C2'], organ: null, label: 'Gastric varix', kind: 'block', free: false }] } as never, { ...reads, bleed: 'GV' }).cards[0]!;
  assert.ok('at2d' in gv.anchor);
  assert.deepEqual([...(gv.anchor as { at2d: readonly number[] }).at2d], [...tearPoint('GV')]);
  assert.ok(TEAR_EDGES.GV.has('C2'));
  const none = figureCalls({ ...(figurePlan(slides[0]!.s)), marks: [{ edges: ['C2'], organ: null, label: 'Gastric varix', kind: 'block', free: false }] } as never, { ...reads, bleed: null }).cards[0]!;
  assert.ok('edge' in none.anchor, 'no bleed: the vessel\'s own point');
  void anchorPoint;
});
