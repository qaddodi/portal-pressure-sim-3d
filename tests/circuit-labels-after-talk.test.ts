// Mohammad, 20 Nov: "no labels on circuit". Root cause: leaving a talk (`openDeck(null)`) left the last slide's card boxes (`boxes.words / data / strip / free`) in the UI store, and every label layer keeps
// its names off those boxes. Free play publishes none, so the stale words card walled off a side of the Circuit for good (a station whose dot stands under a blocker is not named at all: solver rule 6).
// Pinned twice: the store is empty again once a talk is left, and on the Circuit's map the set of names that stand is 2D's (every major station, key level), with no card up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useUi, noBoxes } from '../src/ui/ui-store.ts';
import { rectToBox } from '../src/scene/labels/geometry.ts';
import { buildCaptions, type CapCtx } from '../src/scene/circuit/captions.ts';
import { CIRCUIT_D, CIRCUIT_LABELS, CIRCUIT_NODES, LANE_CAPTIONS, LIVER_INNER } from '../src/scene/circuit/data.copied.ts';
import { courseOf } from '../src/scene/circuit/paths.ts';
import { solve } from '../src/scene/labels/solver.ts';

const card = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

test('leaving a talk takes its cards\' boxes out of the store: free play has none', () => {
  const ui = useUi.getState();
  ui.openDeck({ id: 'x' } as never);
  ui.publishPlan({ cards: [{ slot: 'words', rect: card(20, 120, 360, 300) }, { slot: 'data', rect: card(900, 80, 400, 500) }], strip: { rect: card(0, 700, 1000, 48) }, free: card(380, 0, 520, 800), docked: false } as never);
  const b = useUi.getState().boxes;
  assert.ok(b.words && b.data && b.strip && b.free.w > 0, 'the talk\'s cards are published');
  useUi.getState().openDeck(null);
  const after = useUi.getState().boxes;
  assert.deepEqual(after, noBoxes());
  
  assert.equal(after.words, null); assert.equal(after.data, null); assert.equal(after.strip, null); assert.equal(after.free.w, 0);
  assert.equal(useUi.getState().dockShown, false);
  assert.equal(useUi.getState().roomHint, null);
});

const S = 0.7, OX = 40, OY = 20;
const proj = (x: number, y: number): [number, number] => [OX + x * S, OY + y * S];
const ctx = (): CapCtx => ({
  proj, upright: false, vp: { w: 1000, h: 700 }, measure: (t, size) => t.length * size * 0.55,
  stationOn: (id) => id !== 'VAR' && id !== 'GV', laneDrawn: () => false, view: { x0: 0, y0: 0, x1: 1000, y1: 640 }, liverOpen: false, zoomed: false, compact: false,
  laneCourse: (id) => (CIRCUIT_D[id] ? courseOf(CIRCUIT_D[id]!) : null), station: (id) => CIRCUIT_NODES[id]?.at ?? null,
  res: {}, scale: S, resWidth: () => 5, resLane: () => courseOf(CIRCUIT_D['A_SMA']!), must: new Set(), halfW: () => 5,
});
const lines = (): [number, number, number, number][] => {
  const out: [number, number, number, number][] = [];
  for (const d of Object.values(CIRCUIT_D)) { const c = courseOf(d); for (let i = 1; i < c.length; i++) { const a = proj(c[i - 1]![0], c[i - 1]![1]), b = proj(c[i]![0], c[i]![1]); out.push([a[0], a[1], b[0], b[1]]); } }
  return out;
};

/** 2D (stage-label-solve.js, Circuit): at the Key level, zoomed out, a station is named when its priority is 5 or more (8 on a phone), or it is the hepatic artery; the liver's inner stations wait for a zoom. */
const twoDKey = (): string[] => Object.entries(CIRCUIT_LABELS).filter(([id, k]) => (k.pri >= 5 || id === 'HA') && (!LIVER_INNER.includes(id) || id === 'HA') && id !== 'VAR' && id !== 'GV').map(([id]) => id).sort();

test('the Circuit names every station 2D names at the Key level (free play, no card up), and no name stands under a vessel it names', () => {
  const built = buildCaptions(ctx());
  const out = solve({ items: built.items, view: { x0: 0, y0: 0, x1: 1000, y1: 640 }, blockers: [], lines: lines(), leaderLineCost: 10 });
  const named = new Set(out.placed.filter((p) => built.meta.get(p.id)?.kind === 'station').map((p) => p.id));
  const missing = twoDKey().filter((id) => !named.has(id));
  assert.deepEqual(missing, [], `2D names these at Key; the Circuit left them out: ${missing.join(', ')}`);
  assert.deepEqual(out.hidden, [], 'no station is hidden for want of a clear dot');
});

test('a stale card over a side of the map is what took the names (the failure this pins): with the old words card up, stations under it have no name', () => {
  const built = buildCaptions(ctx());
  const wall = rectToBox(card(0, 40, 300, 560));
  const out = solve({ items: built.items, view: { x0: 0, y0: 0, x1: 1000, y1: 640 }, blockers: [wall], lines: lines(), leaderLineCost: 10 });
  assert.ok(out.hidden.length > 0, 'a station whose dot is under a card is not named: so a card that is not up must not be in the store');
});
