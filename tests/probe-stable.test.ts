// The Doppler probe picks its place once and holds it (owner, 23 Nov 2026: "the ultrasound probe seems to be jumping around a lot to find its location ... just pick a spot right away and doesn't change so easily unless needed").
// Root cause: the place search (2D fitPose) was re-run every 50 to 150 ms for as long as the slide stood, against inputs that change all the time (the labels it avoids, which settle around the probe; the camera's map; a card's
// glide), and its kept place gave way to "better" whenever a label crossed it or the quieter figure shifted. The place is now chosen once the camera and the cards have landed, then only verified against the cards and the stage
// (labels and the quieter-figure score never move it); it is chosen again only when the vessel or third changes or the cards truly cover it for a moment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { DopplerProbe } from '../src/scene/devices/probes/doppler-probe.ts';
import type { Box, ScreenEnv } from '../src/scene/devices/probes/screen.ts';

const W = 1180, H = 820;
/** A Mac-ish stage with a card on the right; the figure's plane maps with scale `s` about (cx, cy); `labels` are the boxes the probe would like to keep off. */
function rig(state: { s: number; cx: number; cy: number; moving: boolean; cards: Box[]; labels: Box[] }): ScreenEnv {
  return {
    project: (p: Vector3, out) => { out.x = state.cx + p.x * state.s; out.y = state.cy - p.y * state.s; return out; },
    size: () => ({ w: W, h: H }), cards: () => state.cards, avoid: () => state.labels, moving: () => state.moving, presenting: () => true,
  };
}
const CARD: Box = { x0: 760, y0: 80, x1: 1170, y1: 760 };
const places = (d: DopplerProbe): string => { const p = d.standsAt; return p ? `${p.side}|${p.reach}|${p.rev ? 1 : 0}|${p.k}` : ''; };

/** Runs `ms` of frames; `each(t)` perturbs the rig. Returns every distinct place seen after the probe first showed, and how many times it changed. */
function run(edge: string, ms: number, each: (t: number, st: ReturnType<typeof fresh>) => void, d = new DopplerProbe(createShared())): { seen: string[]; changes: number; shown: number; d: DopplerProbe } {
  const st = fresh(); const env = rig(st);
  let now = 0, last = '', changes = 0; const seen: string[] = [];
  for (let t = 0; t < ms; t += 16) {
    now += 16; each(t, st);
    d.update(16, true, edge, null, env, now);
    const pl = places(d);
    if (pl && d.shown > 0 && pl !== last) { if (last) changes++; last = pl; if (!seen.includes(pl)) seen.push(pl); }
  }
  return { seen, changes, shown: d.shown, d };
}
function fresh() { return { s: 560, cx: 380, cy: 760, moving: false, cards: [CARD] as Box[], labels: [] as Box[] }; }

test('the probe shows once the camera and the cards have landed, and takes one place', () => {
  const r = run('PV_TRUNK', 3000, () => undefined);
  assert.equal(r.shown, 1);
  assert.equal(r.seen.length, 1, `places seen: ${r.seen.join(' ')}`);
  r.d.dispose();
});

test('labels coming and going over the probe never move it (they used to: a kept place gave way to one that crossed fewer labels)', () => {
  const d = new DopplerProbe(createShared());
  const r = run('PV_TRUNK', 6000, (t, st) => {
    // a label that settles across the probe's body or its line of sight, blinking as the label solver's own boxes do while they settle around it
    const k = Math.floor(t / 250), b = d.bodyBox, g = d.gateAtScreen;
    if (d.shown < 0.5) { st.labels = []; return; }
    const at = k % 2 ? { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 } : { x: (b.x1 + g.x) / 2, y: (b.y1 + g.y) / 2 };
    st.labels = k % 3 === 2 ? [] : [{ x0: at.x - 60, y0: at.y - 11, x1: at.x + 60, y1: at.y + 11 }];
  }, d);
  assert.equal(r.shown, 1);
  assert.equal(r.changes, 0, `places seen: ${r.seen.join(' ')}`);
  r.d.dispose();
});

