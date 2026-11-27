// Floating controls stand clear of every card that opens beside the figure (owner's coordinator, 26 Nov: the zoom buttons sat over the History panel on a Mac; then, the root rule: every
// floating panel or card clears them, Treat and the Tests card included). The root since stage 2 of the menu unification: every panel publishes its box to the one room channel
// (surface/room.ts), the shell writes the farthest right-hand panel's reach as --panel-reach, and one rule moves the zoom pill to 8 px left of it (shell.css). A sheet across the
// middle leaves no room beside it, so the pill fades under it. A new surface pinned to the right edge must be a panel that publishes its box, or be listed below with the reason it
// never meets the pill.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { panelReach } from '../src/ui/surface/room.ts';

const cssFiles = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : []; });
const all = cssFiles('src/ui').map((f) => [f, readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')] as const);
const shell = readFileSync('src/ui/shell/shell.css', 'utf8');
const floating = readFileSync('src/ui/styles/app-07-floating.css', 'utf8');
/** every innermost rule: its selector list and its body */
const rules = all.flatMap(([f, css]) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ f, sel: m[1]!.trim().replace(/\s+/g, ' '), body: m[2]! })));
/** a rule that pins a surface to the screen's right edge (right from the safe area, and no left edge of its own) */
const pinnedRight = (body: string) => /(^|;)\s*right:\s*calc\(var\(--safe-r/.test(body) && !/(^|;)\s*left:(?!\s*auto)/.test(body);

/** right-pinned things that never stand over the pill, and why */
const NEVER_OVER: readonly [RegExp, string][] = [
  [/\.zoom-pill$/, 'the pill itself'],
  [/\.vdock$/, 'the play bar: the pill stands above it'],
  [/\.topbar \.top-right\.float-pill$/, 'the top bar, above the figure'],
  [/\.action-card\.docked$/, 'a docked card above the view switch: the pill rises over it by --sheet-h (Shell.tsx)'],
  [/^\.panel$/, "2D's patient chart: no 3D component renders it"],
];

/** the right-hand panels pinned to the right edge, and the file that publishes each one's box to the one room channel (surface/room.ts) */
function panelOf(sel: string): { key: string; publisher: string; publishes: RegExp } | null {
  if (sel === '.treat-card') return { key: 'treat', publisher: 'src/ui/treat/TreatCard.tsx', publishes: /publishPanel\('treat', \{ rect: placedBox\(panelPlace\('treat', vp, device, \{ step \}\), h\), side: 'right' \}\)/ };
  if (sel === '.instrument-workspace.side') return { key: 'tests', publisher: 'src/ui/tests/TestsLayer.tsx', publishes: /publishPanel\('tests', up \? \{ rect: place\.rect, side: place\.kind === 'side' \? 'right' : 'foot'/ };
  return null;
}

test('every surface that stands at the right edge is a panel that publishes its box to the one room channel, or says why it never meets the pill', () => {
  const found = new Set<string>(), strays: string[] = [];
  for (const r of rules) {
    if (!pinnedRight(r.body)) continue;
    for (const sel of r.sel.split(',').map((s) => s.trim())) {
      const s = panelOf(sel);
      if (s) { found.add(s.key); assert.match(readFileSync(s.publisher, 'utf8'), s.publishes, `${s.key}: its box is in the room channel`); }
      else if (!NEVER_OVER.some(([re]) => re.test(sel))) strays.push(`${r.f}: ${sel}`);
    }
  }
  assert.deepEqual(strays, [], 'a surface pinned to the right edge that is no panel: make it one (it publishes its box), or say here why it never meets the pill');
  assert.deepEqual([...found].sort(), ['tests', 'treat']);
  // (History, Compare and Why no longer pin themselves: the panel shell places every panel by the one rule, and publishes its box)
  const panel = readFileSync('src/ui/surface/Panel.tsx', 'utf8'), pcss = readFileSync('src/ui/surface/panel.css', 'utf8');
  assert.match(panel, /publishPanel\(id, rect && place \? \{ rect, side: place\.column === 'left' \? 'left' : 'right' \} : null\)/);
  assert.match(pcss, /\.sf-panel\[data-surface="float"\] \{[^}]*left: var\(--pl-x\) !important;[^}]*right: auto !important;/);
  for (const k of ['history', 'compare', 'why']) assert.ok(!rules.some((r) => r.sel.includes(`.sh-sheet[data-kind="${k}"]`) && /(^|;)\s*(right|width):/.test(r.body)), `${k} has no place of its own`);
  // the dead sheet boxes of the surfaces that stopped being Frames (the main menu, Settings, Help, Search) are gone, and with them their reach rules
  for (const [f, css] of all) assert.doesNotMatch(css, /\.sh-sheet\[data-kind="(menu|settings|help|search)"\]/, f);
  assert.doesNotMatch(shell, /--reach-(sheet|tests|treat)/, 'no reach of its own per panel: one rule reads the channel');
});

test('the pill goes 8 px left of the farthest open right-hand panel, one rule for every panel, by a transform that glides, on every screen it stands on (a phone held sideways too)', () => {
  assert.match(shell, /\.sh-root:not\(\[data-bottom="true"\]\) \.zoom-pill \{\s*--fs-zoom-r: max\(0px, calc\(var\(--panel-reach, 0px\) \+ 8px - var\(--gap, 12px\)\)\);/);
  assert.match(floating, /\.zoom-pill \{[^}]*right: calc\(var\(--safe-r\) \+ var\(--gap\)\);[^}]*transform: translateX\(calc\(-1 \* var\(--fs-zoom-r, 0px\)\)\)/, 'a transform: it glides aside, never jumps');
  const pill = rules.filter((r) => /(^|,\s*)\.zoom-pill$/.test(r.sel) || r.sel.endsWith(' .zoom-pill'));
  for (const r of pill) assert.doesNotMatch(r.body, /(^|;)\s*transform:\s*none/, `${r.f}: nothing takes the aside away (${r.sel})`);
  // (the reach is the channel's: the farthest right-hand box, a Tests instrument in focus and the sheets over the foot moving nothing; written on .app by the shell)
  const vw = 1440;
  assert.equal(panelReach(vw, []), 0);
  assert.equal(panelReach(vw, [{ rect: { x: 928, y: 60, w: 500, h: 700 }, side: 'right' }, { rect: { x: 496, y: 60, w: 420, h: 400 }, side: 'right' }]), vw - 496);
  assert.equal(panelReach(vw, [{ rect: { x: 12, y: 60, w: 1416, h: 800 }, side: 'right', fills: true }, { rect: { x: 0, y: 600, w: vw, h: 300 }, side: 'foot' }, { rect: { x: 12, y: 60, w: 340, h: 300 }, side: 'left' }]), 0);
  const sh = readFileSync('src/ui/shell/Shell.tsx', 'utf8');
  assert.match(sh, /const reach = usePanelRoom\(\(s\) => panelReach\(vp\.w, boxesOf\(s\.boxes\)\)\);/);
  assert.match(sh, /style\.setProperty\('--panel-reach', `\$\{reach\}px`\)/);
  // (the Tests card publishes the width it is placed at, which the sideways play bar reads)
  const tests = readFileSync('src/ui/tests/TestsLayer.tsx', 'utf8');
  assert.match(tests, /publishSideWidth\(app, open && !away && side \? place\.rect\.w : null\)/);
  assert.match(tests, /'--instrument-w' as string\]: `\$\{place\.rect\.w\}px`/);
});

test('a surface across the middle leaves no room beside it (every dialog: Search, the Guide, About; Treat on a phone): the pill fades while it is up', () => {
  // (since 27 Nov the surfaces across the middle are the dialogs, all drawn by the dialog shell's one layer; no sheet of the shell's stands in the middle any more)
  const middle = new Set<string>();
  for (const r of rules) {
    if (!/(^|;)\s*left: 50%/.test(r.body)) continue;
    for (const s of r.sel.split(',').map((x) => x.trim())) { const m = /^\.sh-sheet\[data-kind="([a-z]+)"\]$/.exec(s); if (m) middle.add(m[1]!); }
  }
  assert.deepEqual([...middle], [], 'a surface across the middle is a dialog, not a sheet');
  assert.match(shell, /\.sh-root:has\(\.sf-layer\[data-open="true"\]\) \.zoom-pill \{ opacity: 0; pointer-events: none; \}/, 'the fade rule: under every open dialog');
  const dialog = readFileSync('src/ui/surface/Dialog.tsx', 'utf8');
  assert.match(dialog, /className="sf-layer"[^>]*data-open=\{open\}/, 'the layer says it is open');
  for (const f of ['src/ui/search/SearchSheet.tsx', 'src/ui/shell/HelpSheets.tsx']) assert.match(readFileSync(f, 'utf8'), /<Dialog id="(search|guide)"/, f);
  // (the screens where Treat is a sheet across the foot: the pill fades under it there, by the very query that makes it one)
  const sheetQ = /@media ([^{]+)\{[^@]*?\.panel, \.treat-card \{\s*top: auto !important; left: 0 !important; right: 0 !important;/.exec(readFileSync('src/ui/styles/app-07-floating.css', 'utf8'));
  assert.ok(sheetQ, 'the query that makes Treat a sheet');
  const q = sheetQ[1]!.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(shell, new RegExp(`@media ${q} \\{\\s*\\.sh-root:not\\(\\[data-bottom="true"\\]\\):has\\(\\.treat-card\\[data-open="true"\\]\\) \\.zoom-pill \\{ opacity: 0; pointer-events: none; \\}`));
});
