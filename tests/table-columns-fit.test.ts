// A summary table's value columns are never narrower than what they print (capture f23a4c59, iPhone 390 x 844): Landmark trials 16 ran its 4th numeric column ("0.50") to the table's edge, and Precipitants 11 stood
// "113/72 (86)" on three lines. Root: the grid gave the name column its fixed least width and every value column an equal share of the rest with a least of 0 (`minmax(0, 1fr)`), so a column's width
// came from how many columns there were, never from what they hold. Now each column's least is its own printed width, and the name gives way for it. Node only (the card's source and CSS are read).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { colChars, gridOf, VALUE_CH, COL_PAD_PX, WAVE_MIN, waveMaxH } from '../src/ui/cards/table-words.ts';

const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');

test('a column is as wide as the widest run of one cell\'s printed text that cannot break, and never under two arrows', () => {
  assert.equal(colChars([]), VALUE_CH);
  assert.equal(colChars([{ kind: 'dir', text: '1.1' }, { kind: 'dir', text: '' }]), VALUE_CH, 'a compared cell prints its arrow only (owner, 27 Nov 2026): its number asks the column for nothing');
  assert.equal(colChars([{ kind: 'dir', text: '' }]), VALUE_CH, 'an arrow cell with no value is the arrows\' room');
  assert.equal(colChars([{ kind: 'ref', text: '0.50' }, { kind: 'dir', text: '' }, undefined]), 4);
  assert.equal(colChars([{ kind: 'ref', text: '18' }]), VALUE_CH, 'two digits fit two arrows\' room');
  assert.equal(colChars([{ kind: 'ref', text: '113/72 (86)' }]), 6, 'a blood pressure breaks at its space: its widest line is "113/72"');
  assert.equal(colChars([{ kind: 'removed', text: 'Removed' }]), 7 * 0.85);
});

test('the grid: the name\'s least is --dk-name-fit, a value column starts at its own width, the Doppler shares the rest, and --dk-cols is what the value columns need together', () => {
  const g = gridOf(['hvpg', 'pv', 'liver', 'he'], [4, VALUE_CH, VALUE_CH, 4]);
  assert.equal(g.grid, `minmax(var(--dk-name-fit), 2fr) minmax(calc(4ch + ${COL_PAD_PX}px), 1fr) minmax(calc(${VALUE_CH}ch + ${COL_PAD_PX}px), 1fr) minmax(calc(${VALUE_CH}ch + ${COL_PAD_PX}px), 1fr) minmax(calc(4ch + ${COL_PAD_PX}px), 1fr)`);
  assert.equal(g.need, `calc(${+(8 + 2 * VALUE_CH).toFixed(2)}ch + ${4 * COL_PAD_PX}px)`);
  const w = gridOf(['pv', 'wave'], [VALUE_CH, 0]);
  assert.equal(w.grid.split(' ').slice(-2).join(' '), `minmax(${WAVE_MIN}, 3.4fr)`, 'the Doppler column has a floor of its own');
  assert.equal(w.need, `calc(${VALUE_CH}ch + ${COL_PAD_PX}px + ${WAVE_MIN})`, 'and the name gives way for it, as for a value column (Doppler 13, iPhone: a 25 px trace, "No flow" cut)');
  assert.ok(waveMaxH(6) < waveMaxH(3), 'a table of six rows takes the shorter trace');
});

test('the card writes the grid from its printed cells, and the CSS lets the name give way for them (never under its longest word)', () => {
  const tsx = read('../src/ui/cards/TableCard.tsx'), css = read('../src/ui/deck-ui.css');
  assert.match(tsx, /chars = useMemo\(\(\) => model\.cols\.map\(\(c, j\) => colChars\(model\.rows\.map\(\(r\) => r\.cells\[j\]\)\)\)/);
  assert.match(tsx, /gridOf\(keys, chars\)/);
  assert.match(tsx, /\['--dk-cols' as string\]: need/);
  assert.doesNotMatch(tsx, /minmax\(0, 1fr\)/, 'no value column may shrink under its own text');
  // (the name asks for its least of the heads' formula or two lines of its longest name, and yields to the value columns' need, never under its longest word)
  assert.match(css, /--dk-name-fit: max\(var\(--dk-hl, 0px\), calc\(var\(--dk-wn, 0\) \* \.62em \+ 20px\), min\(max\(var\(--dk-name\), calc\(var\(--dk-wn2, 0\) \* \.62em \+ 20px\)\), calc\(100% - var\(--dk-colsx, var\(--dk-cols, 0px\)\)\)\)\)/);
  assert.match(tsx, /\['--dk-wn2' as string\]: twoLines/);
});

// The same capture: Circuit 11's card stood 9 px under the pill and ~100 px taller than its table.
import { centredBox, barOf } from '../src/ui/layout/plan.ts';
import { layoutOf } from '../src/ui/layout/rules2d.ts';
const phone = (w: number, h: number, bottom: number) => ({ w, h, safe: { top: bottom ? 47 : 0, bottom, left: 0, right: 0 } }) as Parameters<typeof centredBox>[0];

test('a phone\'s panel never stands under the pill, with or without a home-bar inset (the 72 px foot left a no-inset screen\'s card 9 px under it)', () => {
  for (const [w, h, b] of [[390, 844, 0], [390, 844, 34], [393, 852, 34], [375, 667, 0], [430, 932, 34], [820, 1180, 0], [820, 1180, 20]] as const) {
    const vp = phone(w, h, b), c = centredBox(vp, 'panel', 'table');
    assert.ok(['stack', 'tab'].includes(layoutOf(w, h)), `${w}x${h}`);
    assert.ok(c.top + c.maxH <= barOf(vp).rect.y - 4, `${w}x${h} inset ${b}: the card's foot ${c.top + c.maxH} is past the pill's top ${barOf(vp).rect.y}`);
    assert.equal(c.room, c.maxH);
  }
  assert.equal(centredBox(phone(393, 852, 34), 'panel').maxH, 852 - 72 - 34, 'a phone with the inset keeps the room it had');
});

test('the table judges its heads again when the fonts arrive, before the card measures', () => {
  const tsx = read('../src/ui/cards/TableCard.tsx');
  assert.match(tsx, /fonts\.ready\.then\(again\)/);
  assert.match(tsx, /addEventListener\?\.\('loadingdone', again\)/);
  assert.match(tsx, /removeEventListener\?\.\('loadingdone', again\)/);
});

test('heads ask for room: a column is never narrower than its head (a word or a line), the name giving way, and --dk-cols follows', () => {
  const plain = gridOf(['pv', 'whvp'], [VALUE_CH, VALUE_CH]);
  const roomy = gridOf(['pv', 'whvp'], [VALUE_CH, VALUE_CH], [20.2, 47]);
  assert.equal(roomy.grid, `minmax(var(--dk-name-fit), 2fr) minmax(max(calc(${VALUE_CH}ch + ${COL_PAD_PX}px), 21px), 1fr) minmax(max(calc(${VALUE_CH}ch + ${COL_PAD_PX}px), 47px), 1fr)`);
  assert.equal(roomy.need, `calc(max(calc(${VALUE_CH}ch + ${COL_PAD_PX}px), 21px) + max(calc(${VALUE_CH}ch + ${COL_PAD_PX}px), 47px))`);
  assert.notEqual(plain.grid, roomy.grid);
  const css = read('../src/ui/deck-ui.css');
  assert.match(css, /tr \{ display: grid; grid-template-columns: var\(--dk-gridx, var\(--dk-grid\)\)/, 'the fit pass\'s roomier grid wins where it wrote one');
});
