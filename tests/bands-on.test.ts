// How many bands are on (review of capture 0bc14020, B8: "PSVD reads Bands 1, 1, 2 after sessions 1, 2, 3"). The engine's band count is a fraction that wears off a little each day, and the
// readout rounded it to the nearest, so a band placed on top of a remnant did not show (1.44 read 1). One rule (action/bands-on.ts), used by every reader; these pin the rule, not one course.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/hales/portal/engine.js';
import { HISTORIES, LOAD } from '../src/ui/histories/index.generated.ts';
import { bandsPlaced } from '../src/ui/action/bands-on.ts';
import { readingsOf } from '../src/ui/tests/endo/readings.ts';
import { captionOf } from '../src/ui/scope/scope-caption.ts';
import { actionAnswer } from '../src/ui/action/send.ts';
import { bandsOn } from '../src/ui/tests/feed.ts';

const varix = { present: true, grade: { label: 'Large' }, d: 6, w: 0.4, ptm: 18, air: undefined, redWale: false };
const frame = (bands: number) => ({ bands, metrics: { varix } });

test('a band with any of it left is on: the count is rounded up, and float dust makes no band', () => {
  assert.deepEqual([0, 1e-9, 0.2, 0.44, 1, 1.44, 1.88, 3.2, 4].map(bandsPlaced), [0, 0, 1, 1, 1, 2, 2, 4, 4]);
  assert.equal(bandsPlaced(undefined), 0);
  assert.equal(bandsPlaced(NaN), 0);
});

test('every reader of the count says the same number (the readout, the caption, the Band answer, the Days record)', () => {
  for (const b of [0, 0.3, 0.88, 1, 1.44, 1.88, 2.2, 3.5]) {
    const n = bandsPlaced(b);
    assert.equal(readingsOf(frame(b))!.bands, n, `readout at ${b}`);
    assert.equal(bandsOn(b), n, `record at ${b}`);
    assert.equal(captionOf(frame(b)).endsWith('banded'), n > 0, `caption at ${b}`);
    if (n < 4) assert.equal(actionAnswer({ kind: 'band' }, frame(b)).say, `Band (EVL) placed: ${n + 1} of 4.`, `answer at ${b}`);
  }
});

test('a band placed always adds exactly one to what is shown, however long since the last (up to the cap of four)', () => {
  for (const gap of [0, 1, 7, 14, 28, 40, 49]) {
    const e = new Engine() as any;   // eslint-disable-line @typescript-eslint/no-explicit-any
    e.loadPreset('cirrhosis');
    for (let session = 0; session < 3; session++) {
      const before = bandsPlaced(e.bands);
      e.band();
      assert.equal(bandsPlaced(e.bands), Math.min(4, before + 1), `gap ${gap}, session ${session + 1}: the band shows at once`);
      assert.ok(bandsPlaced(e.bands) >= e.bands, 'never fewer than the model has on');
      e.advanceDays(gap, { noRupture: true, silent: true });
    }
  }
});

test('in every course, at every kept moment, the readout shows at least the bands the model has on, and a day with a session shows one', async () => {
  let sessions = 0;
  for (const h of HISTORIES) {
    const b = await LOAD[h.id]!();
    const bandDays = new Set(b.entries.filter((x) => x.action && /^Band/.test(x.label)).map((x) => x.day));
    for (const en of b.entries) {
      if (!en.snap) continue;
      const bands = (en.snap as unknown as { bands: number }).bands;
      const shown = readingsOf(frame(bands))!.bands;
      assert.ok(shown >= bands && shown - bands < 1, `${h.id} day ${en.day}: ${shown} shown for ${bands} on`);
      if (bandDays.has(en.day)) { sessions++; assert.ok(shown >= 1, `${h.id} day ${en.day}: a band session reads Bands ${shown}`); }
    }
  }
  assert.ok(sessions > 0, 'the courses have band sessions');
});
