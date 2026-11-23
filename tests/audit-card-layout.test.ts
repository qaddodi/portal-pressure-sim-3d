// The audit's 21 Nov report (?audit v2), the findings that were the app's: the profile chart past its card's foot, the summary table's blood pressure cell; and the two that were the audit's own.
import { merged2d } from './merged-2d.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { heldToRoom, layoutHeight } from '../src/ui/charts/profile/model.ts';
import { roleOf } from '../src/ui/debug/screen/raw.ts';
import { cardSeries, cardSizeSnap, type Sample } from '../src/ui/debug/watch/motion-rules.ts';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('the profile chart is never taller than the room its data card leaves it (2D --pz-room, never under 11 em): the Mac case slides had it 88 to 141 px past the card', () => {
  const f = 12, own = layoutHeight(430, f, 'wide', false, 9)!;
  assert.equal(heldToRoom(own, undefined, f), own, 'no room measured: the height as it is');
  assert.equal(heldToRoom(own, 0, f), own, 'a stacked card has no room');
  assert.equal(heldToRoom(undefined, 200, f), undefined, 'a stacked card has no height of its own');
  assert.equal(heldToRoom(own, own + 50, f), own, 'room to spare: unchanged');
  assert.equal(heldToRoom(own, 200.7, f), 200, 'less room: the room');
  assert.equal(heldToRoom(own, 60, f), 11 * f, 'never under 11 em');
});

