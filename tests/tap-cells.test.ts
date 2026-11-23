// Review item P1/P2 (Mohammad, 20 Nov): every phone control has its own tap cell of at least 44 px, and no two cells overlap. The look is 2D's (the 30 px view capsule, the 32 px talk pill); only the touch moves.
// Root cause: a button's tap box was made 44 px by reaching over its neighbours (a negative margin), so the boxes overlapped and the later one in the page took the shared strip; the view pill's cells left a 2 px dead gap.
// The CSS is the truth: these tests read its numbers and lay the cells out as a phone would (no browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const deck = readFileSync('src/ui/deck-ui.css', 'utf8');
const chrome = readFileSync('src/ui/shell/tap-cells.css', 'utf8');
const dock2d = readFileSync('src/ui/css2d/app-10-thumb-dock.css', 'utf8');
const pres2d = readFileSync('src/ui/css2d/app-05-presenter-cards.css', 'utf8');
const px = (s: string) => Number(/^(-?[\d.]+)px$/.exec(s.trim())?.[1]);

test('the view pill: 2D\'s segment reaches 7 px past its 30 px capsule above and below (44 px), ours also take half the 2 px gap each side, so cells meet and never overlap', () => {
  assert.match(dock2d, /\.nb-views #viewSeg button \{[^}]*height: 30px/);
  assert.match(dock2d, /\.nb-views #viewSeg \{[^}]*gap: 2px/);
  const two = /\.nb-views #viewSeg button::after \{ content: ""; position: absolute; inset: (-?\d+)px 0; \}/.exec(dock2d);
  assert.ok(two, '2D\'s tap reach is there');
  const ours = /\.nb-views #viewSeg button::after \{ inset: (-?\d+)px (-?\d+)px; \}/.exec(chrome);
  assert.ok(ours, 'our override is in tap-cells.css (imported by the shell after the 2D sheets)');
  const [v, h] = [Number(ours![1]), Number(ours![2])];
  assert.equal(30 - 2 * v, 44, 'a segment\'s cell is 44 px tall');
  assert.equal(v, Number(two![1]), 'the reach above and below is the 2D\'s');
  assert.equal(-h, 1, 'half the 2 px gap each side: the neighbour cell starts where this one ends');
  assert.equal(2 + 2 * h, 0, 'two neighbours\' cells meet exactly, they do not cross');
});

// The talk pill: lay out Back, the count, Next, the gear, Exit the way flex does (margin boxes side by side) and take each button's cell from its ::after.
const val = (src: string, re: RegExp) => { const m = re.exec(src); assert.ok(m, String(re)); return m!; };
function cells(layout: 'stack' | 'tab', countW: number) {
  const ox = px(val(deck, new RegExp(`\\[data-layout="${layout}"\\] \\.dk-bar\\.phone \\{ --tap-ox: ([\\d.]+px); \\}`))[1]!);
  const boxW = layout === 'stack' ? px(val(deck, /\.dk-bar\.phone \.ib \{ width: (\d+px); height: 44px; margin: 0 calc\(-1 \* var\(--tap-ox\)\); \}/)[1]!) : px(val(pres2d, /\.pz\.stack \.pz-bar \.ib \{ width: (\d+px); min-width: 0; height: 44px; margin: -4px -(\d+)px; \}/)[1]!);
  if (layout === 'tab') assert.equal(px(val(pres2d, /\.pz\.stack \.pz-bar \.ib \{[^}]*margin: -4px -(\d+px); \}/)[1]!), ox, 'the tab layout\'s overhang is the 2D margin');
  if (layout === 'stack') assert.equal(Number(val(deck, /\.dk-bar\.phone \.ib \{ width: 44px; height: 44px; margin: (\d+) /)[1]!), 0, 'the pill is 44 tall: no vertical reach');
  // Plan 44: an iPhone's two ends (Back, Exit) take a deeper reach, so their slots are narrower (their cells reach out past the pill by the same amount, so they stay 44)
  const endOx = layout === 'stack' ? px(val(deck, /\[data-layout="stack"\] \.dk-bar\.phone > \.ib:is\(:first-child, :last-child\) \{ --tap-ox: ([\d.]+px); \}/)[1]!) : ox;
  const slot = boxW - 2 * ox, endSlot = boxW - 2 * endOx;
  // slots, left to right: Back, count, Next, gear, Exit
  const widths = [endSlot, countW, slot, slot, endSlot];
  const starts: number[] = []; let x = 0; for (const w of widths) { starts.push(x); x += w; }
  const out = widths.map((w, i) => {
    let l = starts[i]!, r = starts[i]! + w;
    if (i !== 1) { if (i === 0) l -= endOx * 2; if (i === 4) r += endOx * 2; }   // the two ends reach out for the rest of their 44 px
    return { l, r };
  });
  return { out, ox, endOx, slot, endSlot, pillW: x };
}
/** The count's width at the smallest phone type: its min-width, in em of --t-lab's floor (12 px; 12.01 on a 393 wide phone). */
const countMin = () => Number(val(deck, /\.dk-bar\.phone > button\.pzb-n \{ min-width: ([\d.]+)em;/)[1]) * 12;

test('the phone talk pill (stack): five cells, none over another, Back and Exit 44 wide, every cell 44 tall, the ends\' slots are 28 and the pill is 12 px narrower than it was (Plan 44)', () => {
  const count = countMin();
  const { out, ox, endOx, slot, endSlot, pillW } = cells('stack', count);
  assert.equal(ox, 0); assert.equal(slot, 44); assert.equal(endOx, 8); assert.equal(endSlot, 28);
  for (let i = 1; i < out.length; i++) assert.ok(out[i]!.l >= out[i - 1]!.r - 1e-9, `cell ${i} starts at or after cell ${i - 1} ends`);
  assert.equal(out[0]!.r - out[0]!.l, 44); assert.equal(out[4]!.r - out[4]!.l, 44);
  assert.ok(Math.abs(out[2]!.r - out[2]!.l - 44) < 1e-9, 'Next is 44 wide (was 32)'); assert.ok(Math.abs(out[3]!.r - out[3]!.l - 44) < 1e-9, 'the gear too');
  assert.ok(out[1]!.r - out[1]!.l >= 44, 'the count is wide');
  assert.ok(Math.abs(count - 44.4) < 1e-9);
  assert.ok(Math.abs(pillW - (2 * 28 + 2 * 44 + count)) < 1e-9);
  assert.match(deck, /\.dk-bar\.phone > button\.pzb-n \{[^}]*padding: 0;/);
  // the layout constant is the real width (the pill\'s 1 px border each side too), within 1 px
  const plan = readFileSync('src/ui/layout/plan.ts', 'utf8');
  const w = Number(val(plan, /PILL_W_PHONE = (\d+)/)[1]);
  assert.ok(Math.abs(w - (pillW + 2)) <= 1, `PILL_W_PHONE ${w} is the CSS sum ${pillW + 2}`);
});
test('the ends\' icons clear the pill\'s rounded end: a 16 px icon in a 28 px slot, the 16 px half circle is 2.1 px in at the icon\'s top row', () => {
  const R = 16, icon = 16, slot = 28, rowFromCentre = icon / 2;
  const curveIn = R - Math.sqrt(R ** 2 - rowFromCentre ** 2), iconFromEnd = (slot - icon) / 2;
  assert.ok(curveIn < iconFromEnd - 3, `${curveIn.toFixed(2)} px of curve, ${iconFromEnd} px of room`);
  assert.match(deck, /\.dk-bar\.phone \.ib :is\(svg, \.ic\) \{ width: 16px; height: 16px; \}/);
});
test('an upright iPad\'s pill (tab) follows the same rule with 2D\'s own 3 px', () => {
  const { out, slot } = cells('tab', 60);
  assert.equal(slot, 38);
  for (let i = 1; i < out.length; i++) assert.ok(out[i]!.l >= out[i - 1]!.r - 1e-9);
  assert.equal(out[0]!.r - out[0]!.l, 44); assert.equal(out[4]!.r - out[4]!.l, 44);
});

test('the cells are real in the CSS: the button boxes take no touch, each ::after is its cell, the ends reach out, the count fills its box', () => {
  const T = '\\.deck-ui:is\\(\\[data-layout="stack"\\], \\[data-layout="tab"\\]\\) \\.dk-bar\\.phone';
  assert.match(deck, new RegExp(`${T} > :is\\(\\.ib, button\\.pzb-n\\),\\s*${T} \\.dk-settings > \\.ib \\{ pointer-events: none; \\}`));
  assert.match(deck, new RegExp(`> :is\\(\\.ib, button\\.pzb-n\\)::after,\\s*${T} \\.dk-settings > \\.ib::after \\{[^}]*top: 0; bottom: 0; left: var\\(--tap-ox\\); right: var\\(--tap-ox\\); pointer-events: auto;`));
  assert.match(deck, new RegExp(`${T} > button\\.pzb-n::after \\{ left: 0; right: 0; \\}`));
  assert.match(deck, new RegExp(`${T} > \\.ib:first-child::after \\{ left: calc\\(-1 \\* var\\(--tap-ox\\)\\); \\}`));
  assert.match(deck, new RegExp(`${T} > \\.ib:last-child::after \\{ right: calc\\(-1 \\* var\\(--tap-ox\\)\\); \\}`));
  assert.match(deck, /\.dk-bar\.phone > button\.pzb-n \{[^}]*min-height: 44px; margin-block: 0/, 'the count is 44 tall');
});
test('the press tint is ::before, so the cells\' ::after is free and nothing else paints on it', () => {
  assert.match(readFileSync('src/ui/css2d/app-01-chrome.css', 'utf8'), /\.ib, [^)]*button\.pzb-n\)::before/);
  for (const f of ['app-01-chrome', 'app-02-controls', 'app-05-presenter-cards', 'app-06-plate', 'app-08-cards']) {
    for (const m of readFileSync(`src/ui/css2d/${f}.css`, 'utf8').matchAll(/([^{}]*)(?:\.ib|pzb-n)([^{},]*)::after/g)) if (/pz-bar|pzb|dk-bar/.test(m[0])) assert.fail(`2D paints ${m[0].slice(0, 80)} on a tap-cell button`);
  }
});
test('the shell loads the view pill\'s cells after the 2D sheets', () => {
  const shell = readFileSync('src/ui/shell/Shell.tsx', 'utf8');
  assert.ok(shell.indexOf("import './chrome-3d.css'") >= 0 && shell.indexOf("import './tap-cells.css'") > shell.indexOf("import './chrome-3d.css'"));
  const main = readFileSync('src/main.tsx', 'utf8'); assert.ok(main.indexOf('./ui/css2d/index.css') < main.indexOf('./App.tsx'));
});

test('Mohammad 23 Nov: the phone pill is easier to tap (Next and the gear cells 38 wide, was 32; every cell 44 tall) and no card changes height: the pill is out of flow, only its width moved', () => {
  const { out } = cells('stack', countMin());
  for (const i of [0, 4]) assert.equal(out[i]!.r - out[i]!.l, 44);
  for (const i of [2, 3]) assert.ok(out[i]!.r - out[i]!.l >= 44 - 1e-9);
  assert.match(deck, /\.dk-bar \{ position: absolute;/, 'the pill takes no room in a card');
  assert.match(deck, /\.dk-bar\.phone \.ib \{ width: 44px; height: 44px; margin: 0 /, 'the pill is 44 tall, no vertical reach');
  const plan = readFileSync('src/ui/layout/plan.ts', 'utf8');
  assert.match(plan, /BAR_H_PHONE = 44/);
  assert.doesNotMatch(plan.replace(/^.*PILL_W.*$/gm, ''), /PILL_W_PHONE/, 'the pill\'s width never enters a card height');
});
