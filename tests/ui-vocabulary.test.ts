// One motion and shape vocabulary for the 3D-only UI (22 Nov 2026, visual polish review rec A). Root cause of the drift: 2D's scale lived in css2d/tokens.css and was retyped as literals in a dozen TS and CSS files,
// so a sheet, a menu and a card opening together finished at different times, with radii and type sizes of their own. src/ui/motion.ts is now the TS copy of tokens.css and these checks keep both honest.
// Source-level only (nothing is run in a browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { D_FLIP, D_SMALL, D_SURFACE, EASE_ARRIVE, EASE_MOVE, EASE_IN } from '../src/ui/motion.ts';
import { D_FLIP as A_FLIP, D_SMALL as A_SMALL, D_SURFACE as A_SURFACE } from '../src/ui/a11y/motion.ts';
import { ARRIVE_CSS } from '../src/clock/tween.ts';
import { FOLD_MS, FOLD_EASE } from '../src/ui/shell/pill-fold.ts';
import { WALLET_EASE } from '../src/ui/wallet/wallet-machine.ts';
import { M } from '../src/ui/shell/metrics.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** The 3D-only stylesheets (the 2D copies in css2d/ and the *.copied.* files are not ours to edit). */
const CSS = [
  'src/ui/shell/global.css', 'src/ui/shell/shell.css', 'src/ui/shell/ease.css', 'src/ui/shell/menu-motion.css', 'src/ui/deck-ui.css', 'src/ui/action/action.css', 'src/ui/compare/compare.css',
  'src/ui/why/why.css', 'src/ui/history/history.css', 'src/ui/tests/tests.css', 'src/ui/tests/ir/ir.css', 'src/ui/charts/charts.css', 'src/scene/lenses/legend.css',
];
const TS = [
  'src/ui/shell/pill-fold.ts', 'src/ui/shell/figure-dip.ts', 'src/ui/shell/deck-fade.ts', 'src/ui/shell/talk.ts', 'src/ui/tests/TestsLayer.tsx', 'src/ui/treat/TreatCard.tsx', 'src/ui/wallet/wallet-machine.ts',
  'src/ui/a11y/motion.ts', 'src/ui/readings/dom2d.ts', 'src/clock/tween.ts',
];

const TWO_D = new Set(['app-09-tests.css', 'app-03-layouts.css', 'app-05-presenter-cards.css', 'app-11-deck-visuals.css', 'app-08-cards.css', 'app-04-presenter.css'].flatMap((f) => read(`src/ui/css2d/${f}`).replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).split('\n').map((l) => l.trim()).filter((l) => l.length > 40)));
/** The file with its comments blanked (newlines kept, so a line number is still the line), split in lines, beside the raw lines. */
function lines(path: string) {
  const raw = read(path);
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const rows = code.split('\n');
  // a rule lifted from the 2D stylesheets (one `.dk-in` deeper, tests/card-motion-2d.test.ts keeps it equal) is 2D's own line, in 2D's own px: it is not judged here
  return { raw: raw.split('\n'), code: rows.map((l) => (TWO_D.has(l.replace(' > .dk-in', '').trim()) ? '' : l)) };
}
const OWN_PACE = /own pace/i;
const declarations = (line: string, prop: RegExp) => [...line.matchAll(new RegExp(`(?<![\\w-])(${prop.source}):\\s*([^;}]*)`, 'g'))].map((m) => ({ prop: m[1]!, value: m[2]! }));

test('motion.ts is tokens.css: the three durations and the three curves are equal, and every TS copy reads it', () => {
  const tokens = read('src/ui/css2d/tokens.css');
  const css = (name: string) => tokens.match(new RegExp(`--${name}:\\s*([^;]+);`))![1]!.trim();
  assert.equal(`${D_FLIP}ms`, css('d-flip'));
  assert.equal(`${D_SMALL}ms`, css('d-small'));
  assert.equal(`${D_SURFACE}ms`, css('d-surface'));
  const norm = (s: string) => s.replace(/\s+/g, '').replace(/\b0\./g, '.');
  assert.equal(norm(EASE_ARRIVE), norm(css('ease-arrive')));
  assert.equal(norm(EASE_MOVE), norm(css('ease-move')));
  assert.equal(norm(EASE_IN), norm(css('ease-in')));
  assert.deepEqual([A_FLIP, A_SMALL, A_SURFACE], [D_FLIP, D_SMALL, D_SURFACE]);
  assert.equal(ARRIVE_CSS, EASE_ARRIVE);
  assert.equal(WALLET_EASE, EASE_ARRIVE);
  assert.equal(FOLD_EASE, EASE_MOVE);
  assert.equal(FOLD_MS, D_SURFACE);
});

