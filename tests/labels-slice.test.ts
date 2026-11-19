// The HVPG slice's labels on every screen: the real camera, the real card planner, the real stations. The rules the owner set, judged in node:
// labels never under cards, nothing overlapping, nothing dropped that the slide names, callouts standing clear, fades never sliding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { planLayout, BAR, type Plan } from '../src/ui/layout/plan.ts';
import { stopsOf, viewAt, lastSlideShot } from '../src/ui/deck/presenter-machine.ts';
import { HVPG_DECK } from '../src/decks/hvpg.ts';
import { LabelController, NO_STATE, type LabelDeps } from '../src/scene/labels/controller.ts';
import { labelsAt } from '../src/scene/labels/deck-link.ts';
import { rectToBox, hits, grow, type Box } from '../src/scene/labels/geometry.ts';
import { STATIONS } from '../src/scene/labels/stations.ts';
import { FADE } from '../src/scene/labels/alpha.ts';
import { dockKey } from '../src/scene/labels/key-dock.ts';
import { Vector3 } from 'three';
import { CATHETER_ROUTE } from '../src/scene/catheter.ts';

const SCREENS = {
  mac: { w: 1280, h: 800, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  'ipad-landscape': { w: 1180, h: 820, safe: { top: 24, right: 0, bottom: 20, left: 0 } },
  'ipad-portrait': { w: 820, h: 1180, safe: { top: 24, right: 0, bottom: 20, left: 0 } },
  'iphone-portrait': { w: 393, h: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } },
  'iphone-landscape': { w: 852, h: 393, safe: { top: 0, right: 59, bottom: 21, left: 59 } },
} as const;

const stops = stopsOf(HVPG_DECK);
const measure: LabelDeps['measure'] = (t, size, _w, track = 0) => t.length * size * 0.56 + track * t.length;

function harness(screen: keyof typeof SCREENS, stop: number, beat = 0) {
  const vp = SCREENS[screen];
  const pos = { stop, beat };
  const view = viewAt(stops, pos, lastSlideShot(stops));
  const needs = [{ id: view.words, slot: 'words' as const, h: view.words === 'title' ? 420 : 300 }, ...(view.data ? [{ id: view.data, slot: 'data' as const, h: 230 }] : [])];
  const plan: Plan = planLayout(vp, needs, 'words');
  const rig = new CameraRig(view.shot, plan.free); rig.resize(vp.w, vp.h); rig.update(0);
  const cath = labelsAt(stops, pos).cath;
  const adv = cath ? 1 : 0, balloon = cath === 'wedge' || cath === 'result' ? 1 : 0;
  const curve = new CameraRigCurve();
  let t = 1000, moving = false;
  const blockers = plan.cards.map((c) => rectToBox(c.rect)).concat(plan.strip ? [rectToBox(plan.strip.rect)] : []);
  const deps: LabelDeps = {
    now: () => t, project: (p, o) => rig.project(p, o), cameraMoving: () => moving,
    free: () => rectToBox(plan.free), view: () => ({ x0: vp.safe.left, y0: vp.safe.top + BAR, x1: vp.w - vp.safe.right, y1: vp.h - vp.safe.bottom }),
    vp: () => vp, reversed: () => false, words: () => plan.cards.find((c) => c.slot === 'words')?.rect ?? null,
    blockers: () => blockers, measure, pressure: (n) => (n.length * 1.7) % 20, reading: (k) => ({ whvp: 16.2, fhvp: 5.1, hvpg: 11.1 } as Record<string, number>)[k] ?? null,
    cathere: (tip: Vector3, ahead: Vector3) => { if (!adv) return 0; curve.end(tip, ahead); return balloon ? 2 : 1; },
  };
  const ctl = new LabelController(deps);
  const lab = labelsAt(stops, pos);
  ctl.setState({ ...NO_STATE, named: lab.named, cath: lab.cath });
  const settle = (ms = 1200) => { for (let i = 0; i < ms / 16; i++) { t += 16; ctl.tick(); } };
  return { ctl, settle, blockers, vp, plan, lab, rig, setMoving: (m: boolean) => { moving = m; }, advance: (ms: number) => { t += ms; } };
}
class CameraRigCurve {
  end(tip: Vector3, ahead: Vector3) {
    const [x, y, z] = CATHETER_ROUTE[CATHETER_ROUTE.length - 1]; tip.set(x, y, z);
    const [px, py, pz] = CATHETER_ROUTE[CATHETER_ROUTE.length - 2];
    ahead.set(x - px, y - py, z - pz).normalize().multiplyScalar(0.4).add(tip);
  }
}

