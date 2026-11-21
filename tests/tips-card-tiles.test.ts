// The TIPS card (21 Nov 2026, play-test): its three tiles sat at different heights (a tile's words were centred in a stretched box, so a tile with a shorter small line floated lower), the
// numbers line lost its last unit at the card's edge, and the actions ran in two ragged rows. Root cause of the tiles: content centred in a box the grid stretches. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const plate = readFileSync(new URL('../src/ui/css2d/app-06-plate.css', import.meta.url), 'utf8');
const cards = readFileSync(new URL('../src/ui/css2d/app-08-cards.css', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/ui/action/stent/StentPanel.tsx', import.meta.url), 'utf8');
const rule = (css: string, sel: string): string => css.split('\n').find((l) => l.startsWith(sel + ' {')) ?? '';

test('a choice tile starts its words at the top, never centred in the stretched box', () => {
  const r = rule(plate, '.stent-editor .se-row');
  assert.ok(r && /justify-content: flex-start/.test(r) && !/justify-content: center/.test(r));
  assert.match(rule(cards, '.ab-tile'), /align-content: start/);
});
test('the numbers line shares its slack between the readings and never clips', () => {
  const r = rule(plate, '.tv-keys');
  assert.match(r, /justify-content: space-between/);
  assert.match(r, /overflow: visible/);
});
test('the vessel card draws the stent figure with its brackets and numbers, without the chart', () => {
  assert.match(panel, /tipsFigureFrame\(.*\{ lens: 'velocity', labels: true, chart: false/);
  assert.match(panel, /\{stent && <CardFigure id=\{id\} \/>\}/);
});

test('the vessel card\'s actions are one row of equal columns with their icons attached, and its figure has its height from the first paint', () => {
  assert.match(plate, /\.ac-panel:has\(> \.tv\) \+ \.ac-as \{[^}]*grid-auto-flow: column; grid-auto-columns: minmax\(0, 1fr\)/);
  assert.match(plate, /\.ac-panel:has\(> \.tv\) \+ \.ac-as \.ac-dye \.ac-bl \{ min-width: 0; \}/);
  assert.match(plate, /\.tv \.tf-card \{[^}]*height: calc\(27px \+ 12\.264cqi\)/);
  assert.match(plate, /\.tv \{[^}]*container-type: inline-size/);
});
test('the reserved figure height is the card figure\'s own: 20 + hvH + 13 + 8 = 41 px + a hepatic vein\'s 13 mm at the width\'s scale', () => {
  const src = readFileSync(new URL('../src/ui/tests/ir/tips-figure.ts', import.meta.url), 'utf8');
  assert.match(src, /CARD_ROWS = \{ labY: 7, brY: 15, top: 20, gate: 13, foot: 8 \}/);
  assert.match(src, /L\.cy = CARD_ROWS\.top \+ half; L\.gateY = L\.cy \+ half \+ CARD_ROWS\.gate; L\.heroH = L\.gateY \+ CARD_ROWS\.foot/);
  const fp = readFileSync(new URL('../src/ui/tests/ir/copied/figure-parts.copied.js', import.meta.url), 'utf8');
  assert.match(fp, /VEIN_CM = 1\.3, REF_CM = 8/);   // (hvH = 13 k, k = W / (10 × 10.6): 12.264 % of the width)
  assert.ok(Math.abs((13 / (10 * (8 + 2 * 1.3))) * 100 - 12.264) < 0.001);
  assert.match(readFileSync(new URL('../src/ui/action/stent/StentPanel.tsx', import.meta.url), 'utf8'), /chart: false, card: true/);
});
test('an open action card sheet takes its height off the figure\'s room, so the camera frames the stent above it', async () => {
  const { roomAbove, takenBy } = await import('../src/ui/action/action-room-math.ts');
  const room = { x: 0, y: 100, w: 390, h: 600 };
  assert.deepEqual(roomAbove(room, 0), room, 'no card, no change');
  assert.equal(roomAbove(room, 300).h, 600 - (300 - 8 + 6));
  assert.equal(takenBy(1000, room), 330, 'a tall card never takes more than 55 % of the room');
  const shell = readFileSync(new URL('../src/ui/shell/Shell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /roomAbove\(panRoom\(base, testsPlace\), actionH\)/);
});

test('the bracket row eases the card figure\'s height and slides the picture with it, and the readings sit above it', () => {
  assert.match(plate, /\.tv \.tf-card\[data-row="true"\] \{ height: calc\(41px \+ 12\.264cqi\); \}/);
  assert.match(plate, /\.tv \.tf-card > \.tf-in \{ transform: translateY\(-14px\); transition: transform var\(--d-surface\)/);
  assert.match(plate, /\.tv \.tf-card \{[^}]*transition: height var\(--d-surface\)/);
  assert.match(panel, /data-row=\{open\}/);
  assert.ok(panel.indexOf('<VesselKeys id={id} />') < panel.indexOf('<CardFigure id={id} />'), 'the readings come first');
});