test('the TS files that time or ease something write no cubic-bezier and do not redefine the scale', () => {
  for (const f of TS) {
    const { code } = lines(f);
    code.forEach((l, i) => {
      assert.doesNotMatch(l, /cubic-bezier\(/, `${f}:${i + 1} writes a curve: import it from src/ui/motion.ts`);
      assert.doesNotMatch(l, /\bexport const D_(FLIP|SMALL|SURFACE)\s*=/, `${f}:${i + 1} redefines the scale: re-export it from src/ui/motion.ts`);
    });
  }
});

test('the 3D-only CSS writes only var(--d-*) and var(--ease-*): no curve, and a time off the scale carries an "own pace" comment', () => {
  for (const f of CSS) {
    const { raw, code } = lines(f);
    code.forEach((l, i) => {
      const at = `${f}:${i + 1}`;
      assert.doesNotMatch(l, /cubic-bezier\(/, `${at}: a curve literal (use var(--ease-arrive|move|in))`);
      assert.doesNotMatch(l, /var\(--(sh-ease|sh-t|move)\b|(^|[^-\w])--(sh-ease|sh-t|move|ease)\s*:/, `${at}: a second definition of the scale`);
      assert.doesNotMatch(l, /var\(--(d-[a-z-]+|ease[a-z-]*),\s*[^)]/, `${at}: a literal fallback on a scale variable (tokens.css always loads)`);
      const paced = OWN_PACE.test(raw[i]!) || (i > 0 && OWN_PACE.test(raw[i - 1]!));
      for (const d of declarations(l, /transition|animation|transition-duration|animation-duration|--d-[a-z-]+/)) {
        const times = [...d.value.matchAll(/(?<![\w.-])(\d*\.?\d+)(m?s)\b/g)].filter((t) => Number(t[1]) !== 0);
        if (times.length) assert.ok(paced, `${at}: ${d.prop} has a literal time (${times.map((t) => t[0]).join(', ')}): use var(--d-flip|small|surface), or name it and say "own pace"`);
      }
    });
  }
});

test('the 3D-only CSS uses the four corner tokens, the --t-* type roles and the one kicker rule', () => {
  for (const f of CSS) {
    const { code } = lines(f);
    code.forEach((l, i) => {
      const at = `${f}:${i + 1}`;
      for (const d of declarations(l, /border-radius/)) {
        for (const px of d.value.matchAll(/(?<![\w.-])(\d*\.?\d+)px/g)) {
          const n = Number(px[1]);
          assert.ok(n === 999 || n <= 3, `${at}: border-radius ${px[0]}: use --r-control (6), --r-card (10), --r-sheet (16) or 999px (a hairline nub is 3 px or less)`);
        }
      }
      for (const d of declarations(l, /font|font-size/)) assert.doesNotMatch(d.value, /(?<![\w.-])\d*\.?\d+px/, `${at}: a pixel font size: use --t-cap, --t-lab, --t-body, --t-val or --t-big`);
      if (/text-transform:\s*uppercase/.test(l)) for (const d of declarations(l, /letter-spacing/)) assert.equal(d.value.trim(), 'var(--caps-ls)', `${at}: a kicker's tracking is --caps-ls`);
    });
  }
});

test('a sheet, toast or note over the dock rests on --sheet-foot, --sheet-gap or --sh-gap: no pixel foot', () => {
  for (const f of CSS) {
    const { code } = lines(f);
    code.forEach((l, i) => {
      for (const d of declarations(l, /bottom/)) {
        for (const px of d.value.matchAll(/(?<![\w.-])(\d*\.?\d+)px/g)) assert.ok(Number(px[1]) <= 3, `${f}:${i + 1}: bottom ${px[0]}: use var(--sheet-foot), var(--sheet-gap) or var(--sh-gap)`);
      }
    });
  }
  // the default the stylesheet carries until the shell publishes the real one is the real one
  assert.match(read('src/ui/shell/global.css'), new RegExp(`--sheet-gap:\\s*${M.sheetGap}px`));
});

test('the dead Look swatches and the second easing definitions are gone', () => {
  assert.doesNotMatch(read('src/ui/shell/shell.css'), /\.sh-look/);
  assert.doesNotMatch(read('src/ui/shell/global.css'), /--ease-move\s*:/);
  assert.doesNotMatch(read('src/ui/deck-ui.css'), /--ease\s*:/);
});
