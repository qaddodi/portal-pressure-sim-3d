// Floating controls stand clear of every card that opens beside the figure (owner's coordinator, 26 Nov: the zoom buttons sat over the History panel on a Mac; then, the root rule: every
// floating panel or card clears them, Treat and the Tests card included). The root: each card that stands at the screen's right edge has a reach, how far its left edge stands from that edge,
// from the same width variable the card itself is placed by, and the shell moves the zoom pill to 8 px left of the farthest open one (shell.css). A sheet across the middle leaves no room
// beside it, so the pill fades under it. A new surface pinned to the right edge must join the reach rules, or be listed below with the reason it never meets the pill.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

/** the reach rule each kind of right-hand card needs, and the width variable both the card and its reach read */
function surfaceOf(sel: string): { key: string; reach: RegExp; width: RegExp } | null {
  const sheet = /^\.sh-sheet\[data-kind="([a-z]+)"\]$/.exec(sel);
  if (sheet) {
    const k = sheet[1]!;
    return {
      key: `sheet:${k}`,
      reach: new RegExp(`:has\\(\\.sh-sheet\\[data-kind="${k}"\\]\\[data-open="true"\\]\\) \\.zoom-pill \\{\\s*--reach-sheet: calc\\(var\\(--sh-pad-x\\) \\+ var\\(--panel-${k}\\)\\);\\s*\\}`),
      width: new RegExp(`\\.sh-sheet\\[data-kind="${k}"\\][^{]*\\{[^}]*width: var\\(--panel-${k}\\)`),
    };
  }
  if (sel === '.treat-card') return { key: 'treat', reach: /:has\(\.treat-card\[data-open="true"\]\) \.zoom-pill \{ --reach-treat: calc\(var\(--reach-tests, 0px\) \+ var\(--gap, 12px\) \+ var\(--card-treat\)\); \}/, width: /\.treat-card \{[^}]*width: var\(--card-treat\)/ };
  if (sel === '.instrument-workspace.side') {
    return {
      key: 'tests',
      reach: /\.app\.dock-side:not\(\.instrument-focus\) \.zoom-pill \{ --reach-tests: calc\(var\(--gap, 12px\) \+ var\(--rail-w, 0px\) \+ var\(--side-ws-w, 500px\)\); \}/,
      width: /\.instrument-workspace\.side \{[^}]*right: calc\(var\(--safe-r\) \+ var\(--gap\) \+ var\(--rail-w, 0px\)\)[^}]*width: var\(--instrument-w, 500px\)/,
    };
  }
  return null;
}

test('every card that stands at the right edge has a reach the zoom pill steps aside by, from the width the card itself is placed by', () => {
  const found = new Set<string>(), strays: string[] = [];
  for (const r of rules) {
    if (!pinnedRight(r.body)) continue;
    for (const sel of r.sel.split(',').map((s) => s.trim())) {
      const s = surfaceOf(sel);
      if (s) {
        found.add(s.key);
        assert.match(shell, s.reach, `${s.key}: open, the zoom pill steps aside by its reach`);
        assert.ok(all.some(([, css]) => s.width.test(css)), `${s.key}: the card is as wide as the reach says (one number, read by both)`);
      } else if (!NEVER_OVER.some(([re]) => re.test(sel))) strays.push(`${r.f}: ${sel}`);
    }
  }
  assert.deepEqual(strays, [], 'a surface pinned to the right edge with no reach: give it one in shell.css, or say here why it never meets the pill');
  assert.deepEqual([...found].sort(), ['sheet:compare', 'sheet:help', 'sheet:history', 'sheet:settings', 'sheet:why', 'tests', 'treat']);
});

test('the pill goes 8 px left of the farthest open card, by a transform that glides, on every screen it stands on (a phone held sideways too)', () => {
  assert.match(shell, /\.sh-root:not\(\[data-bottom="true"\]\) \.zoom-pill \{\s*--fs-zoom-r: max\(0px, calc\(max\(var\(--reach-sheet, 0px\), var\(--reach-tests, 0px\), var\(--reach-treat, 0px\)\) \+ 8px - var\(--gap, 12px\)\)\);/);
  assert.match(floating, /\.zoom-pill \{[^}]*right: calc\(var\(--safe-r\) \+ var\(--gap\)\);[^}]*transform: translateX\(calc\(-1 \* var\(--fs-zoom-r, 0px\)\)\)/, 'a transform: it glides aside, never jumps');
  const pill = rules.filter((r) => /(^|,\s*)\.zoom-pill$/.test(r.sel) || r.sel.endsWith(' .zoom-pill'));
  for (const r of pill) assert.doesNotMatch(r.body, /(^|;)\s*transform:\s*none/, `${r.f}: nothing takes the aside away (${r.sel})`);
  // (Treat stands left of a Tests card on the right, so its reach starts at the Tests card's: treat/beside.ts gives Treat that same step)
  assert.match(readFileSync('src/ui/treat/beside.ts', 'utf8'), /vp\.w - vp\.safe\.right - place\.rect\.x/);
  // (the Tests card publishes the width it is placed at, which the reach reads)
  const tests = readFileSync('src/ui/tests/TestsLayer.tsx', 'utf8');
  assert.match(tests, /publishSideWidth\(app, open && !away && side \? place\.rect\.w : null\)/);
  assert.match(tests, /'--instrument-w' as string\]: `\$\{place\.rect\.w\}px`/);
  assert.match(shell, /:not\(\[data-device="phone-landscape"\]\):has\(\.sh-sheet\[data-kind="history"\]/, 'History held sideways is at the left: the pill stays');
});

test('a sheet across the screen leaves no room beside it (Search, the Guide, Treat on a phone): the pill fades while it is up', () => {
  const middle = new Set<string>();
  for (const r of rules) {
    if (!/(^|;)\s*left: 50%/.test(r.body)) continue;
    for (const s of r.sel.split(',').map((x) => x.trim())) { const m = /^\.sh-sheet\[data-kind="([a-z]+)"\]$/.exec(s); if (m) middle.add(m[1]!); }
  }
  assert.deepEqual([...middle].sort(), ['guide', 'search']);
  const fade = /\.sh-root:has\(\.sh-sheet\[data-open="true"\]:is\(([^)]*)\)\) \.zoom-pill \{ opacity: 0; pointer-events: none; \}/.exec(shell);
  assert.ok(fade, 'the fade rule');
  for (const k of middle) assert.match(fade[1]!, new RegExp(`\\[data-kind="${k}"\\]`), `${k}: the pill fades under it`);
  // (the screens where Treat is a sheet across the foot: the pill fades under it there, by the very query that makes it one)
  const sheetQ = /@media ([^{]+)\{[^@]*?\.panel, \.treat-card \{\s*top: auto !important; left: 0 !important; right: 0 !important;/.exec(readFileSync('src/ui/styles/app-07-floating.css', 'utf8'));
  assert.ok(sheetQ, 'the query that makes Treat a sheet');
  const q = sheetQ[1]!.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(shell, new RegExp(`@media ${q} \\{\\s*\\.sh-root:not\\(\\[data-bottom="true"\\]\\):has\\(\\.treat-card\\[data-open="true"\\]\\) \\.zoom-pill \\{ --reach-treat: 0px; opacity: 0; pointer-events: none; \\}`));
});
