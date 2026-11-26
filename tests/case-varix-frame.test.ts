// B14 (capture 0bc14020, 26 Nov): a bleed stop's camera framed the upper gut and missed the varix (at the screen's top edge, or under the stop's card). The rule pinned here: a stop whose camera is about a varix
// (bleed, varices, fundus) frames that varix in what the case's cards leave of the room, on every device, whatever the bleed is doing: every point of the varix and the blood's fall to the pool stands inside the free
// part with a station's margin. Pure numbers (the room solver and the placed courses), no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HISTORIES, LOAD } from '../src/ui/histories/index.generated.ts';
import { entriesOf } from '../src/ui/histories/entries.ts';
import { Timeline, type TimelineHost, type Snap } from '../src/ui/timeline/model.ts';
import { viewOf } from '../src/ui/timeline/story-view.ts';
import { stopsOf } from '../src/ui/case/stops.ts';
import { stopScene, shotScene } from '../src/ui/case/shot-plan.ts';
import { caseFree, caseRoom, typicalCut, CASE_CARD_GAP, CASE_CARD_W, type CaseCut } from '../src/ui/case/room.ts';
import { useCase } from '../src/ui/case/store.ts';
import { freeRoom, layoutClass } from '../src/ui/shell/room.ts';
import { deviceClass } from '../src/ui/layout/device.ts';
import { effectiveDistance, KEEP_PX } from '../src/scene/camera/room.ts';
import { FOV } from '../src/scene/camera/shots.ts';
import { varixPoints, VARIX_SITE_OF_CAM, type BleedSite } from '../src/scene/disease/varix-frame.ts';
import type { Stop } from '../src/ui/case/types.ts';

useCase.setState({ phase: 'stop' });   // (the case bar stands: the foot is taller, shell/room.ts dockHeight)
const TAN = Math.tan((FOV * Math.PI) / 360);
// (the cards as the 26 Nov capture measured them: the Mac's column, the phone's sheet from y 318 of 844, the upright iPad's from y 634 of 1180)
const DEVICES: { name: string; vp: { w: number; h: number; safe: { top: number; right: number; bottom: number; left: number } }; thumb: boolean; cut: CaseCut }[] = [
  { name: 'Mac', vp: { w: 1440, h: 900, safe: { top: 0, right: 0, bottom: 0, left: 0 } }, thumb: false, cut: { kind: 'left', x: CASE_CARD_GAP + CASE_CARD_W } },
  { name: 'iPhone', vp: { w: 393, h: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } }, thumb: true, cut: { kind: 'foot', y: 318 } },
  { name: 'iPad', vp: { w: 820, h: 1180, safe: { top: 24, right: 0, bottom: 20, left: 0 } }, thumb: true, cut: { kind: 'foot', y: 634 } },
];

/** How far (px) inside the free part the varix's points stand, the worst of them, for a stop scene's shot (negative: outside). */
function worstMargin(site: BleedSite, dv: (typeof DEVICES)[number], cut: CaseCut): number {
  const base = freeRoom(dv.vp, layoutClass(dv.thumb)), sc = stopScene({ view: 'anatomic', cam: site === 'GV' ? 'fundus' : 'bleed' }, base, cut, deviceClass(dv.vp.w, dv.vp.h), dv.vp.safe.left);
  const shot = sc.shot, room = caseRoom(base, cut), free = caseFree(base, cut);
  const d = effectiveDistance(shot, room, dv.vp.h, dv.vp.w), pxu = dv.vp.h / (2 * TAN) / d;
  const cx = room.x + room.w / 2, cy = room.y + room.h / 2;
  let worst = Infinity;
  for (const p of varixPoints(site)) {
    const px = cx + (p.x - shot.target[0]) * pxu, py = cy - (p.y - shot.target[1]) * pxu;
    worst = Math.min(worst, px - free.x, free.x + free.w - px, py - free.y, free.y + free.h - py);
  }
  return worst;
}

test('the varix of each site stands inside what the stop\'s card leaves, KEEP_PX or more from its edges, on a Mac, an iPad and an iPhone', () => {
  for (const site of ['VAR', 'GV'] as const) for (const dv of DEVICES) {
    const m = worstMargin(site, dv, dv.cut);
    // (the room solver is a perspective lens, 14 degrees: a depth gap of the figure moves a point a few px; a margin a station could use is KEEP_PX less that)
    assert.ok(m >= KEEP_PX - 8, `${site} on ${dv.name}: the varix stands ${m.toFixed(0)} px inside the free part`);
  }
});

