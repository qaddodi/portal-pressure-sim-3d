// The build lays the base sheets (src/ui/styles) after css3d-over-2d.css, the reverse of main.tsx's import order (vite.config.ts appPreload lists main's own CSS first), so a rule in
// css3d-over-2d.css that restates a base selector at the same specificity loses in the deploy while it wins in the dev server. The Doppler strip's wrap lost that way: "High velocit" was cut
// on an iPhone (TIPS Doppler 7, capture 49141fb9, 25 Nov 2026). For each property that decides whether the strip wraps, the rule that wins by specificity must be css3d's, and by more than
// every base rule, so that no sheet order can change the answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRules, specificity } from '../scripts/css-cascade.mjs';

type Rule = { selector: string; file: string; order: number; decls: Map<string, { value: string }> };
type Spec = [number, number, number];

const cmp = (a: Spec, b: Spec) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const norm = (s: string) => s.replace(/\s+/g, ' ');

// the strip itself, and the pattern word in it, in every card layout the strip is drawn in
const targets = [
  { what: 'wrapping of the strip', last: /\.dop-report$/, props: ['flex-wrap', 'white-space', 'overflow'] },
  { what: 'cutting of the pattern word', last: /\.dop-pattern$/, props: ['overflow', 'text-overflow', 'white-space'] },
];

for (const t of targets) {
  test(`Doppler strip, ${t.what}: decided by specificity, not by which sheet loads last`, () => {
    // (a doubled class, `.dop-report.dop-report`, is how a rule is made one class stronger: it counts as the one class)
    const ends = (sel: string) => t.last.test(norm(sel).replace(/\.(dop-report|dop-pattern)(\.\1)+$/, '.$1'));
    const rules = (loadRules() as Rule[]).filter((r) => norm(r.selector).includes('[data-kind="doppler"]') && !norm(r.selector).includes('.t-card') && ends(r.selector));
    const own = rules.filter((r) => r.file.includes('css3d-over-2d'));
    assert.ok(own.length > 0, 'css3d-over-2d.css still carries the strip rule');
    for (const p of t.props) {
      const set = rules.filter((r) => r.decls.has(p));
      const spec = (r: Rule) => specificity(norm(r.selector)) as Spec;
      const best = set.reduce((a, b) => (cmp(spec(b), spec(a)) > 0 ? b : a));
      assert.ok(best.file.includes('css3d-over-2d'), `${p}: the strongest rule is ${best.file}: ${norm(best.selector).slice(-60)}`);
      for (const r of set) {
        if (r !== best && !r.file.includes('css3d-over-2d')) assert.ok(cmp(spec(best), spec(r)) > 0, `${p}: ties ${r.file}`);
      }
    }
  });
}
