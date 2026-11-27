// C3 (owner, 27 Nov 2026): the PPG line of 12 mmHg is where bleeding risk rises; CSPH is an HVPG of 10 mmHg or more. No plane names a PPG line "CSPH" or by a bare "PPG ≥N". Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLANES, PPG_LINE_NAME, PPG_LINE_SHORT, CSPH_NOTE, planeLayout, planeOf } from '../src/ui/charts/plane/model.ts';

test('every plane that draws a PPG line names it "PPG ≥12: bleeding risk"', () => {
  let n = 0;
  for (const [id, pl] of Object.entries(PLANES)) for (const [cut, name] of Object.entries(pl.lineNames?.y ?? {})) {
    if (!/PPG/.test(name)) continue;
    n++;
    assert.equal(name, PPG_LINE_NAME, `${id} y ${cut}`);
    assert.doesNotMatch(name, /CSPH/);
  }
  assert.ok(n > 0, 'at least one plane has a PPG line');
  assert.equal(PPG_LINE_NAME, 'PPG ≥12: bleeding risk');
});

test('the flow-and-PPG plane says what CSPH is, once', () => {
  const src = PLANES['flow-ppg']!.source ?? '';
  assert.equal(src.split(CSPH_NOTE).length - 1, 1);
});

test('on a plot too narrow for the long name the line keeps the short "PPG ≥12" (never unnamed, never "CSPH"); on a wide one it says "bleeding risk"', () => {
  const pts = [{ f: { hvpg: 3, ppg: 4 }, name: 'Healthy' }, { f: { hvpg: 12.5, ppg: 15 }, name: 'Cirrhosis' }];
  const names = (W: number) => planeLayout({ plane: planeOf('hvpg-ppg')!, W, H: W > 400 ? 300 : 275, fs: 13, points: pts }).lines.map((l) => l.text);
  assert.deepEqual(names(330), ['CSPH ≥10', PPG_LINE_SHORT]);
  assert.deepEqual(names(640), ['CSPH ≥10', PPG_LINE_NAME]);
});
