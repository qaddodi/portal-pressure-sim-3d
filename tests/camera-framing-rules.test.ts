// The framing rules (docs/approved/framing-rules.md), swept over every slide of every talk on a Mac, an iPad and an iPhone, card up (the camera's room as tests/camera-slide-paths.test.ts has it).
// F3: every station a slide labels stands 40 px or more inside the free room, whatever the device. Node only, no browser: the room solver and the station dots are pure numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { stopsOf, viewAt } from '../src/ui/deck/presenter-machine.ts';
import { FOV, NARROW_STAGE, SHOTS, type Shot } from '../src/scene/camera/shots.ts';
import { fitDistance } from '../src/scene/camera/room.ts';
import { stationDot } from '../src/decks/hp/cams.ts';

export const DEVICES = [
  { name: 'Mac', w: 1440, h: 900, room: { w: 1020, h: 900 } },
  { name: 'iPad', w: 1024, h: 768, room: { w: 1024, h: 768 } },
  { name: 'iPhone', w: 390, h: 844, room: { w: 390, h: 520 } },
] as const;
const TAN = Math.tan((FOV * Math.PI) / 360);
export const MIN_STATION_PX = 40;

/** Pixels per scene unit the room solver gives a shot on a device, and the room's visible half extents round the shot's aim. */
export function scaleOn(shot: Shot, dv: (typeof DEVICES)[number]): { pxu: number; vx: number; vy: number } {
  const half = dv.w < NARROW_STAGE && shot.halfNarrow ? shot.halfNarrow : shot.half;
  const d = Math.max(shot.r, fitDistance(half, dv.room, dv.h));
  const pxu = dv.h / (2 * TAN) / d;
  return { pxu, vx: dv.room.w / 2 / pxu, vy: dv.room.h / 2 / pxu };
}
/** How far (px) inside the room's edge a point of the figure stands under a shot (negative: outside). */
export function marginPx(shot: Shot, p: readonly [number, number], dv: (typeof DEVICES)[number]): number {
  const { pxu, vx, vy } = scaleOn(shot, dv);
  return Math.min(vx - Math.abs(p[0] - shot.target[0]), vy - Math.abs(p[1] - shot.target[1])) * pxu;
}

const decks = await Promise.all((UI.decks as readonly { id: string }[]).map(async (d) => [d.id, (await loadBuiltin(d.id))!] as const));

/** Every body view a talk shows (each slide and each of its beats) with the stations it labels. */
export function bodyViews(deck: Parameters<typeof stopsOf>[0]): { at: string; shot: Shot; labels: string[] }[] {
  const stops = stopsOf(deck), out: { at: string; shot: Shot; labels: string[] }[] = [];
  stops.forEach((s, i) => {
    if (s.kind !== 'slide') return;
    for (let b = 0; b <= (s.slide.beats?.length ?? 0) + 1; b++) {
      const v = viewAt(stops, { stop: i, beat: b });
      if (v.slide !== s.slide && !v.scene) continue;
      if (v.scene && v.scene.view !== 'body') continue;
      const shot = typeof v.shot === 'string' ? SHOTS[v.shot as keyof typeof SHOTS] : v.shot;
      out.push({ at: `${deck.id}/${s.slide.id}${b ? '#' + b : ''}`, shot, labels: v.scene?.labels ?? [] });
    }
  });
  return out;
}

test('F3: every station a slide labels stands 40 px or more inside the free room on a Mac, an iPad and an iPhone', () => {
  let checked = 0;
  const bad: string[] = [];
  for (const [, deck] of decks) for (const v of bodyViews(deck)) for (const id of v.labels) {
    const p = stationDot(id);
    if (!p) continue;
    for (const dv of DEVICES) { checked++; const m = marginPx(v.shot, p, dv); if (m < MIN_STATION_PX) bad.push(`${v.at} ${id} ${dv.name} ${m.toFixed(0)} px`); }
  }
  assert.ok(checked > 300, `the sweep covered the labels (${checked})`);
  assert.deepEqual(bad, []);
});
