// A head carried on through a join is cut by the tube's end and drawn again, turned, on the next tube: past a turn it shows as a black wedge at the fork (Mohammad, 20 Nov, phone). The links that turn keep no heads through their ends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { INFO, StreamChain, TURN_FULL_COS, TURN_NONE_COS, linkStraightness } from '../src/scene/blood/chain.ts';
import type { Streams } from '../src/scene/blood/streams.ts';

const ids = (EDGES as { id: string }[]).map((e) => e.id);
const still = (v: number) => ({ stream: () => ({ D: 0, vd: 0, vSlow: v, sgn: 1 }), flowOf: () => 5, moving: true }) as unknown as Streams;
type P = readonly (readonly [number, number])[];
const line = (x0: number, y0: number, x1: number, y1: number): P => Array.from({ length: 10 }, (_, i) => [x0 + (x1 - x0) * i / 9, y0 + (y1 - y0) * i / 9] as const);

test('a link that carries straight on keeps its heads, a turn of more than 35 degrees loses them, and the ease between is smooth', () => {
  const parent = line(0, 0, 100, 0);
  assert.equal(linkStraightness(line(100, 0, 200, 0), true, parent, true), 1);
  assert.equal(linkStraightness(line(100, 0, 100, 100), true, parent, true), 0, 'a right-angle fork');
  const mid = linkStraightness(line(100, 0, 100 + 100 * Math.cos(0.4), 100 * Math.sin(0.4)), true, parent, true);
  assert.ok(mid > 0 && mid < 1, `${mid} at 23 degrees`);
  assert.ok(TURN_NONE_COS < TURN_FULL_COS);
  // a vessel drawn against its flow (path start is its downstream end) is read the same way
  assert.equal(linkStraightness(line(200, 0, 100, 0), false, line(100, 0, 0, 0), false), 1);
  assert.equal(linkStraightness(line(100, 100, 100, 0), false, parent, true), 0);
});

test('in the whole network no link that turns by more than 35 degrees keeps weight at its ends', () => {
  const c = new StreamChain();
  const drawn = (id: string) => INFO.some((i) => i?.id === id);
  for (let t = 0; t < 3000; t += 16) c.step(t, still(3), drawn);
  const d = c.texture.image.data as Float32Array, NE = ids.length;
  let turned = 0, straight = 0;
  for (let i = 0; i < NE; i++) {
    if (!(c.weightOf(i) > 0.99)) continue;
    const p = c.parentOf(i), a = INFO[i], b = INFO[p];
    if (!a || !b) continue;
    // (every vessel flows from its path's start here, so the child enters at its from end: row 1, first texel)
    const f = linkStraightness(a.path, true, b.path, true);
    const own = [d[NE * 4 + i * 4]!, d[NE * 4 + i * 4 + 1]!];
    if (f === 0) { turned++; assert.equal(own[0], 0, `${ids[i]} keeps a head through its turn`); } else straight++;
  }
  assert.ok(turned + straight > 5, `${turned + straight} links`);
});
