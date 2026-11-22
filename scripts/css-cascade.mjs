// A small CSS cascade resolver for node tests (Plan 37 gate c; postcss is not installed). It answers "what does this property finally resolve to for this element, in this place?"
// by specificity, then source order, with !important last, from the stylesheets under src/ (the engine is left out). Media blocks are flattened (every block counts: the strictest reading).
// Supported selector syntax: type, .class, #id, [attr], [attr=v], :root, :not/:is/:where(list), descendant and child combinators. A rule with any other pseudo-class (:hover, :active, ::before…)
// or a sibling combinator never matches (it is a state or a pseudo-element, not the element at rest).
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const u = new URL(d.name + (d.isDirectory() ? '/' : ''), dir);
  return d.isDirectory() ? (d.name === 'engine' || d.name === 'node_modules' ? [] : walk(u)) : d.name.endsWith('.css') ? [u] : [];
});
const splitTop = (s, ch) => { const out = []; let depth = 0, cur = ''; for (const c of s) { if (c === '(' || c === '[') depth++; if (c === ')' || c === ']') depth--; if (c === ch && depth === 0) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.map((x) => x.trim()).filter(Boolean); };

/** Every rule of every stylesheet under `root` (a URL), in source order: { selector, decls: Map(prop -> {value, important}), order, file }. */
export function loadRules(root = new URL('../src/', import.meta.url)) {
  const rules = []; let order = 0;
  for (const f of walk(root).sort((a, b) => a.pathname.localeCompare(b.pathname))) {
    const css = strip(readFileSync(f, 'utf8'));
    for (const m of css.matchAll(/([^{}@;][^{}]*)\{([^{}]*)\}/g)) {
      const decls = new Map();
      for (const d of splitTop(m[2], ';')) {
        const i = d.indexOf(':'); if (i < 0) continue;
        const prop = d.slice(0, i).trim().toLowerCase(); let value = d.slice(i + 1).trim(); const important = /!important\s*$/.test(value);
        if (important) value = value.replace(/\s*!important\s*$/, '');
        decls.set(prop, { value, important });
      }
      for (const sel of splitTop(m[1].trim(), ',')) rules.push({ selector: sel, decls, order: order++, file: f.pathname.split('/src/')[1] });
    }
  }
  return rules;
}

// ── selector parsing: a chain of compound selectors joined by ' ' or '>' ──
function compounds(sel) {
  const parts = []; let cur = '', depth = 0, comb = ' ';
  const push = () => { if (cur) { parts.push({ comb, text: cur }); cur = ''; comb = ' '; } };
  for (const c of sel) {
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (depth === 0 && (c === ' ' || c === '>' || c === '+' || c === '~')) { push(); if (c !== ' ') comb = c; else if (comb === ' ') comb = ' '; continue; }
    cur += c;
  }
  push();
  return parts;
}
// One compound against one node { tag, cls:Set, attrs:Map, root }
function matchCompound(text, node) {
  let s = text;
  const tag = /^[a-z][\w-]*|^\*/i.exec(s);
  if (tag) { if (tag[0] !== '*' && tag[0].toLowerCase() !== node.tag) return false; s = s.slice(tag[0].length); }
  while (s) {
    let m;
    if ((m = /^\.([\w-]+)/.exec(s))) { if (!node.cls.has(m[1])) return false; }
    else if ((m = /^#([\w-]+)/.exec(s))) { if (node.id !== m[1]) return false; }
    else if ((m = /^\[([\w-]+)(?:([~|^$*]?=)["']?([^\]"']*)["']?)?\]/.exec(s))) {
      const has = node.attrs.has(m[1]); if (!has) return false;
      if (m[2] === '=' && node.attrs.get(m[1]) !== m[3]) return false;
      if (m[2] && m[2] !== '=' && !(m[2] === '~=' ? node.attrs.get(m[1]).split(/\s+/).includes(m[3]) : m[2] === '^=' ? node.attrs.get(m[1]).startsWith(m[3]) : m[2] === '$=' ? node.attrs.get(m[1]).endsWith(m[3]) : node.attrs.get(m[1]).includes(m[3]))) return false;
    }
    else if ((m = /^:(not|is|where)\(/.exec(s))) {
      let depth = 1, i = m[0].length; while (i < s.length && depth) { if (s[i] === '(') depth++; if (s[i] === ')') depth--; i++; }
      const args = splitTop(s.slice(m[0].length, i - 1), ',');
      const any = args.some((a) => matchCompound(a, node));
      if (m[1] === 'not' ? any : !any) return false;
      m = [s.slice(0, i)];
    }
    else if ((m = /^:root(?![\w-])/.exec(s))) { if (!node.root) return false; }
    else return false;   // any other pseudo-class or pseudo-element: a state, not the element at rest
    s = s.slice(m[0].length);
  }
  return true;
}
/** Does `selector` select the last node of `chain` (root first)? */
export function matches(selector, chain) {
  const parts = compounds(selector);
  if (!parts.length || parts.some((p) => p.comb === '+' || p.comb === '~')) return false;
  const go = (pi, ni) => {
    if (!matchCompound(parts[pi].text, chain[ni])) return false;
    if (pi === 0) return true;
    if (parts[pi].comb === '>') return ni > 0 && go(pi - 1, ni - 1);
    for (let k = ni - 1; k >= 0; k--) if (go(pi - 1, k)) return true;
    return false;
  };
  return go(parts.length - 1, chain.length - 1);
}
/** Specificity [ids, classes, types] of a complex selector (:is/:not count their strongest argument, :where none). */
export function specificity(sel) {
  let s = sel, a = 0, b = 0, c = 0;
  for (;;) {
    const m = /:(is|not|where|has)\(([^()]*)\)/.exec(s); if (!m) break;
    if (m[1] !== 'where') { const top = splitTop(m[2], ',').map(specificity).sort((x, y) => y[0] - x[0] || y[1] - x[1] || y[2] - x[2])[0] ?? [0, 0, 0]; a += top[0]; b += top[1]; c += top[2]; }
    s = s.replace(m[0], '');
  }
  a += (s.match(/#[\w-]+/g) ?? []).length;
  b += (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length;
  c += (s.match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return [a, b, c];
}
const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];

/** A node for the chain: 'div.pz-ab[data-x=1]' style shorthand, or an object { tag, cls, attrs, root }. */
export function node(spec) {
  if (typeof spec !== 'string') return spec;
  const tag = /^[a-z][\w-]*/i.exec(spec)?.[0] ?? 'div';
  return { tag: tag.toLowerCase(), cls: new Set([...spec.matchAll(/\.([\w-]+)/g)].map((m) => m[1])), attrs: new Map([...spec.matchAll(/\[([\w-]+)(?:=([^\]]*))?\]/g)].map((m) => [m[1], m[2] ?? ''])), root: tag === 'html', id: /#([\w-]+)/.exec(spec)?.[1] };
}

/** The final value of each property for the last element of `chain` (specs, root first), or null where no rule sets it. */
export function resolve(rules, chain, props) {
  const nodes = chain.map(node), out = {};
  for (const p of props) {
    let best = null;
    for (const r of rules) {
      const d = r.decls.get(p);
      if (!d || !matches(r.selector, nodes)) continue;
      const key = { imp: d.important ? 1 : 0, spec: specificity(r.selector), order: r.order };
      if (!best || key.imp > best.key.imp || (key.imp === best.key.imp && (cmp(key.spec, best.key.spec) > 0 || (cmp(key.spec, best.key.spec) === 0 && key.order > best.key.order)))) best = { key, value: d.value, rule: r };
    }
    out[p] = best ? best.value : null;
    out[p + ':rule'] = best ? `${best.rule.file}: ${best.rule.selector}` : null;
  }
  return out;
}
export const srcRoot = fileURLToPath(new URL('../src/', import.meta.url));
