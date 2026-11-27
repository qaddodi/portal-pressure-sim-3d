// Takes the rules of the dead classes (scripts/dead-css.mjs) out of the stylesheets. A selector goes when it names a dead class outside a `:not(...)`, `:is(...)` or `:where(...)` (inside `:not` the class makes the selector
// true, and inside `:is` another member may be live, so removing it would change what matches); a rule goes when none of its selectors is left; an `@media` or `@supports` left empty goes with them. `--dry` only counts.
import { readFileSync, writeFileSync } from 'node:fs';
import postcss from 'postcss';
import { deadClasses } from './dead-css.mjs';

/** The top-level comma parts of a selector list. */
export function splitSelectors(sel) {
  const out = []; let depth = 0, buf = '', quote = '';
  for (const ch of sel) {
    if (quote) { buf += ch; if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(buf.trim()); buf = ''; } else buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** Does this selector name a dead class anywhere outside a `:not(...)`, `:is(...)` and `:where(...)`? (Inside `:not` the class makes it true; inside `:is` another member may be live, so those selectors stay.) */
export function namesOutsideNot(sel, dead) {
  let stripped = '', i = 0;
  while (i < sel.length) {
    const grp = /^:(not|is|where|matches)\(/.exec(sel.slice(i));
    if (grp) { let d = 0, j = i + grp[0].length - 1; for (; j < sel.length; j++) { if (sel[j] === '(') d++; else if (sel[j] === ')' && --d === 0) break; } i = j + 1; continue; }
    stripped += sel[i++];
  }
  for (const m of stripped.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) if (dead.has(m[1])) return true;
  return false;
}

export function prune(css, dead) {
  const root = postcss.parse(css);
  let rules = 0, selectors = 0;
  root.walkRules((r) => {
    if (r.parent?.type === 'atrule' && /keyframes$/i.test(r.parent.name)) return;
    const parts = splitSelectors(r.selector), keep = parts.filter((p) => !namesOutsideNot(p, dead));
    if (keep.length === parts.length) return;
    selectors += parts.length - keep.length;
    if (!keep.length) { r.remove(); rules++; } else r.selector = keep.join(', ');
  });
  root.walkAtRules((a) => { if (/^(media|supports|container|layer)$/i.test(a.name) && a.nodes && !a.nodes.length) a.remove(); });
  return { css: root.toString(), rules, selectors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { dead, where } = deadClasses(), set = new Set(dead), files = new Set(dead.flatMap((d) => [...where.get(d)]));
  let rules = 0, selectors = 0;
  for (const f of files) {
    const src = readFileSync(f, 'utf8'), r = prune(src, set);
    rules += r.rules; selectors += r.selectors;
    if (process.argv[2] !== '--dry' && r.css !== src) writeFileSync(f, r.css);
  }
  console.log(`${rules} rules and ${selectors} selectors of ${dead.length} dead classes in ${files.size} files${process.argv[2] === '--dry' ? ' (dry)' : ' removed'}`);
}
