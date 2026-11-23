// The menu's parity with the 2D app: the patient preview's curve and chips, the tab swipe's rule, the sheet's ride, the popover's placement, the pushed page's swipe back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { UI } from '../src/ui/strings.generated.ts';
import { chipsOf, shownOf, type Snap } from '../src/ui/menu/umenu-logic.ts';
import { profileScene, steepest, PROF_H } from '../src/ui/menu/profile-frame.ts';
import { glide, follow } from '../src/ui/menu/motion.ts';
import { settleMs } from '../src/ui/shell/page-push.ts';
import { pinned2D } from './two-d-pin.ts';
// @ts-ignore plain JS copied from the 2D app
import { SNAPSHOTS, PATH } from '../src/ui/menu/snapshots.copied.js';
// @ts-ignore plain JS copied from the 2D app
import { pageGo, PAGE_FAR, PAGE_MIN } from '../src/ui/menu/swipe.copied.js';
import { LOOK_IDS } from '../src/looks/looks.ts';
import { ctxOf, judge } from './charts-helpers.ts';
import type { LineShape, CircleShape, RectShape } from '../src/ui/charts/scene.ts';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SNAP = SNAPSHOTS as Record<string, Snap>;

test('every patient the menu lists has a settled snapshot with a curve of the path\'s length (a patient made from readings would have none, and shows the words alone)', () => {
  const ids = UI.presets.map((p) => p.id);
  assert.ok(ids.length >= 15);
  for (const id of ids) { assert.ok(SNAP[id], `${id} has a snapshot`); assert.equal(SNAP[id]!.P.length, PATH.length, id); }
});

test('the chips: HVPG amber past 5, red from 10; PPG amber past 6, red from 12; PV plain; Hepatofugal only for reversed portal flow', () => {
  const chip = (s: Partial<Snap>) => chipsOf({ P: [1, 1], hvpg: 0, pv: 8, pvFlow: 1, ascites: 0, ...s });
  assert.deepEqual(chip({ hvpg: 5 }).map((c) => c.cls), ['hp-chip ok', 'hp-chip']);   // 5.0 is not over the line
  assert.equal(chip({ hvpg: 5.1 })[0]!.cls, 'hp-chip low');
  assert.equal(chip({ hvpg: 9.9 })[0]!.cls, 'hp-chip low');
  assert.equal(chip({ hvpg: 10 })[0]!.cls, 'hp-chip high');
  assert.equal(chip({ hvpg: 4.96 })[0]!.cls, 'hp-chip ok', '4.96 prints as 5.0, which is not over 5: the colour answers the figure on the chip');
  const ppg = (v: number) => chip({ fp: { ppg: v } }).find((c) => c.word === 'PPG ')!.cls;
  assert.equal(ppg(5.9), 'hp-chip ok'); assert.equal(ppg(6.1), 'hp-chip low'); assert.equal(ppg(12), 'hp-chip high');
  assert.equal(chip({ hvpg: 3 }).some((c) => c.word === 'PPG '), false, 'no PPG chip without a PPG');
  assert.equal(chip({ pvFlow: -0.04 }).some((c) => c.cls.includes('rev')), false);
  assert.equal(chip({ pvFlow: -0.06 }).at(-1)!.word, 'Hepatofugal');
  assert.equal(shownOf(4.96), 5);
});

test('the chips of the real patients read as the 2D snapshots do', () => {
  const csph = chipsOf(SNAP.csph!);
  assert.deepEqual(csph.map((c) => [c.word, c.value, c.cls]), [['HVPG ', '11.6', 'hp-chip high'], ['PPG ', '13.5', 'hp-chip high'], ['PV ', '17.7', 'hp-chip']]);
  assert.equal(chipsOf(SNAP.healthy!)[0]!.cls, 'hp-chip ok');
  assert.equal(chipsOf(SNAP['cirr-hepatofugal']!).at(-1)!.word, 'Hepatofugal');
});

test('the curve: grid at 10 and 20, the fall, a dot ringed in the surface at each station, drawn inside its box in every look', () => {
  for (const look of LOOK_IDS) {
    for (const id of ['healthy', 'csph', 'budd-chiari']) {
      const s = SNAP[id]!, f = profileScene(s.P, ctxOf(look, 332));
      assert.equal(f.h, PROF_H);
      const lines = f.shapes.filter((x): x is LineShape => x.k === 'line'), dots = f.shapes.filter((x): x is CircleShape => x.k === 'circle');
      assert.equal(lines.length, 2 + s.P.length - 1, `${look} ${id}: two grid lines and a segment between stations`);
      assert.equal(dots.length, 2 * s.P.length, 'a ring and a dot at each station');
      assert.deepEqual(lines.slice(0, 2).map((l) => l.pen.dash), [[2, 3], [2, 3]]);
      judge(f, look);
    }
  }
  const { drop, at } = steepest(SNAP.csph!.P);
  assert.ok(drop > 5 && at === 4, 'the csph patient\'s resistance is in the sinusoids: the fall into the central vein');
  const f = profileScene(SNAP.csph!.P, ctxOf('light', 332)), segs = f.shapes.filter((x): x is LineShape => x.k === 'line').slice(2);
  assert.deepEqual(segs.map((l) => l.pen.w), [2.4, 2.4, 2.4, 3.2, 2.4, 2.4, 2.4], 'the steepest fall is the thicker segment');
  assert.equal(f.shapes.filter((x): x is RectShape => x.k === 'rect').length, 1, 'and carries the faint red wash');
  assert.equal(profileScene(SNAP.healthy!.P, ctxOf('light', 332)).shapes.some((x) => x.k === 'rect'), false, 'a fall of 5 mmHg or less has none');
  assert.equal(profileScene(SNAP.csph!.P, ctxOf('light', 5)).shapes.length, 0, 'a box under 10 px draws nothing');
});

