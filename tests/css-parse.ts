// A small stylesheet reader shared by the node tests that judge the cascade (tests/css-cascade.test.ts, tests/colour-tokens.test.ts): every style rule with its
// selector, declarations (!important kept), the at-rule context it sits in (@media / @supports, flattened) and its position, in file order. No browser, no postcss.
import { readFileSync, readdirSync } from 'node:fs';

export interface Decl { prop: string; value: string; important: boolean }
export interface Rule { file: string; sel: string; decls: Decl[]; ctx: string; order: number }

const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '');

export function parseDecls(body: string): Decl[] {
  const out: Decl[] = [];
  for (const part of body.split(/;(?![^()]*\))(?![^"']*["'][^"']*$)/)) {
    const m = /^\s*([\w-]+)\s*:\s*([\s\S]*?)\s*$/.exec(part); if (!m) continue;
    const imp = /\s*!important\s*$/i.test(m[2]!);
    out.push({ prop: m[1]!.toLowerCase(), value: m[2]!.replace(/\s*!important\s*$/i, '').replace(/\s+/g, ' ').trim(), important: imp });
  }
  return out;
}

export function parseCss(file: string, css: string, startOrder = 0): Rule[] {
  const s = strip(css), rules: Rule[] = [];
  let order = startOrder;
  const walk = (from: number, to: number, ctx: string): void => {
    let i = from;
    while (i < to) {
      while (i < to && /\s/.test(s[i]!)) i++;
      if (i >= to) break;
      let j = i, depth = 0;
      while (j < to && !(s[j] === '{' && depth === 0) && !(s[j] === ';' && depth === 0)) { if (s[j] === '(') depth++; else if (s[j] === ')') depth--; j++; }
      if (j >= to || s[j] === ';') { i = j + 1; continue; }
      const prelude = s.slice(i, j).trim();
      let k = j + 1, d = 1;
      while (k < to && d > 0) { if (s[k] === '{') d++; else if (s[k] === '}') d--; k++; }
      const inner = [j + 1, k - 1] as const;
      if (prelude.startsWith('@')) {
        if (/^@(media|supports|layer|container)/i.test(prelude)) walk(inner[0], inner[1], `${ctx}${ctx ? ' && ' : ''}${prelude}`);
      } else rules.push({ file, sel: prelude.replace(/\s+/g, ' '), decls: parseDecls(s.slice(inner[0], inner[1])), ctx, order: order++ });
      i = k;
    }
  };
  walk(0, s.length, '');
  return rules;
}

/** Every stylesheet under src (the engine's excluded), as [path under src, text]. */
export function stylesheets(): [string, string][] {
  const root = new URL('../src/', import.meta.url);
  const out: [string, string][] = [];
  const go = (u: URL, rel: string): void => { for (const d of readdirSync(u, { withFileTypes: true })) { if (d.isDirectory()) { if (d.name !== 'engine') go(new URL(d.name + '/', u), rel + d.name + '/'); } else if (d.name.endsWith('.css')) out.push([rel + d.name, readFileSync(new URL(d.name, u), 'utf8')]); } };
  go(root, '');
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}

/** Specificity (ids, classes/attributes/pseudo-classes, types) of one complex selector; :is/:not/:has take their strongest argument, :where none. */
export function spec(sel: string): [number, number, number] {
  let s = sel, a = 0, b = 0, c = 0;
  for (;;) {
    const m = /:(is|not|where|has|matches)\(([^()]*)\)/.exec(s); if (!m) break;
    if (m[1] !== 'where') { const top = m[2]!.split(',').map((x) => spec(x.trim())).sort((x, y) => y[0] - x[0] || y[1] - x[1] || y[2] - x[2])[0]!; a += top[0]; b += top[1]; c += top[2]; }
    s = s.replace(m[0], '');
  }
  a += (s.match(/#[\w-]+/g) ?? []).length;
  b += (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length;
  c += (s.match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length + (s.match(/::[\w-]+/g) ?? []).length;
  return [a, b, c];
}
export const cmpSpec = (x: number[], y: number[]): number => x[0]! - y[0]! || x[1]! - y[1]! || x[2]! - y[2]!;

/** A selector list split at its top-level commas (not those inside :is(), :not(), [attr] or quotes). */
export function splitSel(sel: string): string[] {
  const out: string[] = []; let depth = 0, q = '', cur = '';
  for (const ch of sel) {
    if (q) { if (ch === q) q = ''; cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[') depth++; else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}
