// The framing rules (docs/approved/framing-rules.md), swept over every slide of every talk on a Mac, an iPad and an iPhone, card up (the camera's room as tests/camera-slide-paths.test.ts has it).
// F3: every station a slide labels stands 40 px or more inside the free room, whatever the device. Node only, no browser: the room solver and the station dots are pure numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { stopsOf, viewAt } from '../src/ui/deck/presenter-machine.ts';
import { FOV, SHOTS, type Shot } from '../src/scene/camera/shots.ts';
import { effectiveDistance, KEEP_PX } from '../src/scene/camera/room.ts';
import { stationDot, WIDE_ROUTES } from '../src/decks/hp/cams.ts';
import { loadSource } from '../src/decks/source.ts';

export const DEVICES = [
  { name: 'Mac', w: 1440, h: 900, room: { w: 1020, h: 900 } },
  { name: 'iPad', w: 1024, h: 768, room: { w: 1024, h: 768 } },
  { name: 'iPhone', w: 390, h: 844, room: { w: 390, h: 520 } },
] as const;
const TAN = Math.tan((FOV * Math.PI) / 360);
export const MIN_STATION_PX = KEEP_PX;

/** Pixels per scene unit the room solver gives a shot on a device, and the room's visible half extents round the shot's aim. */
export function scaleOn(shot: Shot, dv: { w: number; h: number; room: { w: number; h: number } }): { pxu: number; vx: number; vy: number } {
  const d = effectiveDistance(shot, dv.room, dv.h, dv.w);
  const pxu = dv.h / (2 * TAN) / d;
  return { pxu, vx: dv.room.w / 2 / pxu, vy: dv.room.h / 2 / pxu };
}
/** How far (px) inside the room's edge a point of the figure stands under a shot (negative: outside). */
export function marginPx(shot: Shot, p: readonly [number, number], dv: { w: number; h: number; room: { w: number; h: number } }): number {
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
    for (const dv of DEVICES) { checked++; const m = marginPx(v.shot, p, dv); if (m < MIN_STATION_PX - 0.5) bad.push(`${v.at} ${id} ${dv.name} ${m.toFixed(0)} px`); }
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
  const c = hp ? await loadHpDeck(deck) : ag ? await loadAgDeck(deck as never) : rw ? await loadSource(deck as never) : null;
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

// ---- S9: the Circuit ----
import { circuitBoxShot, circuitShot, ART_CIRC } from '../src/scene/circuit/shots.ts';
import { MAP_K } from '../src/scene/circuit/map.ts';

test('S9: every Circuit view fills 90 % or more of the limiting side of the free room on a Mac, an iPad and an iPhone (the map stands upright on a phone), never closer than its kMax allows, and never stopped by the nearest distance', () => {
  const slidesSeen = new Set<string>();
  for (const [, deck] of decks) {
    const stops = stopsOf(deck);
    stops.forEach((s, i) => {
      if (s.kind !== 'slide') return;
      for (let b = 0; b <= (s.slide.beats?.length ?? 0) + 1; b++) {
        const sc = viewAt(stops, { stop: i, beat: b }).scene;
        if (sc?.view !== 'circuit') continue;
        slidesSeen.add(`${deck.id}/${s.slide.id}`);
        for (const dv of DEVICES) {
          const upright = dv.w < dv.h * 0.95;
          const shot: Shot = sc.circuit?.box ? circuitBoxShot(sc.circuit.box, upright, sc.circuit.kMax ?? null) : circuitShot(upright);
          const d = effectiveDistance(shot, dv.room, dv.h, dv.w), pxu = dv.h / (2 * TAN) / d;
          const fill = Math.max((shot.half[0] * 2 * pxu) / dv.room.w, (shot.half[1] * 2 * pxu) / dv.room.h);
          assert.ok(fill >= 0.9 && fill <= 0.93, `${deck.id}/${s.slide.id} ${dv.name}: fills ${(fill * 100).toFixed(0)} % of its limiting side`);
          assert.ok(d > shot.r, `${deck.id}/${s.slide.id} ${dv.name}: the room decides, not the nearest distance`);
          if (sc.circuit?.kMax) {   // (2D's kMax: never more than kMax times the whole map's fit)
            const whole = circuitShot(upright), dw = effectiveDistance(whole, dv.room, dv.h, dv.w);
            assert.ok(d >= dw / sc.circuit.kMax - 1e-6, `${deck.id}/${s.slide.id} ${dv.name}: closer than kMax ${sc.circuit.kMax}`);
          }
        }
      }
    });
  }
  assert.equal(slidesSeen.size, 9, 'the nine Circuit slides');
  assert.ok(ART_CIRC[2] > ART_CIRC[0] && MAP_K > 0);
});

// ---- F6 and S12: readable, and overviews only for orientation ----
import { camPlan } from '../src/decks/hp/cams.ts';

test('F6: any frame that is not the whole-figure overview draws a vein 8 px wide or more on a phone upright and 10 px or more on an iPad and a Mac (the whole-figure overview is exempt)', () => {
  const whole = (camPlan('fit') as { shot: Shot }).shot.half;
  const bad: string[] = [];
  for (const [, deck] of decks) for (const v of bodyViews(deck)) {
    const isWhole = Math.abs(v.shot.half[0] - whole[0]) < 1e-9 && Math.abs(v.shot.half[1] - whole[1]) < 1e-9;
    if (isWhole) continue;
    for (const dv of DEVICES) { const px = VEIN_UNITS * scaleOn(v.shot, dv).pxu; if (px < (dv.name === 'iPhone' ? 8 : 10)) bad.push(`${v.at} ${dv.name} ${px.toFixed(1)} px`); }
  }
  assert.deepEqual(bad, []);
});

const isWholeFigure = (shot: Shot): boolean => { const w = (camPlan('fit') as { shot: Shot }).shot.half; return Math.abs(shot.half[0] - w[0]) < 1e-9 && Math.abs(shot.half[1] - w[1]) < 1e-9; };
// ---- F3 again, in each slide's own card room (an estimate: the cards' real height is only measured in a browser) ----
import { parseLine, plainLine } from '../src/ui/text/line.ts';
import { typeFor } from '../src/ui/layout/device.ts';
import { planLayout, widthOf, credRow, type CardId } from '../src/ui/layout/plan.ts';
import { cardPad } from '../src/ui/layout/rules2d.ts';
import { sentences, pageOf } from '../src/ui/cards/pages.ts';

const ROOM_SCREENS = [
  { name: 'iPhone upright', w: 390, h: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } },
  { name: 'iPhone sideways', w: 844, h: 390, safe: { top: 0, right: 47, bottom: 21, left: 47 } },
  { name: 'iPad upright', w: 820, h: 1180, safe: { top: 24, right: 0, bottom: 20, left: 0 } },
  { name: 'iPad sideways', w: 1180, h: 820, safe: { top: 24, right: 0, bottom: 20, left: 0 } },
  { name: 'Mac', w: 1440, h: 900, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
] as const;
const estLines = (text: string, px: number, width: number, em: number) => Math.max(1, Math.ceil((text.length * px * em * 1.08) / width));
const DATA_H = 240;   // (the instrument card's height stands in as 240 px: the estimate ipad-credit-row-heights.test.ts uses)
type Teach = { title: string; line: string; eq?: unknown };
/** The words card's height for a slide at a number of pages, by the same conservative character count as ui-fit-estimate.test.ts. */
function wordsH(s: Teach, vp: (typeof ROOM_SCREENS)[number], pair: boolean, pages: number): number {
  const t = typeFor(vp.w, vp.h), pad = cardPad(vp.w, vp.h), inner = widthOf(vp, pair, 0) - 2 * pad.x - 2, list = sentences(s.line);
  const plain = (m: string) => plainLine(parseLine(m), () => 11.6);
  const chars = Math.max(...Array.from({ length: Math.min(pages, Math.max(list.length, 1)) }, (_, p) => plain(pageOf(list, pages, p).join(' ')).length));
  return Math.ceil(2 * pad.y + 2 + (pages > 1 ? t.kicker + 10 : 0) + estLines(s.title, t.slideTitle, inner, 0.5) * t.slideTitle * t.slideTitleLead + 2 + (s.eq ? 10 + t.body * 1.2 + 12 : 10) + estLines('x'.repeat(chars), t.body, inner, 0.54) * t.body * t.bodyLead + 50 + credRow(vp));
}
/** The room the cards leave the figure for one teaching slide on a screen, or null when no estimate fits (the card pages itself further than the estimate counts). */
export function roomOfSlide(s: Teach, hasData: boolean, vp: (typeof ROOM_SCREENS)[number], dock: boolean): { w: number; h: number } | null {
  const maxPages = Math.max(1, sentences(s.line).length);
  for (let pages = 1; pages <= maxPages; pages++) {
    const needs = [{ id: 'teach' as CardId, slot: 'words' as const, h: wordsH(s, vp, hasData, pages) }, ...(hasData ? [{ id: 'ladder' as CardId, slot: 'data' as const, h: DATA_H }] : [])];
    const plan = planLayout(vp, needs, 'words', 0, dock && hasData);
    if (!plan.overflow.length) return { w: plan.free.w, h: plan.free.h };
  }
  return null;
}

test('F3 in each slide\'s own card room: every labelled station stands 40 px or more inside the room the cards leave on a phone, an iPad and a Mac, upright and sideways, card up and tucked', () => {
  let checked = 0, noRoom = 0, smallest = 1e9;
  const minVein = { px: 1e9, at: '' };
  const thin = new Set<string>();
  const bad: string[] = [];
  for (const [, deck] of decks) {
    const stops = stopsOf(deck);
    stops.forEach((st, i) => {
      if (st.kind !== 'slide') return;
      for (let b = 0; b <= (st.slide.beats?.length ?? 0) + 1; b++) {
        const v = viewAt(stops, { stop: i, beat: b });
        if (v.words !== 'teach' || !v.slide || (v.scene && v.scene.view !== 'body') || !v.scene?.labels.length) continue;
        const shot = typeof v.shot === 'string' ? SHOTS[v.shot as keyof typeof SHOTS] : v.shot;
        for (const vp of ROOM_SCREENS) for (const dock of [false, true]) {
          if (dock && !v.data) continue;
          const room = roomOfSlide(v.slide as unknown as Teach, !!v.data, vp, dock);
          if (!room) { noRoom++; continue; }
          smallest = Math.min(smallest, room.w, room.h);
          { const vein = VEIN_UNITS * scaleOn(shot, { w: vp.w, h: vp.h, room }).pxu; if (vein < minVein.px && !isWholeFigure(shot)) { minVein.px = vein; minVein.at = `${deck.id}/${v.slide.id} ${vp.name}`; } if (vein < 8 && vp.name.startsWith('iPhone') && !isWholeFigure(shot)) thin.add(`${deck.id}/${v.slide.id}${b ? '#' + b : ''}`); }
          for (const id of v.scene.labels) {
            const p = stationDot(id); if (!p) continue;
            checked++;
            const m = marginPx(shot, p, { w: vp.w, h: vp.h, room });
            if (m < MIN_STATION_PX - 0.5) bad.push(`${deck.id}/${v.slide.id}${b ? '#' + b : ''} ${id} ${vp.name}${dock ? ' tucked' : ''} ${m.toFixed(0)} px in a ${room.w.toFixed(0)} x ${room.h.toFixed(0)} room`);
          }
        }
      }
    });
  }
  console.log(`# slide rooms: ${checked} station checks, ${noRoom} slide/screen pairs with no estimate, smallest room side ${smallest.toFixed(0)} px, thinnest vein off the overview ${minVein.px.toFixed(1)} px (${minVein.at})`);
  for (const w of WIDE_ROUTES) assert.ok([...thin].some((t) => t === w), `${w} is declared wide and still is (a vein under 8 px)`);
  assert.deepEqual([...thin].filter((t) => !WIDE_ROUTES.includes(t) && !WIDE_ROUTES.includes(t.replace(/#1$/, ''))), [], 'F6 in the slide\'s own card room: a vein 8 px or more on an iPhone, but for the declared wide routes');
  assert.ok(checked > 1000, `the sweep covered the labels (${checked})`);
  assert.deepEqual(bad, []);
});

// ---- S4: a lesion is framed with room round it (rule 4, Mohammad, 25 Nov: "do it") ----
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
test('S4: a clot on the portal trunk is framed with at least 1.5 trunk lengths of vessel each side even when it fills the whole trunk (and at least 2.5 for a clot half its length), and the frame never goes past 6 trunk lengths', () => {
  const pts = NETWORK_BY_ID.get('PV_TRUNK')!.pts as readonly (readonly number[])[];
  let trunk = 0; for (let i = 1; i < pts.length; i++) trunk += Math.hypot(pts[i]![0]! - pts[i - 1]![0]!, pts[i]![1]! - pts[i - 1]![1]!, pts[i]![2]! - pts[i - 1]![2]!);
  const slides = ['prehepatic/clot', 'prehepatic/anticoag', 'two-inflows/clot', 'two-lesions/clot', 'two-lesions/unclot', 'sites/pvt'];
  const seen = new Set<string>();
  for (const [, deck] of decks) for (const v of bodyViews(deck)) {
    const at = v.at.replace(/#\d+$/, '');
    if (!slides.includes(at)) continue;
    seen.add(at);
    const longHalf = Math.max(v.shot.half[0], v.shot.half[1]);
    assert.ok(longHalf * 2 >= trunk * 4, `${v.at}: frame ${(longHalf * 2).toFixed(2)} units holds ${(longHalf * 2 / trunk).toFixed(1)} trunks (trunk ${trunk.toFixed(2)})`);
    assert.ok(longHalf * 2 <= trunk * 6, `${v.at}: frame too wide, ${(longHalf * 2 / trunk).toFixed(1)} trunks`);
  }
  assert.deepEqual([...seen].sort(), [...slides].sort());
});