test('the preview words and the curve are the menu\'s patient preview', () => {
  const m = src('src/ui/menu/UMenu.tsx');
  for (const w of ['hp-cap', 'hp-prof', 'hp-facts', 'Pressure, splanchnic bed to right atrium (0 to 30 mmHg)', 'chipsOf', 'profileScene', 'SNAPSHOTS']) assert.ok(m.includes(w), w);
  const css = src('src/ui/css2d/app-06-plate.css') + src('src/ui/css2d/app-07-floating.css');
  for (const c of ['hp-prof', 'hp-chip', 'hp-facts', 'hp-cap']) assert.ok(new RegExp(`\\.${c}\\b`).test(css), c);
});

// (against the pinned 2D commit only, like every copy check: a checkout of some other 2D commit lying beside this one is not what the files were copied from; tests/two-d-pin.ts)
const two = pinned2D('src/ui/menu.js');
test('the copied menu files are the 2D app\'s (when a 2D checkout at the pin is beside this one)', { skip: two.skip }, () => {
  execFileSync('node', ['scripts/copy-menu.mjs', '--from', two.repo, '--check'], { cwd: new URL('..', import.meta.url), stdio: 'pipe' });
});

test('paging between tabs: a third of the width or a quick flick goes on, a flick back springs back (2D pageGo)', () => {
  assert.equal(pageGo(-(PAGE_FAR * 300 + 1), 600, 300, 0), true);
  assert.equal(pageGo(-50, 900, 300, 0), false, 'a short slow drag comes back');
  assert.equal(pageGo(-(PAGE_MIN + 5), 60, 300, 0), true, 'a short quick drag goes on');
  assert.equal(pageGo(-200, 400, 300, 0.7), false, 'flung back the way it came');
  assert.ok(settleMs(300, 300) === 240 && settleMs(30, 300) < 140);
});

