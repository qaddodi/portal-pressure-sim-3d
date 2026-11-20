// The foot note (the first-run hint "Click a vessel or the liver to change it.", a preset's note) stands above the dock; no name, reading or leader of the lobule, and none of the sinusoid, may stand under
// it (Mohammad's Mac play-test, Budd-Chiari lobule: the hint sat on the Portal venule and Central vein names). The note's rect is measured by the Toast and published (ui/shell/foot-note.ts); the labels
// keep out of it while it shows and the dock (the lobule's names end at 2D's --bot-occ) always.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { buildLobuleCaptions, lobuleLabelView } from '../src/scene/lobule/captions.ts';
import { boxOf, solve } from '../src/scene/labels/solver.ts';
import { crosses, hits } from '../src/scene/labels/geometry.ts';
import { footBlocker, setFootNote, useFootNote } from '../src/ui/shell/foot-note.ts';
import { deviceClass } from '../src/ui/layout/device.ts';
import { layoutVars, viewRoom } from '../src/ui/shell/room.ts';
import { FOOT_GAP, namesFree } from '../src/scene/sinusoid/captions.ts';

const net = buildLobule();
const VPS = [{ w: 800, h: 600, safe: 0 }, { w: 1024, h: 768, safe: 0 }, { w: 1440, h: 900, safe: 0 }, { w: 390, h: 844, safe: 34 }, { w: 844, h: 390, safe: 21 }];
const text = 'Click a vessel or the liver to change it.';

/** The note's rect as shell.css lays it: centred, its bottom --bot-occ + 8 over the foot (and the bottom safe area), up to 420 px wide, 40 px high (two lines on a phone). */
function pill(vp: { w: number; h: number; safe: number }) {
  const d = deviceClass(vp.w, vp.h), occ = parseFloat(layoutVars({ w: vp.w, h: vp.h, safe: { top: 0, right: 0, bottom: vp.safe, left: 0 } }, d)['--bot-occ']!);
  const w = Math.min(420, vp.w - 24, text.length * 7.6 + 46), h = vp.w < 500 ? 64 : 40, y1 = vp.h - vp.safe - occ - 8;
  return { x0: Math.round(vp.w / 2 - w / 2), y0: Math.round(y1 - h), x1: Math.round(vp.w / 2 + w / 2), y1: Math.round(y1) };
}

for (const v of VPS) {
  test(`${v.w}x${v.h}: with the foot note showing, no lobule name, reading or leader stands under it, and none under the dock`, () => {
    const p = pill(v), full = { w: v.w, h: v.h, safe: { top: 0, right: 0, bottom: v.safe, left: 0 } }, d = deviceClass(v.w, v.h);
    const room = viewRoom('lobule', full, d), view = lobuleLabelView(full, 56, room);
    assert.ok(view.y1 <= v.h - v.safe, 'the labels end above the screen foot');
    const free = { x0: room.x, y0: room.y, x1: room.x + room.w, y1: room.y + room.h };
    const pxR = Math.min((free.x1 - free.x0) * 0.86 / 1.732, (free.y1 - free.y0) * 0.9 / 1.732), cx = (free.x0 + free.x1) / 2, cy = (free.y0 + free.y1) / 2;
    const proj = (x: number, y: number): [number, number] => [cx + x * pxR, cy + y * pxR];
    const bl = [footBlocker(p)!];
    const inView = (x: number, y: number) => x > view.x0 + 64 && x < view.x1 - 64 && y > view.y0 + 64 && y < view.y1 - 64 && !bl.some((b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1);
    const c = buildLobuleCaptions({ proj, vp: { w: v.w, h: v.h }, measure: (t: string) => t.length * 6.2, net, layers: { zones: true, lymph: true }, inView });
    const out = solve({ items: c.items, view, blockers: bl, lines: c.lines, keep: c.keep });
    assert.ok(out.placed.length >= 3, 'names are placed');
    for (const pl of out.placed) {
      const it = c.items.find((i) => i.id === pl.id)!, box = boxOf(pl, it.ax, it.ay);
      assert.ok(!hits(box, p), `${pl.id}'s name is clear of the note`);
      assert.ok(box.y1 <= view.y1 + 1e-6, `${pl.id}'s name is above the dock`);
      if (pl.leader) assert.ok(!crosses(it.ax, it.ay, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, p), `${pl.id}'s leader does not cross the note`);
    }
  });

  test(`${v.w}x${v.h}: the sinusoid's names keep over the foot note while it shows, and come back to the whole room when it goes`, () => {
    const p = pill(v), full = { w: v.w, h: v.h, safe: { top: 0, right: 0, bottom: v.safe, left: 0 } }, d = deviceClass(v.w, v.h);
    const room = viewRoom('sinusoid', full, d), plain = namesFree(room, { w: v.w, h: v.h }), withNote = namesFree(room, { w: v.w, h: v.h }, p);
    assert.ok(withNote.b <= p.y0 - FOOT_GAP + 1e-6 || withNote.b <= plain.t + 80, `the names' floor is over the note (${withNote.b} vs ${p.y0})`);
    assert.ok(withNote.b <= plain.b, 'never lower than the room');
    assert.deepEqual({ ...plain, b: 0 }, { ...withNote, b: 0 }, 'only the floor moves');
    assert.equal(namesFree(room, { w: v.w, h: v.h }, null).b, plain.b, 'with no note the whole room is the names\'');
  });
}

test('the published rect: set once per change, cleared when the note goes, with a little air round it for the labels', () => {
  setFootNote({ x0: 10, y0: 20, x1: 110, y1: 60 });
  const a = useFootNote.getState().rect;
  setFootNote({ x0: 10, y0: 20, x1: 110, y1: 60 });
  assert.equal(useFootNote.getState().rect, a, 'an equal rect leaves the store alone');
  assert.deepEqual(footBlocker(a), { x0: 6, y0: 16, x1: 114, y1: 64 });
  setFootNote(null);
  assert.equal(useFootNote.getState().rect, null);
  assert.equal(footBlocker(null), null);
});
