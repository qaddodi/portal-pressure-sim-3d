// Same selector, different sheets, different value for one property: which one wins is the sheets' load order (24 Nov: a lone slider filled half the action card when the lifted 2D sheet's `.ac-cs` won over the app's own).
// This lists them (keyframe steps left out). tests/css-same-selector.test.ts holds the count at its baseline: it may go down (raise a rule's specificity, or move the value to the winning sheet), never up.
import { loadRules } from './css-cascade.mjs';

export function sameSelectorConflicts(rules = loadRules()) {
  const by = new Map();
  for (const r of rules) {
    const k = r.selector.replace(/\s+/g, ' ').trim();
    if (/^(from|to|\d+%)$/.test(k)) continue;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  }
  const out = [];
  for (const [sel, rs] of by) {
    if (new Set(rs.map((r) => r.file)).size < 2) continue;
    const props = new Map();
    for (const r of rs) for (const [p, d] of r.decls) { const k = p + (d.important ? '!' : ''); if (!props.has(k)) props.set(k, []); props.get(k).push({ file: r.file, v: d.value }); }
    for (const [p, list] of props) if (new Set(list.map((x) => x.v)).size > 1 && new Set(list.map((x) => x.file)).size > 1) out.push({ selector: sel, prop: p, sheets: [...new Set(list.map((x) => x.file))] });
  }
  return out;
}
if (import.meta.url === `file://${process.argv[1]}`) for (const c of sameSelectorConflicts()) console.log(`${c.selector} { ${c.prop} }  ${c.sheets.join(' | ')}`);
