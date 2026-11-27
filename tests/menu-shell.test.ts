// The one menu shell (menu unification, stage 4: reports/menu-unification.md 3.2 "Menu shell"). Before it the menus were built five ways (MenuPop, Anchored, UMenu, the Layers sheet's Frame,
// the slide list), each with its own presence, leave time, head, grab bar and close, so they drifted (UMenu drew two grab bars; the Layers sheet had a title and no X; the slide list faded on
// its own 220 ms). Pinned here: every menu of the surfaces table goes through <Menu>, a sheet's head always has one grab bar, its title and one X, and every leave time is surface/motion.ts's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { SURFACES } from '../src/ui/surface/kinds.ts';
import { MENU_IDS, MENU_SKINS, headOf } from '../src/ui/surface/menu-head.ts';
import { leaveMs, leaveCss } from '../src/ui/surface/motion.ts';
import { D_FLIP, D_SMALL, LEAVE_SLACK_MS } from '../src/ui/motion.ts';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const code = (p: string) => src(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const walk = (d: string): string[] => readdirSync(new URL(`../${d}`, import.meta.url)).flatMap((n) => {
  const p = `${d}/${n}`;
  return statSync(new URL(`../${p}`, import.meta.url)).isDirectory() ? walk(p) : /\.(tsx?)$/.test(n) ? [p] : [];
});
/** The files that hold a menu (each one's rows and its <Menu>). */
const MENU_FILES = ['src/ui/menu/UMenu.tsx', 'src/ui/settings/SettingsSheet.tsx', 'src/ui/shell/HelpSheets.tsx', 'src/ui/readings/FromReadings.tsx', 'src/ui/shell/FigureMenu.tsx',
  'src/ui/shell/TopBar.tsx', 'src/ui/shell/PlayBar.tsx', 'src/ui/deck/JumpList.tsx'];
/** Menus the shell does not draw, each with where it stands and the rule it still shares. */
const LEFT: Record<string, string> = { 'tips-views': 'inline in its Tests pane (tests/ir/TipsView.tsx), closed by the shared outside press (surface/outside.ts), Esc, a choice, a blur' };

test('the menu ids are the surfaces table\'s menus', () => {
  assert.deepEqual([...MENU_IDS].sort(), Object.entries(SURFACES).filter(([, d]) => d.kind === 'menu').map(([k]) => k).sort());
  assert.ok(MENU_IDS.length >= 11);
});

test('every menu of the surfaces table is rendered through <Menu> (or useMenu and <Menu ctl>), once', () => {
  const ui = walk('src/ui').filter((p) => p.endsWith('.tsx'));
  const where = new Map<string, string[]>();
  for (const p of ui) {
    const s = code(p);
    for (const m of s.matchAll(/<Menu id="([\w-]+)"/g)) where.set(m[1]!, [...(where.get(m[1]!) ?? []), p]);
    // the top bar's Blood and Layers menus are one component for two ids (FigureMenu kind)
    if (/<Menu id=\{kind\}/.test(s)) for (const k of ['blood', 'layers']) where.set(k, [...(where.get(k) ?? []), p]);
  }
  for (const id of MENU_IDS) {
    if (LEFT[id]) { assert.ok(!where.has(id), `${id} is listed as left but is a <Menu> now: take it off the list`); continue; }
    assert.ok(where.has(id), `${id} is not drawn by the menu shell`);
  }
  // one owner per id, but Layers: the top bar's (wide) and the foot's (phone) never both mount (shell/room.ts figureRowsOwner, tests/layers-one-owner.test.ts)
  for (const [id, files] of where) assert.equal(files.length, id === 'layers' ? 2 : 1, `${id}: ${files.join(', ')}`);
  // the slide list's open state is the deck's, handed to the shell
  assert.match(code('src/ui/deck/JumpList.tsx'), /const state: MenuState = \{ open, close: \(\) => useUi\.getState\(\)\.setJump\(false\) \};/);
});

test('no menu builds its own frame any more: the old shells are gone, and no menu file mounts, fades, heads or pulls a menu itself', () => {
  const all = walk('src').map((p) => [p, code(p)] as const);
  for (const [p, s] of all) assert.ok(!/\bMenuPop\b|\bAnchored\b(?!\s*=)|MENU_LEAVE_MS|menuExitMs/.test(s) || p.startsWith('src/scene/'), `${p} still uses an old menu shell`);
  const presence = all.filter(([, s]) => /function usePresence\b/.test(s)).map(([p]) => p);
  assert.deepEqual(presence, ['src/ui/surface/presence.ts'], 'one presence for every surface that mounts on open');
  for (const f of MENU_FILES) {
    const s = code(f);
    assert.ok(!/createPortal\(/.test(s) || f === 'src/ui/deck/JumpList.tsx' && /createPortal\(<div className=\{`pz-black/.test(s), `${f} mounts through the shell`);
    assert.ok(!/sh-grabbar|um-grab|um-scrim|sheetRoot\(|useSheetSwipe\(|useOutside\(|place(Popover|At)\(/.test(s), `${f} leaves the grab bar, scrim, mount, pull, outside press and placement to the shell`);
    assert.ok(!/className="ib[^"]*"[^>]*aria-label="Close/.test(s), `${f} draws no X of its own (CloseX, in the shell's head)`);
  }
});

test('a sheet always has one grab bar, its title (or the field in its place) and one X; a floating menu has a head only with a field or when it asks', () => {
  for (const field of [false, true]) for (const always of [false, true]) {
    const h = headOf('sheet', { field, always });
    assert.deepEqual(h, { grab: true, head: true, title: field ? 'field' : 'title', x: true }, `sheet, field ${field}, always ${always}`);
    const f = headOf('float', { field, always });
    assert.equal(f.grab, false, 'no grab bar where it floats');
    assert.equal(f.head, field || always); assert.equal(f.x, f.head); assert.equal(f.title, f.head ? (field ? 'field' : 'title') : null);
  }
  // the shell draws exactly that: the one GrabBar and the one CloseX (surface/parts.tsx) in the head row, from headOf, in every skin
  const shell = code('src/ui/surface/Menu.tsx');
  assert.match(shell, /const h = headOf\(mode, \{ field: field != null, always: headAlways \}\);/);
  assert.match(shell, /\{h\.grab && <GrabBar \/>\}\n\s*\{h\.head && \(\n\s*<div className=\{s\.head\}>\n\s*\{h\.title === 'field' \? field : <span className=\{s\.title \|\| undefined\}>\{title\}<\/span>\}\n\s*<CloseX label=\{closeLabel\} onClose=\{close\}/);
  assert.equal((shell.match(/<GrabBar \/>/g) ?? []).length, 1);
  assert.match(shell, /import \{ CloseX, GrabBar \} from '\.\/parts\.tsx';/);
  for (const s of Object.values(MENU_SKINS)) assert.ok(s.head && s.base && s.leaving, 'every skin names its head row, its frame and its leave');
  // a sheet's mode is the one rule's (surface/mode.ts), never a media query or a device class of the menu's own
  assert.match(shell, /const mode = useSurfaceMode\(\);/);
  for (const f of ['src/ui/surface/Menu.tsx', 'src/ui/menu/UMenu.tsx', 'src/ui/deck/JumpList.tsx', 'src/ui/shell/PlayBar.tsx', 'src/ui/shell/TopBar.tsx']) {
    assert.ok(!/STACK_MQ|THUMB_MQ|useThumb\(|onPhone\(|frameIsSheet\(|useSurfaceMode\(\) === 'sheet'/.test(code(f)) || f === 'src/ui/surface/Menu.tsx', `${f} asks surface/mode.ts through the shell`);
  }
});

test('every menu leaves on the one leave time of surface/motion.ts, and its stylesheet leaves on the same token', () => {
  assert.equal(leaveCss('menu', 'float'), D_FLIP); assert.equal(leaveCss('menu', 'sheet'), D_SMALL);
  assert.equal(leaveMs('menu', 'float'), D_FLIP + LEAVE_SLACK_MS); assert.equal(leaveMs('menu', 'sheet'), D_SMALL + LEAVE_SLACK_MS);
  const shell = code('src/ui/surface/Menu.tsx');
  assert.match(shell, /usePresence\(open, leaveMs\('menu', mode\)\)/);
  assert.match(shell, /import \{ leaveMs \} from '\.\/motion\.ts';/);
  // no menu file and no part of the shell holds a time of its own for a leave (UMenu's 120 and 240, JumpList's 220, MenuPop's own)
  for (const f of [...MENU_FILES, 'src/ui/surface/Menu.tsx', 'src/ui/surface/presence.ts']) {
    const s = code(f);
    assert.ok(!/LEAVE_MS\s*=\s*\d|usePresence\([^)]*,\s*\d+\)/.test(s), `${f} has a literal leave time`);
  }
  assert.ok(!/clock\.after/.test(code('src/ui/deck/JumpList.tsx')), 'the slide list has no fade timer of its own');
  assert.match(code('src/ui/menu/UMenu.tsx'), /PV_LEAVE_MS = leaveMs\('menu', 'float'\)/);
  // the CSS leaves: a floating menu fades over --d-flip, a sheet slides out over --d-small (menu-motion.css), whatever the menu
  const css = src('src/ui/styles/app-02-controls.css') + src('src/ui/styles/app-07-floating.css'), motion = src('src/ui/shell/menu-motion.css'), own = src('src/ui/surface/menu.css');
  assert.match(css, /\.menu\.leaving \{ pointer-events: none; animation: scale-settle-out var\(--d-flip\)/);
  assert.match(css, /\.umenu\.out \{ animation: scale-settle-out var\(--d-flip\)/);
  assert.ok(motion.includes('.sh-clip-in > .menu.as-sheet.leaving { animation: mn-sheet-out var(--d-small)') && motion.includes('.sh-clip-in > .umenu.sheet.out { animation: mn-sheet-out var(--d-small)'));
  assert.match(own, /\.pz-jump\.sf-menu\[data-mode="float"\]\.pz-leave \{ transition-duration: var\(--d-flip\); \}/);
  assert.ok(!/\d+ms|\d+(\.\d+)?s\b/.test(own.replace(/\/\*[\s\S]*?\*\//g, '')), 'the shell\'s stylesheet writes no literal time');
});

test('the menus close by the one rule: a press outside and off the opener, the sheet\'s scrim (by press), the X, a pull; the TIPS views menu shares the outside press', () => {
  const shell = code('src/ui/surface/Menu.tsx');
  assert.match(shell, /useOutsidePress\(open, \[ref\], pressClose, `\[data-opens="\$\{id\}"\]`\)/);
  assert.match(shell, /um-scrim[^\n]*onPointerDown=\{pressClose\}/);
  assert.match(shell, /useSheetSwipe\(ref, close, \(\) => sheet, shown\)/);
  assert.match(code('src/ui/tests/ir/TipsView.tsx'), /useOutsidePress\(open, \[menu, more\], \(\) => setOpen\(false\)\)/);
  // a menu's opener names it, so a press on the opener toggles it instead of closing it under the finger
  for (const [f, id] of [['src/ui/shell/PlayBar.tsx', 'speed'], ['src/ui/shell/PlayBar.tsx', 'jump'], ['src/ui/shell/TopBar.tsx', 'lens'], ['src/ui/deck/PresenterBar.tsx', 'slides']] as const) {
    assert.ok(code(f).includes(`data-opens="${id}"`), `${f}: the ${id} opener`);
  }
});
