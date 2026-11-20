// The lobule's rest frame on a real screen, for the label tests: the free room 2D gives it (room.ts lobuleRoom), the hexagon's width from the real camera (the same sums the scene's rig uses), the
// dock and the first-run hint pill's rects. Pure numbers; no three.js scene, no DOM.
import { FOV } from '../src/scene/camera/shots.ts';
import { effectiveDistance } from '../src/scene/camera/room.ts';
import { LOBULE_SCALE } from '../src/scene/lobule/frames.ts';
import { LOBULE_R, lobuleShot } from '../src/scene/lobule/shots.ts';
import { lobuleLabelView } from '../src/scene/lobule/captions.ts';
import { footBlocker } from '../src/ui/shell/foot-note.ts';
import { deviceClass } from '../src/ui/layout/device.ts';
import { layoutVars, viewRoom } from '../src/ui/shell/room.ts';
import { BAR } from '../src/ui/layout/plan.ts';

export const SIZES: readonly { w: number; h: number; safe: number; name: string }[] = [
  { w: 390, h: 844, safe: 34, name: 'iPhone 390x844' }, { w: 393, h: 852, safe: 34, name: 'iPhone 393x852' }, { w: 430, h: 932, safe: 34, name: 'iPhone 430x932' },
  { w: 844, h: 390, safe: 21, name: 'iPhone landscape 844x390' }, { w: 1180, h: 820, safe: 0, name: 'iPad 1180x820' }, { w: 1440, h: 900, safe: 0, name: 'Mac 1440x900' },
];
const HINT = 'Click a vessel or the liver to change it.';

export function frame(v: { w: number; h: number; safe: number }) {
  const full = { w: v.w, h: v.h, safe: { top: v.safe && v.w < 500 ? 47 : 0, right: 0, bottom: v.safe, left: 0 } }, d = deviceClass(v.w, v.h);
  const room = viewRoom('lobule', full, d), view = lobuleLabelView(full, BAR, room);
  const D = effectiveDistance(lobuleShot('lobule'), room, v.h, v.w);
  const pxR = (v.h / (2 * Math.tan((FOV * Math.PI) / 360)) / D) * LOBULE_R * LOBULE_SCALE;
  const cx = room.x + room.w / 2, cy = room.y + room.h / 2;
  const proj = (x: number, y: number): [number, number] => [cx + x * pxR, cy + y * pxR];
  // the first-run hint pill as shell.css lays it: centred, its bottom --bot-occ + 8 over the foot, up to 420 px wide, 64 px high on a phone (two lines), else 40
  const occ = parseFloat(layoutVars({ w: v.w, h: v.h, safe: full.safe }, d)['--bot-occ']!);
  const w = Math.min(420, v.w - 24, HINT.length * 7.6 + 46), h = v.w < 500 ? 64 : 40, y1 = v.h - v.safe - occ - 8;
  const pill = { x0: Math.round(v.w / 2 - w / 2), y0: Math.round(y1 - h), x1: Math.round(v.w / 2 + w / 2), y1: Math.round(y1) };
  const blockers = [footBlocker(pill)!];
  return { full, room, view, pxR, proj, pill, blockers, cx, cy };
}
