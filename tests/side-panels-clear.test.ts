// Floating controls stand clear of an open side panel (owner's coordinator, 26 Nov: the zoom buttons sat over the History panel on a Mac). The root: the panels' widths live in one place on
// the shell (--panel-<kind>), every panel at the right takes its width from there, and the shell moves the zoom pill aside by it while that panel is open. A new panel at the right must join.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const cssFiles = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : []; });
const all = cssFiles('src/ui').map((f) => [f, readFileSync(f, 'utf8')] as const);
const shell = readFileSync('src/ui/shell/shell.css', 'utf8');

test('every sheet that stands at the right beside the figure takes its width from the shell and moves the zoom pill aside while it is open', () => {
  const right = new Set<string>();
  for (const [, css] of all) {
    for (const m of css.matchAll(/((?:\.sh-sheet\[data-kind="[a-z]+"\](?:,\s*)?)+)\s*\{([^}]*)\}/g)) {
      const body = m[2]!;
      // (a panel pinned to the right edge with a width of its own: the full-width chart, pinned to both edges, is not a side panel)
      if (!/(^|;)\s*right:/.test(body) || /(^|;)\s*left:/.test(body)) continue;
      for (const k of m[1]!.matchAll(/data-kind="([a-z]+)"/g)) right.add(k[1]!);
    }
  }
  assert.deepEqual([...right].sort(), ['compare', 'help', 'history', 'settings', 'why']);
  for (const k of right) {
    assert.match(shell, new RegExp(`--panel-${k}:`), `${k}: its width is the shell's --panel-${k}`);
    const own = all.some(([, css]) => new RegExp(`\\.sh-sheet\\[data-kind="${k}"\\][^{]*\\{[^}]*width: var\\(--panel-${k}\\)`).test(css));
    assert.ok(own, `${k}: the panel itself is that wide (one number, read by both)`);
    assert.match(shell, new RegExp(`:has\\(\\.sh-sheet\\[data-kind="${k}"\\]\\[data-open="true"\\]\\) \\{ --panel-r: var\\(--panel-${k}\\); \\}`), `${k}: open, it is the room the pill steps aside by`);
    assert.match(shell, new RegExp(`\\[data-kind="${k}"\\][^{]*\\)\\) \\.zoom-pill \\{`), `${k}: the pill moves while it is open`);
  }
  assert.match(shell, /\.zoom-pill \{\s*--fs-zoom-r: max\(0px, calc\(var\(--panel-r, 0px\) \+ var\(--sh-pad-x\) \+ 8px - var\(--gap, 12px\)\)\);/, 'clear of the panel by 8 px');
  const pill = readFileSync('src/ui/styles/app-07-floating.css', 'utf8');
  assert.match(pill, /\.zoom-pill \{[^}]*transform: translateX\(calc\(-1 \* var\(--fs-zoom-r, 0px\)\)\)/, 'a transform: it glides aside, never jumps');
  assert.match(shell, /:not\(\[data-device="phone-landscape"\]\):has\(\.sh-sheet\[data-kind="history"\]/, 'History held sideways is at the left: the pill stays');
});