test('the swipe and the pushed page are driven by the one clock, in transform and opacity only', () => {
  for (const f of ['src/ui/menu/swipe-tabs.ts', 'src/ui/menu/motion.ts', 'src/ui/shell/page-push.ts']) {
    const t = src(f).replace(/\/\/.*$/gm, '');
    assert.ok(!/requestAnimationFrame|setInterval/.test(t), `${f}: no raw frames`);
  }
  const m = src('src/ui/menu/UMenu.tsx');
  assert.ok(/swipeTabs\(el/.test(m) && /enterCol\(/.test(m), 'the menu pages by a swipe and plays the tab entrance');
  assert.ok(/pvResize/.test(m) && /um-pv-old/.test(m) && /D_FLIP/.test(m), 'the preview cross-fades and eases its height as 2D does');
  const menu = src('src/ui/shell/Menu.tsx');
  assert.ok(/pushPage\(/.test(menu) && /placePopover\(/.test(menu) && /menuExitMs/.test(menu), 'pages swipe back; the popover is placed by 2D\'s rule; the leave takes 2D\'s time');
});

test('every phone sheet has ONE motion: fade and a short rise in --d-small on --ease-arrive, both ways (owner, 23 Nov: unify menus)', () => {
  const css = src('src/ui/shell/menu-motion.css');
  assert.ok(/:root \{ --sheet-rise: 24px; --sheet-ease: var\(--ease-arrive\); \}/.test(css));
  assert.ok(/@keyframes mn-sheet-in \{ from \{ opacity: 0; translate: 0 var\(--sheet-rise\); \} to \{ opacity: 1; translate: 0 0; \} \}/.test(css));
  assert.ok(/@keyframes mn-sheet-out \{ from \{ opacity: 1; translate: 0 0; \} to \{ opacity: 0; translate: 0 var\(--sheet-rise\); \} \}/.test(css));
  for (const sel of ['.menu.as-sheet', '.umenu.sheet']) assert.ok(css.includes(`.sh-root > ${sel} { animation: mn-sheet-in var(--d-small) var(--sheet-ease) both; }`), sel);
  assert.ok(css.includes('.menu.as-sheet.leaving { animation: mn-sheet-out var(--d-small) var(--sheet-ease) forwards; }') && css.includes('.umenu.sheet.out { animation: mn-sheet-out var(--d-small) var(--sheet-ease) forwards; }'), 'out is the same move back, on the same curve');
  assert.ok(!/translate: 0 calc\(100%/.test(css) && !/ease-in/.test(css.split('um-inline')[0]!), 'no full-height slide, no other curve');
  // the Frame sheets (Layers, History, Why?) and the Treat card take the same rise
  assert.ok(/max-height: 78%; transform: translateY\(var\(--sheet-rise, 24px\)\)/.test(src('src/ui/shell/shell.css')));
  assert.ok(/transform: translateY\(var\(--sheet-rise, 24px\)\)/.test(src('src/ui/treat/treat.css')));
  const tc = src('src/ui/tests/tests.css');
  assert.ok(tc.includes('.t-pos[data-kind="sheet"] { --t-x: 0px; --t-y: var(--sheet-rise, 24px); --t-o: 0; }') && tc.includes('transition-timing-function: var(--sheet-ease'), 'the Tests sheet takes the same rise and curve');
  assert.ok(!/mp-in|mp-out/.test(css), 'the pushed page is moved by the clock, not by keyframes');
});

test('every phone sheet sits behind the dock and the timeline: one z-index, in menu-motion.css', () => {
  const css = src('src/ui/shell/menu-motion.css');
  assert.ok(css.includes('html.thumb-ui { --z-sheet-phone: calc(var(--z-panel, 10) + 10); }'));
  for (const sel of ['.menu.as-sheet', '.menu.as-sheet.sw-in', '.umenu.sheet', '.pal-back']) assert.ok(css.includes(`html.thumb-ui .sh-root > ${sel}`) , sel);
  assert.ok(/\{ z-index: var\(--z-sheet-phone\); \}/.test(css) && /\.um-scrim \{ z-index: calc\(var\(--z-sheet-phone\) - 1\); \}/.test(css));
  // the dock is --z-panel + 20 (2D app-10-thumb-dock.css), so 10 + 10 stays under it; the Frame sheets and the cards are lower still
  assert.ok(/\.app\.thumb \.vdock:not\(\.mini\) \{ z-index: calc\(var\(--z-panel\) \+ 20\)/.test(src('src/ui/css2d/app-10-thumb-dock.css')));
  for (const f of ['src/ui/shell/shell.css', 'src/ui/tests/tests.css', 'src/ui/action/action.css']) assert.ok(!/z-index: (?:[3-9]\d|\d{3,})\b[^;]*\}?/.test(src(f).split('\n').filter((l) => /\.sh-sheet \{|\.t-pos \{|\.ac-card \{/.test(l)).join('')), f);
});

test('a pulled sheet is clipped at the dock top by its pull, so it never shows below the timeline bar', () => {
  const css = src('src/ui/shell/menu-motion.css'), sw = src('src/ui/shell/sheet-swipe.ts');
  assert.ok(css.includes('html.thumb-ui :is([data-pulling], [data-swiped], [data-pulled]) { clip-path: inset(-80px -80px calc(var(--sheet-pull, 0px) - var(--sheet-gap, 8px) - 12px) -80px); }'));
  assert.ok(sw.includes("el.style.setProperty('--sheet-pull'") && (sw.match(/removeProperty\('--sheet-pull'\)/g) ?? []).length >= 3, 'the pull is written beside the offset and taken off with it');
  // the line: a sheet rests --sheet-gap above the dock top; with pull p the clip's bottom inset is p - gap - 12, so the line sits 12 px inside the dock at every p
  const inset = (p: number) => p - 8 - 12, sheetBottom = (p: number) => 0 + p, clipLine = (p: number) => sheetBottom(p) - inset(p);
  for (const p of [0, 40, 400, 900]) assert.equal(clipLine(p), 20);
});

test('glide runs its frames to 1 and then says it is done; follow writes the number it was last given', async () => {
  const seen: number[] = [];
  await new Promise<void>((res) => { glide({ ms: 40, curve: (u) => u, apply: (k) => seen.push(k), done: res }); });
  assert.equal(seen.at(-1), 1); assert.ok(seen.every((k, i) => i === 0 || k >= seen[i - 1]!));
  const wrote: number[] = [];
  const f = follow((v) => wrote.push(v));
  f.set(3); f.set(7); f.flush(); f.stop();
  assert.deepEqual(wrote, [7]);
});

test('the Patients list is headed by 2D\'s From readings door (menu.js onFromReadings), which opens the readings sheet', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/ui/menu/UMenu.tsx', import.meta.url), 'utf8');
  assert.match(src, /className="um-row um-fromread"[^>]*onClick=\{\(\) => \{ close\(\); openFromReadings\(\); \}\}/);
  assert.ok(src.indexOf('um-fromread') < src.indexOf('groups.map((g) => (\n            <Fade key={g.group}'), 'the door comes before the patient groups');
});