test('a camera that glides and then settles: the probe waits for it, picks once, and holds', () => {
  let landedAt = -1;
  const r = run('PV_TRUNK', 6000, (t, st) => {
    const u = Math.min(1, t / 1200);   // a 1.2 s glide: the scale 380 to 560, the figure sliding left
    st.s = 380 + 180 * u * u * (3 - 2 * u); st.cx = 520 - 140 * u * u * (3 - 2 * u); st.moving = u < 1;
    if (u >= 1 && landedAt < 0) landedAt = t;
  });
  assert.equal(r.shown, 1);
  assert.equal(r.changes, 0, `places seen: ${r.seen.join(' ')}`);
  r.d.dispose();
});

test('a small drift of the view (the tilt) and a card edge easing a few px do not move it', () => {
  const r = run('PV_TRUNK', 6000, (t, st) => {
    st.cx = 380 + 3 * Math.sin(t / 700); st.cy = 760 + 2.5 * Math.cos(t / 500); st.s = 560 * (1 + 0.004 * Math.sin(t / 900));
    st.cards = [{ ...CARD, x0: CARD.x0 + 2.5 * Math.sin(t / 400) }];
  });
  assert.equal(r.shown, 1);
  assert.equal(r.changes, 0, `places seen: ${r.seen.join(' ')}`);
  r.d.dispose();
});

test('the stood place does not change with the order things happened in: the same settled layout gives the same place', () => {
  const a = run('PV_TRUNK', 3000, () => undefined), b = run('PV_TRUNK', 3000, (t, st) => { st.moving = t < 900; st.s = t < 900 ? 400 : 560; });
  assert.equal(places(a.d), places(b.d));
  a.d.dispose(); b.d.dispose();
});

test('a card that truly lands over the probe moves it, gliding, and only that once', () => {
  const r = run('PV_TRUNK', 6000, (t, st) => {
    if (t < 2500) return;
    // a new card over the left of the figure, where the probe stands (the stage's left half)
    st.cards = [CARD, { x0: 0, y0: 90, x1: 330, y1: 760 }];
  });
  assert.equal(r.shown > 0.9, true);
  assert.ok(r.changes <= 1, `places seen: ${r.seen.join(' ')}`);
  r.d.dispose();
});

test('a new vessel is a new place; coming back to a vessel is the same place as before', () => {
  const d = new DopplerProbe(createShared());
  const first = run('PV_TRUNK', 2500, () => undefined, d), p1 = places(d);
  assert.equal(first.shown, 1);
  const st = fresh(), env = rig(st);
  let now = 100000;
  for (let t = 0; t < 3000; t += 16) { now += 16; d.update(16, true, 'RHV_IVC', null, env, now); }
  for (let t = 0; t < 3000; t += 16) { now += 16; d.update(16, true, 'PV_TRUNK', null, env, now); }
  assert.equal(d.shown, 1);
  assert.equal(places(d), p1);
  d.dispose();
});

test('turning the figure a little by hand keeps the place, and the probe turns with the vessel smoothly (no step in its angle)', () => {
  const d = new DopplerProbe(createShared());
  let prev = NaN, worst = 0;
  const st = fresh(), base = rig(st);
  let rot = 0;
  const env: ScreenEnv = { ...base, project: (p, out) => { const c = Math.cos(rot), s = Math.sin(rot), x = p.x * st.s, y = -p.y * st.s; out.x = st.cx + x * c - y * s; out.y = st.cy + x * s + y * c; return out; } };
  let now = 0, last = '', changes = 0;
  for (let t = 0; t < 7000; t += 16) {
    now += 16; rot = (8 * Math.PI / 180) * Math.sin(t / 900);   // ±8 degrees, a hand's orbit
    d.update(16, true, 'PV_TRUNK', null, env, now);
    const pl = places(d);
    if (pl && d.shown > 0.99) { if (last && pl !== last) changes++; last = pl; if (!Number.isNaN(prev)) worst = Math.max(worst, Math.abs(((d.stand.ang - prev + 540) % 360) - 180)); prev = d.stand.ang; }
  }
  assert.equal(changes, 0);
  assert.ok(worst < 2, `largest turn in one frame ${worst.toFixed(2)} degrees`);
  d.dispose();
});
