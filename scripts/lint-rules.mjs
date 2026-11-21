// The project's rules that do not bend, as one pass over the syntax tree (scripts/lint.mjs runs it, tests/lint-rules.test.ts proves each rule).
// The parser is rolldown's (oxc: it ships with Vite, so nothing new to install, and parses TS/TSX in milliseconds); typescript 7 has no JS syntax-tree API.
// A rule is { applies(path), visit(node) }; a hit is { rule, path, line, text }. scripts/lint-allow.json holds each rule's allowance (hits tolerated today); it may only go down.
import { parseAst } from 'rolldown/parseAst';

const under = (p, ...dirs) => dirs.some((d) => p === d || p.startsWith(`${d}/`));
// the copied engine and its worker host are not this app's code (and the host has no animation frames)
const vendored = (p) => under(p, 'src/engine');

const unwrap = (n) => { while (n && (n.type === 'ParenthesizedExpression' || n.type === 'TSNonNullExpression' || n.type === 'ChainExpression')) n = n.expression; return n; };
/** a.b.c -> 'a.b.c' (this -> 'this'); '' for anything computed */
const dotted = (n) => !n ? '' : n.type === 'Identifier' ? n.name : n.type === 'ThisExpression' ? 'this' : n.type === 'MemberExpression' && !n.computed ? `${dotted(n.object)}.${n.property.name}` : '';
/** the called name: foo() -> 'foo', a.b.foo() -> 'foo' */
const callName = (n) => { n = unwrap(n); if (n?.type !== 'CallExpression') return ''; const c = unwrap(n.callee); return c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed ? c.property.name : ''; };

export const RULES = {
  /** One clock: requestAnimationFrame / cancelAnimationFrame only in src/clock/frame.ts (draw through clock.hold / clock.invalidate / Tweened). */
  'raf-outside-clock': {
    applies: (p) => !vendored(p) && p !== 'src/clock/frame.ts',
    visit: (n) => n.type === 'Identifier' && (n.name === 'requestAnimationFrame' || n.name === 'cancelAnimationFrame'),
  },
  /** No `a() || step()`: a step on the right of `||` is skipped when the left is already true, so a system silently stops running (scene/any-moving.ts). (`ready && update()` is a guard, not this bug.) */
  'chained-step': {
    applies: (p) => !vendored(p),
    visit: (n) => n.type === 'LogicalExpression' && n.operator === '||' && /^(step|sync|update)([A-Z0-9]|$)/.test(callName(n.right)),
  },
  /** Time comes from the clock: no performance.now, Date.now, setTimeout or setInterval outside src/clock (the allowance falls with the one-source-of-time work). */
  'raw-time': {
    applies: (p) => !vendored(p) && !under(p, 'src/clock'),
    visit: (n) => n.type === 'CallExpression' && ['performance.now', 'Date.now', 'setTimeout', 'setInterval', 'window.setTimeout', 'window.setInterval', 'globalThis.setTimeout', 'globalThis.setInterval'].includes(dotted(unwrap(n.callee))),
  },
  /** Layout reads go through src/ui/layout-snap.ts (the allowance falls as reads move there). */
  'layout-read': {
    applies: (p) => !vendored(p) && p !== 'src/ui/layout-snap.ts',
    visit: (n) => (n.type === 'CallExpression' && (callName(n) === 'getBoundingClientRect' || callName(n) === 'getComputedStyle'))
      || (n.type === 'MemberExpression' && !n.computed && /^offset(Width|Height|Left|Top)$/.test(n.property.name)),
  },
  /** No new `as never` / `as unknown as`: a cast that hides a type error hides the next one too. */
  'unsafe-cast': {
    applies: (p) => !vendored(p),
    visit: (n) => n.type === 'TSAsExpression' && (n.typeAnnotation.type === 'TSNeverKeyword' || unwrap(n.expression).type === 'TSAsExpression' && unwrap(n.expression).typeAnnotation.type === 'TSUnknownKeyword'),
  },
  /** An R3F <Canvas> never runs its own loop: frameloop="never" and the clock's bridge inside it. */
  'canvas-own-loop': {
    applies: (p) => !vendored(p) && p.endsWith('.tsx'),
    visit: (n) => n.type === 'JSXOpeningElement' && n.name.type === 'JSXIdentifier' && n.name.name === 'Canvas'
      && !n.attributes.some((a) => a.type === 'JSXAttribute' && a.name.name === 'frameloop' && a.value?.type === 'Literal' && a.value.value === 'never'),
  },
};

/** Lint source texts: files is [{ path, text }] with repo-relative '/' paths. Returns every hit. */
export function lintFiles(files) {
  const hits = [];
  for (const { path, text } of files) {
    const active = Object.entries(RULES).filter(([, r]) => r.applies(path));
    if (!active.length) continue;
    let ast;
    try { ast = parseAst(text, { lang: path.endsWith('x') ? 'tsx' : 'ts' }); } catch (e) { hits.push({ rule: 'parse-error', path, line: 1, text: String(e.message ?? e).split('\n')[0] }); continue; }
    const lineOf = (pos) => { let l = 1; for (let i = text.indexOf('\n'); i !== -1 && i < pos; i = text.indexOf('\n', i + 1)) l++; return l; };
    const walk = (n) => {
      for (const [rule, r] of active) if (r.visit(n)) hits.push({ rule, path, line: lineOf(n.start), text: text.slice(n.start, n.end).split('\n')[0].slice(0, 100) });
      for (const k in n) { const v = n[k]; if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c); } else if (v && typeof v.type === 'string') walk(v); }
    };
    walk(ast);
  }
  return hits;
}

/** Compare the hits with the allowances: which rules are over, which are under (to lower), and every rule's count. A file that does not parse always fails. */
export function judge(hits, allow) {
  const counts = Object.fromEntries(Object.keys(RULES).map((r) => [r, 0]));
  for (const h of hits) counts[h.rule] = (counts[h.rule] ?? 0) + 1;
  const over = [], under = [];
  for (const r of Object.keys(counts)) { const a = allow[r] ?? 0; if (counts[r] > a) over.push(r); else if (counts[r] < a) under.push(r); }
  return { counts, over, under };
}
