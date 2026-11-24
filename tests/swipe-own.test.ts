// One recogniser for the whole slide (Mohammad, 20 Nov): the axis of a touch is decided once, in its first few pixels; the sideways and vertical recognisers never both take a touch;
// and only real controls are left alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { axisStart, axisOf, axisEnd, AXIS_AT } from '../src/ui/cards/swipe-own.ts';

test('the axis is undecided under 8 px, then sideways when further across than up, else vertical, and it stays', () => {
  axisStart(1);
  assert.equal(axisOf(1, 5, 3), null);
  assert.equal(axisOf(1, AXIS_AT + 2, 4), 'x');
  assert.equal(axisOf(1, 10, 60), 'x', 'a touch that went sideways first stays sideways');
  axisStart(2);
  assert.equal(axisOf(2, 3, -9), 'y');
  assert.equal(axisOf(2, 80, -10), 'y');
  axisEnd(2);
  assert.equal(axisOf(2, 9, 1), 'x', 'a new touch with the same id starts again');
});

test('the sideways recogniser listens on the window for touches (the figure, either card and the space between), the vertical one asks the same axis', () => {
  const card = readFileSync(new URL('../src/ui/cards/useCardDrag.ts', import.meta.url), 'utf8');
  const dock = readFileSync(new URL('../src/ui/cards/useDockSwipe.ts', import.meta.url), 'utf8');
  assert.match(card, /window\.addEventListener\(n, h as EventListener, \{ capture: true/);
  assert.match(card, /axisOf\(g\.id, dx, dy\) !== 'x'/);
  assert.match(dock, /axisOf\(g\.id, dx, dy\) !== 'y'/);
  assert.match(card, /isPrimary/, 'a second finger gives the swipe up');
});

// Eyes on 69eb86d (20 Nov): an up-swipe that began on the WORDS card pushed the instrument card away with the finger and, on release, it came straight back; the same swipe on the figure docked it.
// Root cause: a card-started touch is also reported to the card recogniser's onEnd on the same pointerup. The dock lands at once when the card was pushed all the way (level already 1), the store
// re-renders between the two listeners (a microtask), `plan.strip` is then the docked card's edge, and onEnd read the same swipe again as the wallet's swap, which brings a docked card back.
test('a vertical swipe the dock took is never also the wallet\'s swap', async () => {
  const { readFileSync } = await import('node:fs');
  const layer = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  const i = layer.indexOf('onEnd: (g, e) => {');
  assert.ok(i > 0 && layer.slice(i, layer.indexOf('swapWallet()', i)).includes('if (justDocked()) return;'), 'onEnd lets a swipe the dock took go before it can swap the wallet');
});

// Mohammad, 23 Nov: "when there is a timeline or a procedure steps in the teaching card, swiping to right should NOT make the cards move". One shared rule: a strip a finger moves along is marked
// `data-scrub` and `ownsTouch` leaves it alone, so the card recogniser, the dock swipe and the wheel never take a touch that starts on it.
test('a touch that starts on a scrub strip (over-time chart, step rail) is its own; elsewhere on the card it is a swipe', async () => {
  const { ownsTouch } = await import('../src/ui/cards/swipe-own.ts');
  const strip = { closest: (s: string) => (s.includes('[data-scrub]') ? {} : null) } as unknown as Element;
  const plain = { closest: () => null } as unknown as Element;
  assert.equal(ownsTouch(strip), true);
  assert.equal(ownsTouch(plain), false);
  const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
  assert.match(read('../src/ui/tests/trace/OverTimePane.tsx'), /pt-box" data-scrub=""/);
  assert.match(read('../src/ui/cards/ProcRow.tsx'), /pz-prail-track" data-scrub=""/);
});

// Mohammad, 24 Nov: "on slides where there is a procedure with steps, swiping shouldn't move the teaching card or instrument card. Just steps through the steps."
// Root cause: useCardDrag made the cards follow the finger for EVERY sideways drag the talk could answer, deciding "will the cards go" from apply(stops, pos, m) alone; but the presenter's
// move() hands Next/Back to the procedure (procStep) or the data card (toolStep) first, so on those slides the cards were dragged (and sent out) for a swipe that only took a step.
test('a drag that is only a step of the slide (procedure, tool reading) takes no card along', async () => {
  const { setProcStep, procCanStep } = await import('../src/ui/deck/proc-step.ts');
  setProcStep(Object.assign(() => true, { can: (d: 1 | -1) => d > 0 }));
  assert.equal(procCanStep(1), true); assert.equal(procCanStep(-1), false);
  setProcStep(null); assert.equal(procCanStep(1), false);
  const drag = readFileSync(new URL('../src/ui/cards/useCardDrag.ts', import.meta.url), 'utf8');
  const layer = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  assert.match(drag, /opts\.current\.stays\?\.\(dx\)\) g\.cards = \[\]/);
  assert.match(layer, /stays: \(dx\) => .*procCanStep\(d\) \|\| toolCanStep\(d\)/);
});