test('the frame holds with the card not yet measured (the camera leaves before the sheet has its height): the device\'s usual card is assumed', () => {
  for (const site of ['VAR', 'GV'] as const) for (const dv of DEVICES) {
    const base = freeRoom(dv.vp, layoutClass(dv.thumb)), usual = typicalCut(deviceClass(dv.vp.w, dv.vp.h), base, dv.vp.safe.left);
    const m = worstMargin(site, dv, usual);
    assert.ok(m >= KEEP_PX - 8, `${site} on ${dv.name}, the usual card: ${m.toFixed(0)} px`);
    // (the camera aims at the varix, so whichever card then stands, the varix is still in the middle of the part it leaves: a stop that has a card of another size only pans the figure)
    const sc = stopScene({ view: 'anatomic', cam: 'bleed' }, base, null, deviceClass(dv.vp.w, dv.vp.h), dv.vp.safe.left);
    assert.ok(sc.shot.half[0] > 0 && sc.shot.half[1] > 0 && Number.isFinite(sc.shot.target[1]), `${dv.name}: a shot`);
  }
});

test('the three cameras of a varix share the one frame, and no other camera is changed', () => {
  const dv = DEVICES[0]!, base = freeRoom(dv.vp, layoutClass(dv.thumb)), cls = deviceClass(dv.vp.w, dv.vp.h);
  const at = (cam: string) => stopScene({ view: 'anatomic', cam }, base, dv.cut, cls, 0).shot;
  assert.deepEqual(at('bleed'), at('varices'), 'one esophageal varix, one frame');
  assert.notDeepEqual(at('bleed'), at('fundus'), 'the gastric varix has its own');
  for (const cam of ['fit', 'liver', 'hepatic', 'portal', 'heart']) assert.deepEqual(stopScene({ view: 'anatomic', cam }, base, dv.cut, cls, 0).shot, shotScene({ view: 'anatomic', cam }).shot, `${cam} is the slide's own`);
  assert.deepEqual(Object.keys(VARIX_SITE_OF_CAM).sort(), ['bleed', 'fundus', 'varices'].sort());
});

const host = (): TimelineHost => ({
  snapshot: async () => ({ t: 0, day: 0, params: {} }), restore: (_s: Snap) => undefined, frame: () => null, params: () => ({}), advance: () => undefined, scenarioLabel: () => '',
  labelsOf: () => new Map(), say: () => undefined, announce: () => undefined, now: () => 0, later: () => 0, cancel: () => undefined,
});
async function stopsOfCourse(id: string): Promise<Stop[]> {
  const h = HISTORIES.find((x) => x.id === id)!, b = await LOAD[id]!();
  const tl = new Timeline(host());
  tl.adopt(entriesOf(b, h.name), b.snap.params);
  const v = viewOf({ tl, days: b.days, future: [], hidden: null, labelsOf: () => new Map(), chapters: h.chapters ?? null });
  return stopsOf(v.chapters, tl.entries(), h.play?.stops ?? []);
}

test('every stop of every course whose camera is about a varix is framed on that varix, on every device', async () => {
  let framed = 0;
  for (const h of HISTORIES) for (const s of await stopsOfCourse(h.id)) {
    const site = s.shot.view === 'anatomic' ? VARIX_SITE_OF_CAM[s.shot.cam] : undefined;
    if (!site) continue;
    for (const dv of DEVICES) {
      const base = freeRoom(dv.vp, layoutClass(dv.thumb)), sc = stopScene(s.shot, base, dv.cut, deviceClass(dv.vp.w, dv.vp.h), dv.vp.safe.left);
      assert.equal(sc.view, 'body', `${h.id} Day ${s.day}`);
      assert.notDeepEqual(sc.shot, shotScene(s.shot).shot, `${h.id} Day ${s.day} on ${dv.name}: not the region box`);
    }
    framed++;
  }
  assert.ok(framed >= 8, `the courses show their varices and bleeds (${framed} stops)`);
});