for (const [name, vp] of Object.entries(SCREENS) as [keyof typeof SCREENS, (typeof SCREENS)[keyof typeof SCREENS]][]) {
  stops.forEach((s, i) => {
    const what = s.kind === 'slide' ? s.slide.id : s.kind;
    test(`${name} / ${what}: labels clear of cards, in the view, none overlapping, none dropped, named parts shown`, () => {
      // a slide in the lobule or sinusoid view has no body labels to judge (those views carry their own, B8)
      if (s.kind === 'slide' && s.slide.scene && s.slide.scene.view !== 'body') return;
      const h = harness(name, i, s.kind === 'slide' && s.slide.vignette ? 1 : 0);
      h.settle();
      const view: Box = { x0: vp.safe.left, y0: vp.safe.top + BAR, x1: vp.w - vp.safe.right, y1: vp.h - vp.safe.bottom };
      // a small screen may drop the least important stations (the 2D app does too); never one the slide names, and never the portal vein
      // (On the sideways iPhone the wallet's card stays centred as in 2D, leaving two strips beside it; a name that would fall under the card
      // drops or fades there and is never kept by moving the card: so there, only what is shown is judged, and the strips still carry labels.)
      const never = new Set([...h.lab.named, 'CONF']);
      // Under the HVPG catheter the figure's names are hidden, as in 2D (`cath-on`): its cards stand alone.
      if (h.lab.cath) assert.equal(h.ctl.out.filter((d) => d.kind === 'station').length, 0, 'the names are hidden under the catheter');
      else {
        if (name !== 'iphone-landscape') assert.deepEqual(h.ctl.dropped.filter((d) => never.has(d)), [], `a named station or the portal vein was dropped (${h.ctl.dropped})`);
        assert.ok(h.ctl.out.length >= (name === 'iphone-landscape' ? 2 : 3), `only ${h.ctl.out.length} labels shown`);
      }
      const boxes = h.ctl.out.map((d) => ({ id: d.id, box: { x0: d.x, y0: d.y, x1: d.x + d.w, y1: d.y + d.h } as Box }));
      for (const { id, box } of boxes) {
        for (const c of h.blockers) assert.ok(!hits(box, c), `${id} stands under a card`);
        assert.ok(box.x0 >= view.x0 - 0.01 && box.y0 >= view.y0 - 0.01 && box.x1 <= view.x1 + 0.01 && box.y1 <= view.y1 + 0.01, `${id} left the view`);
      }
      for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) assert.ok(!hits(boxes[a].box, grow(boxes[b].box, 2)), `${boxes[a].id} overlaps ${boxes[b].id}`);
      for (const n of h.lab.named) {
        if (h.lab.cath) break;
        const st = STATIONS.find((x) => x.id === n)!;
        const shown = h.ctl.out.some((d) => d.id === st.id), hidden = h.ctl.hiddenIds.includes(st.id);
        assert.ok(shown || hidden, `${n} is named by the slide but neither shown nor hidden`);
      }
      // the catheter's reading cards: the slide's cards all stand (none dropped), in the view, never on one another, and clear of the screen's cards
      const want = h.lab.cath === 'free' ? 1 : h.lab.cath === 'wedge' ? 2 : h.lab.cath === 'result' ? 1 : 0;
      const calls = h.ctl.cath.pills.length + (h.ctl.cath.sum ? 1 : 0);
      assert.equal(calls, want, 'the slide\'s reading cards stand');
      const cards = h.ctl.cathCards();
      cards.forEach((c, n) => {
        assert.ok(c.x0 >= view.x0 - 0.01 && c.y0 >= view.y0 - 0.01 && c.x1 <= view.x1 + 0.01 && c.y1 <= view.y1 + 0.01, `cath card ${n} left the view`);
        for (let m = n + 1; m < cards.length; m++) assert.ok(!hits(c, grow(cards[m], 2)), `cath card ${n} overlaps ${m}`);
        const under = h.blockers.some((b) => hits(c, b));
        if (name === 'iphone-landscape') {
          // beside the centred wallet card the strips can be narrower than a card: the 2D app then stands it where it covers least, and so do we (never dropped)
          const strip = Math.max(Math.min(...h.blockers.map((b) => b.x0)) - view.x0, view.x1 - Math.max(...h.blockers.map((b) => b.x1)));
          assert.ok(!under || strip < c.x1 - c.x0, `cath card ${n} stands under a card although a strip of ${Math.round(strip)} px is wide enough`);
        } else assert.ok(!under, `cath card ${n} stands under a card`);
      });
      for (const d of h.ctl.out) assert.ok(d.alpha > 0.99 || d.alpha === 0.65 || d.alpha < 1, 'drawn at a sensible opacity');
    });
  });
}

