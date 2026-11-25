import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextFit, FIT_MIN, type FitStep } from '../src/ui/talk/room-fit.ts';

// Capture 52ef8e63, Endoscopy 3 (iPad): room 280, pane 407 at 220 px, the disc ran off the card. Every slide pane (Doppler, FibroScan, endoscope, wall, abdomen) is drawn from one size, fitted here.
const walk = (room: number, asked: number, rest: number, pics: number): number => {
  let cur = asked, prev: FitStep | null = null;
  for (let i = 0; i < 8; i++) {
    const here = { size: cur, h: rest + pics * cur };
    const n = nextFit(room, asked, here, prev);
    prev = here;
    if (n == null) break;
    cur = n;
  }
  return cur;
};
for (const pics of [1, 2, 3]) {
  test(`a pane with ${pics} picture(s) stacked ends inside the room, or at the minimum`, () => {
    for (const asked of [150, 190, 220]) for (const room of [200, 280, 360, 520, 900]) for (const rest of [60, 125, 200]) {
      const size = walk(room, asked, rest, pics), h = rest + pics * size;
      assert.ok(size >= FIT_MIN && size <= asked, `size ${size}`);
      assert.ok(h <= room + 2 || size === FIT_MIN, `${pics}p room ${room} rest ${rest} asked ${asked}: ${h}`);
      if (rest + pics * asked <= room) assert.equal(size, asked, 'a pane that fits is left at its size');
    }
  });
}
test('Endoscopy 3: 280 px of room, a 220 px disc over 125 px of readings', () => assert.equal(walk(280, 220, 125 + 22, 1), 133));
test('pictures beside the readings (height does not follow the size) are left alone; no room is no fit', () => {
  assert.equal(nextFit(280, 220, { size: 200, h: 407 }, { size: 220, h: 407 }), null);
  assert.equal(nextFit(0, 220, { size: 220, h: 407 }, null), null);
});
test('every pane of the slide instrument path is drawn from the fitted size', () => {
  const src = readFileSync(new URL('../src/ui/talk/ToolCardBody.tsx', import.meta.url), 'utf8');
  assert.match(src, /const plot = useRoomFit\(host, room, asked\)/);
  const row = src.split('\n').find((l) => l.includes("kind === 'doppler' ? <DopplerPane"))!;
  assert.match(row, /<DopplerPane \{\.\.\.p\}/); assert.match(row, /<FibroPane \{\.\.\.p\}/); assert.match(row, /<EndoPane \{\.\.\.p\}/); assert.match(row, /<AbdomenPane square=\{p\.square\}/);
});
