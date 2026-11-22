// G1 (Plan 39): no 2D rule out-ranks a 3D override. The 3D sheets override the copied 2D ones (src/ui/css2d, never edited). A 3D declaration only wins if no
// non-!important 2D declaration of the same property, aimed at the same element, has more weight (ids, classes, types) in the same media. `:is()` takes its
// strongest argument, which is how a `.topbar #viewSeg` in a list gave every class in it an id's weight and put the Protein legend's black bar back (22 Nov).
// Fix a hit by making the 3D side win by construction (`!important` on a paint a retired class takes off, as humanized.css and glass.css do, or a selector with
// more weight), never by editing css2d. tests/cascade-allow.json lists the rest by "file | selector | property", and its count only goes down.
// Source-reading, node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCss, stylesheets, spec, cmpSpec, splitSel, type Rule } from './css-parse.ts';

const allow = JSON.parse(readFileSync(new URL('./cascade-allow.json', import.meta.url), 'utf8')) as { ceiling: number; entries: string[] };

/** What one compound selector (the subject, after the last combinator) requires of the element. */
function subject(one: string): { classes: Set<string>; others: Set<string>; pseudoEl: string } | null {
  const pe = /::[\w-]+(\([^)]*\))?$/.exec(one)?.[0] ?? (/:(before|after|first-line|first-letter)$/.exec(one)?.[0] ?? '');
  const bare = pe ? one.slice(0, one.length - pe.length) : one;
  // the last compound: after the last top-level combinator
  let depth = 0, cut = 0;
  for (let i = 0; i < bare.length; i++) { const ch = bare[i]!; if (ch === '(' || ch === '[') depth++; else if (ch === ')' || ch === ']') depth--; else if (depth === 0 && /[\s>+~]/.test(ch)) cut = i + 1; }
  const comp = bare.slice(cut);
  if (!comp || /:(is|where|not|has)\(/.test(comp) && /,/.test(comp.replace(/\([^()]*\)/g, (m) => m.replace(/,/g, '')) ) && false) return null;
  const classes = new Set([...comp.matchAll(/\.([\w-]+)/g)].map((m) => m[1]!));
  const others = new Set([...comp.matchAll(/\[[^\]]*\]|:(?!:)[\w-]+(?:\((?:[^()]|\([^()]*\))*\))?/g)].map((m) => m[0].replace(/\s+/g, '')));
  return { classes, others, pseudoEl: pe };
}
const norm = (v: string): string => v.replace(/\s+/g, '').toLowerCase();
const family = (p: string): string => (p === 'background-color' ? 'background' : p);

test('no non-important 2D rule out-ranks a 3D declaration on the same property of the same class', () => {
  const sheets = stylesheets();
  let order = 0;
  const two: Rule[] = [], three: Rule[] = [];
  for (const [path, css] of sheets) { const rs = parseCss(path, css, order); order += rs.length; (path.startsWith('ui/css2d/') ? two : three).push(...rs); }
  // the 2D declarations that carry a class in their subject, by class
  const byClass = new Map<string, { sel: string; one: string; subj: NonNullable<ReturnType<typeof subject>>; sp: number[]; ctx: string; decls: Rule['decls']; file: string }[]>();
  for (const r of two) for (const one of splitSel(r.sel)) {
    const subj = subject(one); if (!subj || !subj.classes.size) continue;
    const e = { sel: r.sel, one, subj, sp: spec(one), ctx: r.ctx, decls: r.decls, file: r.file };
    for (const c of subj.classes) { const l = byClass.get(c) ?? []; l.push(e); byClass.set(c, l); }
  }
  const hits = new Set<string>();
  for (const r of three) {
    if (/^ui\/css2d-3d\.css$/.test(r.file)) continue;   // the 2D-rule overrides: same selectors, later in order; judged by css2d-copy and the tests that read them
    const global = r.file === 'ui/shell/global.css';   // loads before the 2D sheets: a tie goes to 2D
    for (const one of splitSel(r.sel)) {
      const mine = subject(one); if (!mine || !mine.classes.size) continue;
      const mySpec = spec(one);
      const seen = new Set<unknown>();
      for (const c of mine.classes) for (const e of byClass.get(c) ?? []) {
        if (seen.has(e)) continue; seen.add(e);
        if (e.ctx && e.ctx !== r.ctx) continue;
        if (e.subj.pseudoEl !== mine.pseudoEl) continue;
        if (![...e.subj.classes].every((x) => mine.classes.has(x)) || ![...e.subj.others].every((x) => mine.others.has(x))) continue;   // 2D needs more than 3D's element has
        const c2 = cmpSpec(e.sp, mySpec);
        if (!(c2 > 0 || (c2 === 0 && global))) continue;
        for (const d of r.decls) {
          if (d.important) continue;
          const theirs = e.decls.find((x) => family(x.prop) === family(d.prop) && !x.important && x.value !== '' && norm(x.value) !== norm(d.value));
          const theirsImp = e.decls.find((x) => family(x.prop) === family(d.prop) && x.important && norm(x.value) !== norm(d.value));
          if (theirs || theirsImp) hits.add(`${r.file} | ${one} | ${family(d.prop)}`);
        }
      }
    }
  }
  const found = [...hits].sort();
  const fresh = found.filter((h) => !allow.entries.includes(h));
  assert.deepEqual(fresh, [], `these 3D declarations lose to a heavier 2D rule: make them win by construction (!important on a retired class's paint, or more weight), do not edit css2d, and do not add to cascade-allow.json\n${fresh.join('\n')}`);
  assert.ok(allow.entries.length <= allow.ceiling, `cascade-allow.json holds ${allow.entries.length}, over its ceiling ${allow.ceiling}: the list only goes down`);
  const stale = allow.entries.filter((e) => !found.includes(e));
  assert.deepEqual(stale, [], 'these allow-list entries no longer hit: delete them and lower the ceiling');
});

test('the Protein legend (the one this gate was written for) wins by !important', () => {
  const h = parseCss('ui/humanized.css', readFileSync(new URL('../src/ui/humanized.css', import.meta.url), 'utf8')).find((r) => r.sel === 'html:root .sv-legend');
  assert.ok(h);
  for (const p of ['background', 'box-shadow', 'border-radius', 'backdrop-filter']) assert.ok(h!.decls.find((d) => d.prop === p)?.important, p);
});