test('labels are hidden while the camera moves and return only after it has stopped for the settle time', () => {
  const h = harness('mac', 10);
  h.settle();
  assert.ok(h.ctl.out.length > 0);
  h.setMoving(true);
  h.settle(300);
  assert.equal(h.ctl.out.length, 0, 'everything has faded out');
  h.setMoving(false);
  h.settle(FADE.settleMs - 40);
  assert.equal(h.ctl.out.length, 0, 'nothing returns before the settle time');
  h.settle(600);
  assert.ok(h.ctl.out.length > 0, 'they come back');
});

test('on the first frame nothing pops in: every label starts invisible and fades up', () => {
  const h = harness('mac', 10);
  let first = -1;
  for (let i = 0; i < 100; i++) { h.advance(16); h.ctl.tick(); if (h.ctl.out.length && first < 0) { first = i; assert.ok(h.ctl.out.every((d) => d.alpha < 0.2), 'the first drawn frame is nearly transparent'); } }
  assert.ok(first > 0);
});

test('a slide that names parts of the figure dims the others to 65 %; with nothing named nothing is dim', () => {
  const free = harness('mac', 10);      // heart: names RA, IVC, hepatic vein (no catheter: the catheter hides the names)
  free.settle();
  const dimmed = free.ctl.out.filter((d) => d.kind === 'station' && Math.abs(d.alpha - 0.65) < 1e-9).map((d) => d.id);
  const bright = free.ctl.out.filter((d) => d.kind === 'station' && d.alpha === 1).map((d) => d.id);
  assert.ok(dimmed.length > 0 && bright.length > 0, 'some dim, some bright');
  for (const n of free.lab.named) assert.ok(!dimmed.includes(n), `${n} is named and must be bright`);
  const title = harness('mac', 0);
  title.settle();
  assert.ok(title.ctl.out.every((d) => d.alpha === 1), 'nothing named, nothing dim');
});

test('the figure key stands where the 2D app docks it, clear of every label, and fades with the labels', () => {
  for (const screen of Object.keys(SCREENS) as (keyof typeof SCREENS)[]) {
    const h = harness(screen, 3);
    h.ctl.setState({ ...NO_STATE, named: h.lab.named, cath: h.lab.cath, key: 'velocity' });
    h.ctl.setKeyNatural(180, 30); h.ctl.setKeySize(180, 30);
    h.settle();
    const key = h.ctl.out.find((d) => d.kind === 'key')!;
    assert.ok(key, `${screen}: the key is drawn`);
    const want = dockKey({ vp: SCREENS[screen], words: h.plan.cards.find((c) => c.slot === 'words')?.rect ?? null, natural: { w: 180, h: 30 }, wrapped: { w: 180, h: 30 } });
    assert.deepEqual([key.x, key.y, key.w, key.h].map(Math.round), [want.box.x0, want.box.y0, want.box.x1 - want.box.x0, want.box.y1 - want.box.y0].map(Math.round), `${screen}: at its 2D dock`);
    const kb: Box = { x0: key.x, y0: key.y, x1: key.x + key.w, y1: key.y + key.h };
    for (const d of h.ctl.out) if (d.kind !== 'key') assert.ok(!hits(kb, { x0: d.x, y0: d.y, x1: d.x + d.w, y1: d.y + d.h }), `${screen}: ${d.id} overlaps the key`);
    h.setMoving(true); h.settle(300);
    assert.equal(h.ctl.out.length, 0, 'the key fades with the labels while the picture moves');
  }
});
