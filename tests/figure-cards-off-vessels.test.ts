// The figure's own cards (a mark's words, the portal blood's split) keep off the vessels (capture 3531bdfa C-D14: "70% bypasses the liver" crossed the paraumbilical vein on 19.7, "0% bypasses the liver"
// sat on the portal vein on 23.2; docs/HUMANIZED-DESIGN.md section 6: "names clear the tube edge"). `placeCards` read the vessels only for the lobule's ring callouts, so every other card stood where the cards
// and the key left room, vessel or not. The body figure's vessels are now part of its sweep (and a grid search within a leader's reach when the sweep leaves one under the words).
// Judged for every slide of every deck on a phone and a Mac, with the real camera, the real card plan, the card plan's own cards and sizes, and the real placer. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { planLayout, BAR, centredKind } from '../src/ui/layout/plan.ts';
import { viewAt, lastSlideShot } from '../src/ui/deck/presenter-machine.ts';
import { SHOTS } from '../src/scene/camera/shots.ts';
import { copiedSlideOf } from '../src/scene/labels/deck-link.ts';
import { figurePlan } from '../src/ui/deck/figure-plan.ts';
import { figureCalls } from '../src/ui/deck/figure-calls.ts';
import { anchorPoint, cardSize, placeCards, isPending, type CardIn } from '../src/scene/labels/figure-cards.ts';
import { tagType } from '../src/scene/labels/cath.ts';
import { vesselLines } from '../src/scene/labels/vessel-lines.ts';
import { onLine } from '../src/scene/labels/solver.ts';
import { rectToBox, type Box } from '../src/scene/labels/geometry.ts';
import { loadDecks, SCREENS, type ScreenName } from './helpers-slide-labels.ts';

const decks = await loadDecks();
const measure = (t: string, size: number, _w?: number, track = 0) => t.length * size * 0.56 + track * t.length;

function sweep(withVessels: boolean) {
  let cards = 0, splits = 0;
  const on: string[] = [];
  for (const [id, stops] of decks) {
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i]!;
      if (s.kind !== 'slide' || (s.slide.scene && s.slide.scene.view !== 'body')) continue;
      const copied = copiedSlideOf(id, s.slide);
      if (!copied) continue;
      for (const sc of Object.keys(SCREENS) as ScreenName[]) {
        const vp = SCREENS[sc], pos = { stop: i, beat: s.slide.vignette || s.slide.question ? 1 : 0 };
        const v = viewAt(stops, pos, lastSlideShot(stops));
        const needs = [{ id: v.words, slot: 'words' as const, h: 300 }, ...(v.data ? [{ id: v.data, slot: 'data' as const, h: 230 }] : [])];
        const plan = planLayout(vp, needs, 'words');
        if (plan.cards.length === 1 && !plan.strip && centredKind(plan.cards[0]!.id) === 'panel') continue;
        const shot = typeof v.shot === 'string' ? SHOTS[v.shot as keyof typeof SHOTS] : v.shot;
        const rig = new CameraRig(shot as never, plan.free); rig.resize(vp.w, vp.h); rig.update(0);
        const project = (p: Vector3, o: { x: number; y: number }) => rig.project(p, o);
        const calls = figureCalls(figurePlan(copied), { fp: { shunt: 0.7 } });
        const t = tagType(vp), p3 = new Vector3(), ins: CardIn[] = [], keep: string[] = [];
        for (const c of calls.cards) {
          if (c.kind === 'step' || isPending(c.text)) continue;
          const p = anchorPoint(c.anchor, p3, undefined, 0.5); if (!p) continue;
          const a = project(p, { x: 0, y: 0 }), z = cardSize(c, t, measure as never);
          ins.push({ id: c.id, x: a.x, y: a.y, w: z.w, h: z.h, below: c.below }); keep.push(c.kind);
        }
        if (!ins.length) continue;
        const view: Box = { x0: vp.safe.left, y0: vp.safe.top + BAR, x1: vp.w - vp.safe.right, y1: vp.h - vp.safe.bottom };
        const blockers = plan.cards.map((c) => rectToBox(c.rect)).concat(plan.strip ? [rectToBox(plan.strip.rect)] : []);
        const lines = vesselLines(project);
        const outs = placeCards(ins, view, blockers, [], [], withVessels ? lines : []);
        outs.forEach((o, n) => {
          if (!o.ok) return;
          cards++; if (keep[n] === 'split') splits++;
          const words: Box = { x0: o.x0, y0: o.y0, x1: o.x0 + ins[n]!.w, y1: o.y0 + ins[n]!.h };
          if (lines.some((l) => onLine(l, words, 0))) on.push(`${id}#${i} ${sc} ${ins[n]!.id}${keep[n] === 'split' ? ' (split)' : ''}`);
        });
      }
    }
  }
  return { cards, splits, on };
}

test('a mark\'s words and the split reading stand off the vessels on every slide, phone and Mac (the count only goes down)', () => {
  const now = sweep(true), before = sweep(false);
  assert.ok(now.cards > 150, `${now.cards} cards judged (${now.splits} splits)`);
  assert.ok(now.on.length < before.on.length, `the vessels are read: ${now.on.length} cards on a vessel, ${before.on.length} without`);
  // (165 of 202 stood on a vessel before; the rest are the big split cards beside a node with no clear place within reach)
  assert.ok(now.on.length <= 25, `${now.on.length} of ${now.cards} cards still on a vessel (${before.on.length} before): ${now.on.slice(0, 10).join('; ')}`);
});
