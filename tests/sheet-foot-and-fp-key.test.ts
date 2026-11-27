// Eyes on bee29a3 (Mac): (1) the Compare and Guide sheets ran down to y 760, under the dock and the zoom pill; (2) the First pass lens printed its long note in the lens bar, which wrapped to a second row
// and collapsed Blood, Treat, Tests and History to icons. Roots: (1) a top sheet's room ended at a fixed 92 px from the foot, not at the dock (--bot-occ); (2) 2D gives that sentence to the dots as a hover title.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { legendFor } from '../src/scene/lenses/legend.ts';

test('top sheets end over the dock, from one variable', () => {
  const shell = readFileSync('src/ui/shell/shell.css', 'utf8');
  assert.match(shell, /--sh-max-h: calc\(100% - var\(--sh-pad-top\) - var\(--bot-occ, 84px\) - 20px\)/);
  for (const f of ['src/ui/shell/shell.css', 'src/ui/history/history.css', 'src/ui/why/why.css']) {
    const css = readFileSync(f, 'utf8').replace(/--sh-max-h:[^;]*;/, '');
    assert.ok(!/- 92px/.test(css), `${f} has a sheet that ends at a fixed foot`);
    // (shell.css holds the variable; since e844a41e its own sheets take their box from the room channel, so only the sheets with their own rule read it)
    if (f !== 'src/ui/shell/shell.css') assert.match(readFileSync(f, 'utf8'), /max-height: var\(--sh-max-h\)/);
  }
});
test('the First pass key prints its dots only; the sentence is their hover title (2D LG_FP_DOTS)', () => {
  const g = legendFor('firstpass', 'light', 'healthy');
  assert.equal(g.note, undefined);
  assert.match(g.dotsTitle ?? '', /^Splanchnic blood by its route/);
  assert.deepEqual(g.dots!.map((d) => d.name), ['Raw', 'Clear', 'HA', 'Sys']);
  assert.match(readFileSync('src/ui/shell/LensKey.tsx', 'utf8'), /lg-cats lg-dots" title=\{g\.dotsTitle\}/);
});