test('the profile card is handed the room, and holds its height to it', () => {
  assert.match(src('src/ui/talk/ToolCardBody.tsx'), /<ProfileCard [^>]*room=\{room\}/);
  const pc = src('src/ui/charts/profile/ProfileCard.tsx');
  assert.match(pc, /heldToRoom\(base, room, f\)/);
  assert.match(pc, /deps=\{\[[^\]]*\broom\b/);
});

test('the summary table\'s blood pressure cell wears 2D\'s .bp (it wraps at its space), in the reference cell and the arrow cell (presenter-question.js summaryTable)', () => {
  const t = src('src/ui/cards/TableCard.tsx');
  assert.match(t, /c\.k === 'map' \? 'num ref bp' : 'num ref'/);
  assert.match(t, /num dir\$\{c\.k === 'map' \? ' bp' : ''\}/);
  assert.match(merged2d('app-04-presenter.css'), /td\.num\.bp \{ white-space: normal/);
});

// a minimal element for roleOf: its own classes and its ancestors', matched against the selector lists roleOf asks for (.class, [class*="x"], tag)
const el = (classes: string[], ancestors: { classes: string[]; tag?: string }[] = [], tag = 'span') => {
  const chain = [{ classes, tag }, ...ancestors];
  const hit = (n: { classes: string[]; tag?: string }, sel: string) => sel.split(',').map((x) => x.trim()).some((s) => (s.startsWith('.') ? n.classes.includes(s.slice(1)) : s.startsWith('[class*="') ? n.classes.some((c) => c.includes(s.slice(9, -2))) : n.tag === s));
  return { classList: { contains: (c: string) => classes.includes(c) }, closest: (sel: string) => chain.find((n) => hit(n, sel)) ?? null } as unknown as Element;
};

test('the words\' size is the paragraph\'s: a figure\'s step marker (.pz-step, 2D\'s max(12px, .68em) circle) inside the words is not "the words shrank to fit" (the two slides with {#1} in the line)', () => {
  const line = { classes: ['pz-line'] };
  assert.equal(roleOf(el([], [line])), 'body');
  assert.equal(roleOf(el(['pz-step'], [line])), 'other');
  assert.equal(roleOf(el(['pz-pill'], [line])), 'other');
  assert.match(merged2d('app-04-presenter.css'), /\.pz-step \{[^}]*font-size: max\(12px, \.68em\)/);
});

test('a card leaving and the one coming in are two series, so the swap of one for the other is not a card that "snapped" in height', () => {
  assert.equal(cardSeries('teach', 'in'), 'teach'); assert.equal(cardSeries('teach', undefined), 'teach'); assert.equal(cardSeries('teach', 'out'), 'teach~out');
  // 328 px old card and 304 px new card, alternately read as `teach` (what the report saw), then as two series
  const row = (t: number, id: string, h: number): Sample => ({ t, K: [[id, 0, 0, 300, h, 1]], W: [1], L: [], c: null });
  const mixed: Sample[] = [row(0, 'teach', 328), row(33, 'teach', 328), row(66, 'teach', 328), row(99, 'teach', 304), row(132, 'teach', 304), row(165, 'teach', 304)];
  assert.equal(cardSizeSnap({ samples: mixed } as never).length, 1, 'one series reads the swap as a snap');
  const apart: Sample[] = [row(0, 'teach~out', 328), row(33, 'teach~out', 328), row(66, 'teach~out', 328), row(99, 'teach', 304), row(132, 'teach', 304), row(165, 'teach', 304)];
  assert.equal(cardSizeSnap({ samples: apart } as never).length, 0);
});

test('a fit pass that writes onto what it observes runs after the observer\'s delivery, once, and lets go cleanly ("ResizeObserver loop completed with undelivered notifications")', async () => {
  const g = globalThis as Record<string, unknown>;
  const saved = { ResizeObserver: g.ResizeObserver, window: g.window };
  let deliver: () => void = () => undefined, watched = 0, off = 0;
  g.ResizeObserver = class { constructor(cb: () => void) { deliver = cb; } observe() { watched++; } disconnect() { off++; } };
  g.window = { setTimeout: (f: () => void, ms: number) => setTimeout(f, ms), clearTimeout: (t: number) => clearTimeout(t) };
  try {
    const { observeThenFit } = await import('../src/ui/layout/fit-later.ts');
    let ran = 0;
    const stop = observeThenFit([{} as Element, null, {} as Element], () => { ran++; });
    assert.equal(watched, 2, 'a missing target is skipped');
    deliver(); deliver(); deliver();
    assert.equal(ran, 0, 'not inside the delivery');
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(ran, 1, 'once, however many notifications');
    deliver(); stop();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(ran, 1, 'a pass waiting when the card goes is dropped'); assert.equal(off, 1);
  } finally { g.ResizeObserver = saved.ResizeObserver; g.window = saved.window; }
});

test('the fit passes that write onto the element they observe go through observeThenFit (table, tiles, the six ladders\' cells)', () => {
  for (const p of ['src/ui/cards/TableCard.tsx', 'src/ui/cards/TilesCard.tsx', 'src/ui/charts/ladder/LaddersCard.tsx']) {
    const s = src(p);
    assert.match(s, /observeThenFit\(/, p); assert.doesNotMatch(s, /new ResizeObserver\(/, `${p} has a raw observer`);
  }
});

test('the curve and the course are held to the card\'s room too (the audit\'s 18 to 36 px past the foot: The course on one chart, Ten years on one chart, PPG and fundal varix)', async () => {
  const { ctxOf } = await import('./charts-helpers.ts');
  const { courseFrame } = await import('../src/ui/charts/curve/course-frame.ts');
  const { curveFrame } = await import('../src/ui/charts/curve/frame.ts');
  const { COURSE_TOOL, TIPS_TOOL, courseSeriesSpecimen } = await import('../src/ui/charts/curve/specimens.ts');
  const c = ctxOf('light', 430);
  const free = courseFrame({ tool: COURSE_TOOL, ser: courseSeriesSpecimen() }, c).frame.h;
  const room = free - 40;
  assert.equal(courseFrame({ tool: COURSE_TOOL, ser: courseSeriesSpecimen(), room }, c).frame.h, room, 'the course stands in its room');
  assert.equal(courseFrame({ tool: COURSE_TOOL, ser: courseSeriesSpecimen(), room: free + 50 }, c).frame.h, free, 'room to spare: unchanged');
  const cf = curveFrame({ tool: TIPS_TOOL, ser: null }, c).frame.h;
  assert.equal(curveFrame({ tool: TIPS_TOOL, ser: null, room: cf - 30 }, c).frame.h, cf - 30, 'the curve stands in its room');
  const tb = src('src/ui/talk/ToolCardBody.tsx');
  assert.match(tb, /<CurveCard [^>]*room=\{room\}/);
  assert.match(src('src/ui/charts/curve/CurveCard.tsx'), /deps=\{\[t, ser, height, room\]\}/);
});

test('the audit reads a scrolling list\'s rows below its fold, and a sheet over the page, as what they are (the Settings rows "covered by the canvas", the Menu\'s words "over" the bar)', () => {
  const sc = src('src/ui/debug/audit/scan.ts');
  assert.match(sc, /view: cuts \|\| scrolling \?/);
  assert.match(sc, /const view = vis\(el\)\.view/);
  assert.match(src('src/ui/debug/audit/scan-judge.ts'), /!!a\.modal !== !!b\.modal/);
  assert.match(src('src/ui/debug/audit/judge.ts'), /overlap\(k\.box, k\.clip\) <= 0\) continue/);
});

test('the intra-abdominal pressure bar is named with its number and its word, and a fill inside a named picture is not "colour only" (a11y-colour-cue, 23 findings in the first run, 7 in the next)', () => {
  assert.match(src('src/ui/tests/abdomen/AbdomenPane.tsx'), /aria-label=\{`\$\{WORDS\.iapKey\} \$\{v\.iapNum\}, \$\{v\.iapWord\}`\}/);
  assert.match(src('src/ui/debug/screen/raw.ts'), /el\.closest\('\[role="img"\]\[aria-label\]'\)/);
});

test('a blood pressure reading may break after its slash, so "114/68" never runs under the next phone column (iPhone audit: kidney 12, albumin 12, tipping 10, 26 to 28% overlaps)', () => {
  const t = src('src/ui/cards/TableCard.tsx');
  assert.match(t, /export const bpBreaks/);
  assert.match(t, /c\.k === 'map' \? bpBreaks\(c\.text\) : c\.text/);
});

test('a bare number cut off or off screen names the element it is in, and the leak check takes its baseline after the lazily built views', () => {
  assert.match(src('src/ui/debug/audit/scan.ts'), /by: nameOf\(p\)/);
  assert.match(src('src/ui/debug/audit/scan-judge.ts'), /\(in \$\{i\.by\}\)/);
  assert.match(src('src/clock/render-stats.ts'), /Math\.floor\(\(have\.length - 1\) \* 0\.6\)/);
});

test('a chart\'s own height shrinks with its card\'s fit (2D `.pz-curve { height: cv-h * var(--pz-fit) }`): at a fit under 1 the stent slides\' PPG chart stood 53 px past the card on an iPhone', async () => {
  const { ctxOf } = await import('./charts-helpers.ts');
  const { fitHeight } = await import('../src/ui/charts/scene.ts');
  const { evGraphFrame } = await import('../src/ui/charts/evgraph/frame.ts');
  const { curveFrame } = await import('../src/ui/charts/curve/frame.ts');
  const { TIPS_TOOL } = await import('../src/ui/charts/curve/specimens.ts');
  assert.equal(fitHeight(200, {}), 200); assert.equal(fitHeight(200, { fit: 1 }), 200); assert.equal(fitHeight(200, { fit: 0.8 }), 160);
  const { eventGraphOf } = await import('../src/ui/charts/evgraph/model.ts');
  const spec = eventGraphOf({ procedure: 'tips', tiles: ['ppg', 'liver'] } as never)!;
  const at = (fit?: number) => evGraphFrame({ spec, before: [19.3, 61], end: [11, 32] }, 0, { ...ctxOf('light', 430), fit }).h;
  assert.ok(at(0.7) < at(1) * 0.75, 'the graph is shorter at a fit of 0.7'); assert.equal(at(1), at(undefined));
  const cv = (fit?: number) => curveFrame({ tool: TIPS_TOOL, ser: null }, { ...ctxOf('light', 430), fit }).frame.h;
  assert.ok(cv(0.7) < cv(1) * 0.75, 'the curve is shorter at a fit of 0.7'); assert.equal(cv(1), cv(undefined));
  for (const p of ['evgraph/frame.ts', 'curve/frame.ts', 'curve/course-frame.ts', 'menu/frame.ts', 'trace/frame.ts']) assert.match(src(`src/ui/charts/${p}`), /fitHeight\(/, p);
});

test('the stress figure of the varix wall wraps in the phone\'s narrow column instead of running past the card (iPhone audit, Cirrhosis in pregnancy 5)', () => {
  const css = src('src/ui/deck-ui.css');
  assert.match(css, /\.wall-big\.wall-big \{ white-space: normal; min-width: 0;/);
});

test('the card\'s words, the tool room and the chart box measure after the observer\'s delivery (ResizeObserver loop, ascites 8, compared 13, measuring 14)', () => {
  for (const p of ['src/ui/cards/CardFrame.tsx', 'src/ui/talk/tool-room.ts', 'src/ui/charts/Chart.tsx']) {
    const s = src(p);
    assert.match(s, /observeThenFit\(/, p); assert.doesNotMatch(s, /new ResizeObserver\(/, `${p} has a raw observer`);
  }
});

test('a label fades over the camera\'s dive, so it is only "slow" past the dive\'s length, not the card limit (iPhone quick run: 876 labels at 2.1 to 3.0 s)', () => {
  const j = src('src/ui/debug/audit/judge.ts');
  assert.match(j, /SLOW_LABEL_MS = 3200/);
  assert.match(j, /f\.kind === 'label' \? SLOW_LABEL_MS : SLOW_FADE_MS/);
});

test('the Tests cards, the deck screen and the doppler measure after the observer\'s delivery too (ResizeObserver loop on Ascites 9 and Measuring HVPG 15)', () => {
  for (const p of ['src/ui/tests/Cv.tsx', 'src/ui/tests/TestsLayer.tsx', 'src/ui/tests/doppler/DopplerPane.tsx', 'src/ui/DeckUi.tsx']) {
    const s = src(p);
    assert.match(s, /observeThenFit\(/, p); assert.doesNotMatch(s, /new ResizeObserver\(/, `${p} has a raw observer`);
  }
});

test('the phone dock\'s readouts are never narrower than their tiles (a reading ran 14 to 21 px off the right edge after the Ascites, TIPS Doppler and Recompensation talks)', () => {
  const css = merged2d('app-10-thumb-dock.css');
  assert.match(css, /\.app\.thumb \.vdock \.readouts:not\(\.all\) \{ width: auto; min-width: max-content;/);
  assert.match(css, /\.vdock:not\(\.mini\) \.readouts:not\(\.all\) \{ width: auto; min-width: max-content; \}/);
});

test('the audit reads a card only once its slide has landed (words 3 to 19 px past the right edge on Circulation 10, Encephalopathy 9, TIPS complete 16, Recompensation 3: the card was still sliding in)', async () => {
  const src2 = src('src/ui/debug/audit/app.ts');
  assert.match(src2, /!slidingX\(cs\.transform\)/);
  const m = /export function slidingX\(t: string\): boolean \{[\s\S]*?\n\}/.exec(src2)![0].replace('export function', 'function').replace('(t: string): boolean', '(t)');
  const slidingX = new Function(`${m}; return slidingX;`)() as (t: string) => boolean;
  assert.equal(slidingX('none'), false); assert.equal(slidingX('matrix(1, 0, 0, 1, 0, 0)'), false); assert.equal(slidingX('matrix(1, 0, 0, 1, 16.4, 0)'), true);
  assert.equal(slidingX('matrix(1, 0, 0, 1, -12, 3)'), true); assert.equal(slidingX('translateX(0.2px)'), false); assert.equal(slidingX('translateX(9px)'), true);
});

test('a table head that spills into its cell\'s own padding counts as too wide, so the heads stand upright before the table edge cuts it (Liver flow, 2 px, iPhone Quick run)', () => {
  const t = src('src/ui/cards/TableCard.tsx');
  assert.match(t, /export function headOver/); assert.match(t, /\.some\(\(t\) => headOver\(t\)\)/);
  assert.match(t, /width > room \+ 0\.5/);
});

test('a chart looks at its zoom again when its card\'s style changes, not only when its own box resizes (the card\'s fit changes the zoom and not the box: the chart stayed laid out 1.13 times too wide, cut at the right edge, its card sized to it)', () => {
  const s = src('src/ui/charts/Chart.tsx');
  assert.match(s, /new MutationObserver\(/); assert.match(s, /attributeFilter: \['style'\]/); assert.match(s, /el\.closest\('\.dk-card'\)/);
});
