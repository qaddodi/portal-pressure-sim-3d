// Where a slide's camera looks and how big the figure stands in the room the cards leave: the scene's own solver (camera/room.ts effectiveDistance) and lens (FOV), the cards planned by the
// layout's own planner (layout/plan.ts), and a plain perspective projection of any scene point onto the screen. Pure numbers, no DOM and no GPU; the lecture export reads it for the
// wireframe and for the words about zoom. It is a plan of where things should stand, not a measurement of a rendered frame (the cards' heights are estimated, see estimateNeeds).
import { FOV, type Shot } from '../../../scene/camera/shots.ts';
import { effectiveDistance } from '../../../scene/camera/room.ts';
import { planLayout, widthOf, type Need, type Plan } from '../../layout/plan.ts';
import { typeFor } from '../../layout/device.ts';
import type { Rect, Viewport } from '../../layout/device.ts';

export type V3 = readonly [number, number, number];

/** A screen, as the plan wants it: its size and no safe-area inset (the capture's own default; a phone's notch only moves the cards by a few pixels). */
export const viewportOf = (w: number, h: number, safe = { top: 0, right: 0, bottom: 0, left: 0 }): Viewport => ({ w, h, safe });

export interface Framing {
  vp: Viewport;
  plan: Plan;
  /** the room the cards leave the figure (px, screen coordinates) */
  free: Rect;
  /** how far the camera stands from the target (scene units) */
  distance: number;
  /** screen pixels for one scene unit at the target's depth */
  pxPerUnit: number;
  /** the figure's view of a scene point: screen x, y in px and the depth in scene units from the camera (null when the point is behind it) */
  project(p: V3): { x: number; y: number; z: number } | null;
  /** what the free room shows at the target's depth, in scene units: its half width and half height */
  seen: [number, number];
}

/**
 * The camera's right, up and forward for a turn and tilt (the rig's: positive yaw swings the camera to the viewer's right;
 * the camera stands at target + d (sin yaw cos pitch, sin pitch, cos yaw cos pitch)).
 */
function basis(yaw: number, pitch: number, roll = 0): { eye: V3; right: V3; up: V3; fwd: V3 } {
  const eye: V3 = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  const fwd: V3 = [-eye[0], -eye[1], -eye[2]];
  // (right = fwd x worldUp, normalised; up = right x fwd)
  const rx = fwd[1] * 0 - fwd[2] * 1, ry = fwd[2] * 0 - fwd[0] * 0, rz = fwd[0] * 1 - fwd[1] * 0;
  const rl = Math.hypot(rx, ry, rz) || 1;
  const r0: V3 = [rx / rl, ry / rl, rz / rl];
  const u0: V3 = [r0[1] * fwd[2] - r0[2] * fwd[1], r0[2] * fwd[0] - r0[0] * fwd[2], r0[0] * fwd[1] - r0[1] * fwd[0]];
  if (!roll) return { eye, right: r0, up: u0, fwd };
  const c = Math.cos(roll), s = Math.sin(roll);
  const right: V3 = [r0[0] * c + u0[0] * s, r0[1] * c + u0[1] * s, r0[2] * c + u0[2] * s];
  const up: V3 = [u0[0] * c - r0[0] * s, u0[1] * c - r0[1] * s, u0[2] * c - r0[2] * s];
  return { eye, right, up, fwd };
}

/** The plan of the cards on this screen and the figure's framing in the room they leave. `needs` are the cards' heights (estimateNeeds). */
export function framingOf(shot: Shot, vp: Viewport, needs: Need[]): Framing {
  const plan = planLayout(vp, needs);
  const free = plan.free;
  const distance = effectiveDistance(shot, { w: free.w, h: free.h }, vp.h, vp.w);
  const f = vp.h / (2 * Math.tan((FOV * Math.PI) / 360));
  const b = basis(shot.yaw, shot.pitch, shot.roll ?? 0);
  const cx = free.x + free.w / 2, cy = free.y + free.h / 2, t = shot.target;
  const project = (p: V3) => {
    const v: V3 = [p[0] - t[0] - b.eye[0] * distance, p[1] - t[1] - b.eye[1] * distance, p[2] - t[2] - b.eye[2] * distance];
    const z = v[0] * b.fwd[0] + v[1] * b.fwd[1] + v[2] * b.fwd[2];
    if (z <= 0.01) return null;
    const x = v[0] * b.right[0] + v[1] * b.right[1] + v[2] * b.right[2], y = v[0] * b.up[0] + v[1] * b.up[1] + v[2] * b.up[2];
    return { x: cx + (x / z) * f, y: cy - (y / z) * f, z };
  };
  const pxPerUnit = f / distance;
  return { vp, plan, free, distance, pxPerUnit, project, seen: [free.w / 2 / pxPerUnit, free.h / 2 / pxPerUnit] };
}

/** The cards' heights, estimated from their words (nothing is measured in node): the words card from its characters at this screen's type and card width, the data card from what it holds.
 *  The estimate only places the cards on the wireframe; it never judges a card's size. */
export function estimateNeeds(vp: Viewport, words: { title: string; body: string; extra?: number }, data: { kind: 'tiles' | 'tool' | 'table' | 'none'; rows?: number } | null): Need[] {
  const ty = typeFor(vp.w, vp.h), w = widthOf(vp), pad = 2 * 18;
  const lines = (chars: number, px: number) => Math.max(1, Math.ceil((chars * px * 0.5) / Math.max(40, w - pad)));
  const wordsH = Math.round(pad + lines(words.title.length, ty.slideTitle) * ty.slideTitle * ty.slideTitleLead + lines(words.body.length, ty.body) * ty.body * ty.bodyLead + (words.extra ?? 0));
  const needs: Need[] = [{ id: 'teach', slot: 'words', h: wordsH }];
  if (data && data.kind !== 'none') {
    const dataH = data.kind === 'tiles' ? 120 : data.kind === 'table' ? 60 + (data.rows ?? 4) * 36 : Math.round(0.36 * vp.h);
    needs.push({ id: data.kind === 'table' ? 'table' : 'ladder', slot: 'data', h: Math.round(dataH) });
  }
  return needs;
}

/** How much of a box (scene x0,y0 x1,y1, in screen px) stands inside the room, 0 to 1 of the box's area. */
export function inside(r: Rect, b: { x0: number; y0: number; x1: number; y1: number }): number {
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  if (w <= 0 || h <= 0) return 0;
  const ox = Math.max(0, Math.min(b.x1, r.x + r.w) - Math.max(b.x0, r.x)), oy = Math.max(0, Math.min(b.y1, r.y + r.h) - Math.max(b.y0, r.y));
  return (ox * oy) / (w * h);
}
