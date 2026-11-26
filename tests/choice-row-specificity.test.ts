// A row of choices is one row on EVERY layout (Mohammad, 25 Nov, capture 36b7deac: the six chips of Sites and causes 10/14 stood 5 + 1 on an iPhone and the figure shrank to a thumbnail).
// Root cause: fitChoiceRow set data-tight (nowrap, closed up, scaled) but `.pz.stack .pz-ab { flex-wrap: wrap; gap: 6px }` (three classes) beat `.pz-ab[data-tight]` (two), so the row kept wrapping,
// its scroll width never exceeded its room, the measure said "fits at zoom 1" and the last chip fell to a row of its own. The rule pinned here is general: the state rules of the row
// (data-tight, data-two) must out-rank every layout rule that sets the same property on the row, so no layout can undo a step of the fit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

type Spec = [number, number, number];
/** The specificity of one selector (a,b,c): ids, classes + attributes + pseudo-classes, types. :where() counts nothing; :not() and :is() count their argument. */
export function specificity(sel: string): Spec {
  let s = sel.replace(/:where\([^)]*\)/g, '').replace(/:(?:not|is)\(([^)]*)\)/g, ' $1 ');
  const a = (s.match(/#[\w-]+/g) ?? []).length;
  s = s.replace(/#[\w-]+/g, '');
  const attrs = (s.match(/\[[^\]]*\]/g) ?? []).length;
  s = s.replace(/\[[^\]]*\]/g, '');
  const b = attrs + (s.match(/\.[\w-]+/g) ?? []).length + (s.match(/(?<!:):(?!:)[\w-]+/g) ?? []).length;
  s = s.replace(/::?[\w-]+/g, '').replace(/\.[\w-]+/g, '');
  const c = (s.match(/(?:^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return [a, b, c];
}
const beats = (x: Spec, y: Spec): boolean => x[0] !== y[0] ? x[0] > y[0] : x[1] !== y[1] ? x[1] > y[1] : x[2] > y[2];

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.css') ? [p] : []; });
interface Rule { file: string; sel: string; spec: Spec; props: Set<string> }
function rules(): Rule[] {
  const out: Rule[] = [];
  for (const file of walk('src/ui')) {
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const props = new Set([...m[2]!.matchAll(/(?:^|;)\s*([\w-]+)\s*:/g)].map((x) => x[1]!));
      for (const sel of m[1]!.split(',').map((x) => x.trim()).filter(Boolean)) out.push({ file, sel, spec: specificity(sel), props });
    }
  }
  return out;
}
/** Does the selector style the choice row itself (its last compound is .pz-ab, with any attributes)? */
const onRow = (sel: string): boolean => /(?:^|[\s>])[^\s>]*\.pz-ab(?:\[[^\]]*\])*$/.test(sel);

test('specificity: the counter reads the selectors the row rules use', () => {
  assert.deepEqual(specificity('.pz-ab[data-tight]'), [0, 2, 0]);
  assert.deepEqual(specificity('.pz.stack .pz-ab'), [0, 3, 0]);
  assert.deepEqual(specificity('.pz.pz .pz-ab[data-tight]'), [0, 4, 0]);
  assert.deepEqual(specificity(':where(.a) .b'), [0, 1, 0]);
  assert.deepEqual(specificity('.pz:not(.stack):not(.low) .pz-text .pz-abb'), [0, 5, 0]);
});

test('every step of the choice row\'s fit out-ranks every layout rule that sets the same property on the row (no layout may undo data-tight or data-two)', () => {
  const all = rules().filter((r) => onRow(r.sel));
  const STEPS: { attr: string; props: string[] }[] = [{ attr: 'data-tight', props: ['flex-wrap', 'gap', 'justify-content', 'display'] }, { attr: 'data-two', props: ['display', 'gap', 'justify-content'] }];
  for (const { attr, props } of STEPS) {
    const step = all.filter((r) => r.sel.includes(`[${attr}]`) && !r.sel.includes('>'));
    assert.ok(step.length > 0, `${attr} has a rule`);
    for (const prop of props) {
      const mine = step.filter((r) => r.props.has(prop));
      if (!mine.length) continue;
      const floor = mine.map((r) => r.spec).sort((x, y) => (beats(x, y) ? 1 : -1))[0]!;
      for (const o of all) {
        if (o.sel.includes(`[${attr}]`) || !o.props.has(prop)) continue;
        // (the other steps' own rules are not layout rules; and the compact step sets no layout)
        if (/\[data-(?:tight|two|compact)\]/.test(o.sel)) continue;
        assert.ok(beats(floor, o.spec), `${attr} sets ${prop} at ${floor.join(',')} but ${o.file}: "${o.sel}" sets it at ${o.spec.join(',')} and would win in that layout`);
      }
    }
  }
});

test('the row measures what it will show: while data-tight stands the row is never allowed to wrap (the measure and the CSS agree)', () => {
  const css = readFileSync('src/ui/deck-ui.css', 'utf8');
  assert.match(css, /\.pz\.pz \.pz-ab\[data-tight\] \{ flex-wrap: nowrap;/);
  assert.match(css, /\.pz\.pz \.pz-ab\[data-tight\] > \.pz-abb \{[^}]*zoom: var\(--ab-z, 1\)/);
});
