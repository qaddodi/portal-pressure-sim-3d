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

// ---- F1: a slide framed on its subject (cams.ts FRAME_FIXES) ----
import { HP_DECKS, loadHpDeck } from '../src/decks/hp/index.ts';
import { AG_IDS, loadAgDeck } from '../src/decks/ag/index.ts';
import { RW_IDS, RW_LOADERS } from '../src/decks/rw/copied/index.ts';
import { FRAME_FIXES } from '../src/decks/hp/cams.ts';
import { boxOfNames, PLACED_ORGAN_BOX } from '../src/scene/anatomy/source.ts';

async function copiedSlide(deck: string, slide: string): Promise<{ cam?: unknown } | undefined> {
  const hp = HP_DECKS.some((d) => d.id === deck), ag = (AG_IDS as readonly string[]).includes(deck), rw = (RW_IDS as readonly string[]).includes(deck);
  const c = hp ? await loadHpDeck(deck) : ag ? await loadAgDeck(deck as never) : rw ? await RW_LOADERS[deck as never]!() : null;
  return (c as unknown as { slides: { id: string; cam?: unknown }[] } | null)?.slides.find((s) => s.id === slide);
}
const shotOfSlide = (deck: string, slide: string): Shot => {
  const d = decks.find(([id]) => id === deck)![1];
  return d.slides.find((s) => s.id === slide)!.scene!.shot;
};

test('F1: each frame fix replaces the camera it says it does (a re-copy that moves the 2D camera is noticed), and the slide plays the fix', async () => {
  for (const [key, fix] of Object.entries(FRAME_FIXES)) {
    const [deck, slide] = key.split('/') as [string, string];
    const s = await copiedSlide(deck, slide);
    assert.ok(s, `${key}: the slide exists`);
    assert.equal(s!.cam, fix.was, `${key}: the copied camera is ${String(fix.was)}`);
    const shot = shotOfSlide(deck, slide);
    assert.ok(shot.half[0] >= fix.floor && shot.half[1] >= fix.floor, `${key}: never tighter than its floor ${fix.floor}`);
  }
});

test('F1: the Budd-Chiari frame holds the hepatic veins and the caudate lobe whole, 12 px inside the room on every device; the stent slides hold the stent and the left portal vein', () => {
  const caudate = PLACED_ORGAN_BOX.caudate!, hv = boxOfNames(['RHV_IVC', 'RHV_IVC_1', 'MHV_IVC', 'LHV_IVC']).box!, stent = boxOfNames(['TIPS']).box!, lpv = boxOfNames(['PVH_L', 'PVH_L_1']).box!;
  const corners = (b: readonly number[]): [number, number][] => [[b[0]!, b[1]!], [b[3]!, b[1]!], [b[0]!, b[4]!], [b[3]!, b[4]!]];
  const need = (what: string, shot: Shot, b: readonly number[]) => { for (const dv of DEVICES) for (const p of corners(b)) assert.ok(marginPx(shot, p, dv) >= 12, `${what} ${dv.name} ${marginPx(shot, p, dv).toFixed(0)} px`); };
  for (const s of ['dx', 'ladder', 'anticoag', 'agent', 'response', 'alf', 'hcc']) { const shot = shotOfSlide('budd-chiari', s); need(`budd-chiari/${s} caudate`, shot, caudate); need(`budd-chiari/${s} hepatic veins`, shot, hv); }
  for (const [d, s] of [['doppler', 'a5'], ['tips-doppler', 'left'], ['tips-doppler', 'warn']] as const) { const shot = shotOfSlide(d, s); need(`${d}/${s} stent`, shot, stent); need(`${d}/${s} left portal vein`, shot, lpv); }
});

// ---- F5: not too close ----
import { CLOSE_UPS, CONTEXT_FLOOR } from '../src/decks/hp/cams.ts';
const VEIN_UNITS = 0.08;   // a vein's width in scene units (radius 0.04)

test('F5: no frame is tighter than the context floor and no vein is wider than a sixth of the room\'s short side, except the declared close-ups; and each close-up still needs its place', () => {
  const need = new Set<string>(), bad: string[] = [];
  for (const [, deck] of decks) for (const v of bodyViews(deck)) {
    const slide = v.at.replace(/#\d+$/, '');
    const under = Math.max(v.shot.half[0], v.shot.half[1]) < CONTEXT_FLOOR - 1e-9;
    const over = DEVICES.some((dv) => VEIN_UNITS * scaleOn(v.shot, dv).pxu > Math.min(dv.room.w, dv.room.h) / 6);
    if (under || over) { if (CLOSE_UPS.includes(slide)) need.add(slide); else bad.push(`${v.at}${under ? ' under the floor' : ''}${over ? ' vein over the cap' : ''}`); }
  }
  assert.deepEqual(bad, [], 'an undeclared close-up');
  assert.deepEqual([...need].sort(), [...CLOSE_UPS].sort(), 'every declared close-up is one');
});
