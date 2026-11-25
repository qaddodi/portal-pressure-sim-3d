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
  /** One background slot: requestIdleCallback / cancelIdleCallback only in src/clock/idle.ts (ask for background time with whenQuiet: it never runs while anything moves or a finger is down). */
  'raw-idle': {
    applies: (p) => !vendored(p) && p !== 'src/clock/idle.ts',
    visit: (n) => n.type === 'Identifier' && (n.name === 'requestIdleCallback' || n.name === 'cancelIdleCallback'),
  },
  /** Every shader material is named: the late-program row of ?perf and the audit name a program by `material.name` (three.js WebGLPrograms), so an unnamed one shows only as "program" and cannot be traced to its owner. */
  'unnamed-shader': {
    applies: (p) => !vendored(p),
    visit: (n) => n.type === 'NewExpression' && n.callee.type === 'Identifier' && (n.callee.name === 'ShaderMaterial' || n.callee.name === 'RawShaderMaterial')
      && !(n.arguments[0]?.type === 'ObjectExpression' && n.arguments[0].properties.some((q) => q.type === 'Property' && !q.computed && (q.key.name === 'name' || q.key.value === 'name'))),
  },
  /** One way to change the patient's parameters: src/engine/params-send.ts (sendParams). A raw `{ type: 'setParams' }` message reaches the worker but not the page's copy the figure draws from. */
  'raw-setparams': {
    applies: (p) => !under(p, 'src/engine/hales') && p !== 'src/engine/params-send.ts',
    visit: (n) => n.type === 'Property' && !n.computed && (n.key.name === 'type' || n.key.value === 'type') && n.value.type === 'Literal' && n.value.value === 'setParams',
  },
  /** Plan 38 G6: a subscription made inside a function must be kept to be removed. A `.subscribe(`, `onFrame(`, `clock.on(`, `lookGlide.watch(` or `onParamsChange(` call used as a statement inside a function body
   *  throws its remover away; mark the ones that live for the page with `// (lives for the page)` on the line. A useEffect that adds an event listener and returns nothing never removes it. */
  'discarded-unsubscribe': {
    applies: (p) => !vendored(p),
    visit: (n, text) => {
      const out = [];
      const lineEnd = (pos) => { const e = text.indexOf('\n', pos); return e < 0 ? text.length : e; };
      const marked = (st) => text.slice(st.start, lineEnd(st.end)).includes('(lives for the page)');
      const fn = n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression';
      if (fn && n.body?.type === 'BlockStatement') {
        for (const st of n.body.body) {
          if (st.type !== 'ExpressionStatement') continue;
          const e = unwrap(st.expression);
          if (e?.type === 'CallExpression' && ['subscribe', 'onFrame', 'onParamsChange', 'watch'].includes(callName(e)) && (callName(e) !== 'onFrame' || unwrap(e.callee).type === 'Identifier') && (callName(e) !== 'watch' || dotted(unwrap(e.callee)) === 'lookGlide.watch') && !marked(st)) out.push(st);
          else if (e?.type === 'CallExpression' && dotted(unwrap(e.callee)) === 'clock.on' && !marked(st)) out.push(st);
        }
      }
      if (n.type === 'CallExpression' && ['useEffect', 'useLayoutEffect'].includes(callName(n))) {
        const cb = unwrap(n.arguments[0]);
        if (cb && (cb.type === 'ArrowFunctionExpression' || cb.type === 'FunctionExpression') && cb.body?.type === 'BlockStatement') {
          const adds = cb.body.body.find((st) => st.type === 'ExpressionStatement' && callName(st.expression) === 'addEventListener');
          if (adds && !cb.body.body.some((st) => st.type === 'ReturnStatement') && !marked(adds)) out.push(adds);
        }
      }
      return out;
    },
  },
  /** An R3F <Canvas> never runs its own loop: frameloop="never" and the clock's bridge inside it. */
  'canvas-own-loop': {
    applies: (p) => !vendored(p) && p.endsWith('.tsx'),
    visit: (n) => n.type === 'JSXOpeningElement' && n.name.type === 'JSXIdentifier' && n.name.name === 'Canvas'
      && !n.attributes.some((a) => a.type === 'JSXAttribute' && a.name.name === 'frameloop' && a.value?.type === 'Literal' && a.value.value === 'never'),
  },
  /** One door to the anatomy (anatomy integration plan, phase 1, 24 Nov 2026): where organs and vessels are is read from src/scene/anatomy/source.ts only, so the new placement replaces the
   *  data in one place. No file outside src/scene/anatomy imports the copied 2D courses (vessels/paths.copied.ts) or the decks' region boxes (regions.generated.ts, regions.copied.ts). */
  'anatomy-through-source': {
    applies: (p) => !vendored(p) && under(p, 'src') && !under(p, 'src/scene/anatomy'),
    visit: (n) => (n.type === 'ImportDeclaration' || n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration' || n.type === 'ImportExpression')
      && typeof n.source?.value === 'string' && /(^|\/)(paths\.copied|regions\.(generated|copied))(\.ts)?$/.test(n.source.value),
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
      for (const [rule, r] of active) {
        const h = r.visit(n, text);
        if (!h || (Array.isArray(h) && !h.length)) continue;
        for (const t of Array.isArray(h) ? h : [n]) hits.push({ rule, path, line: lineOf(t.start), text: text.slice(t.start, t.end).split('\n')[0].slice(0, 100) });
      }
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

/** Unresolved merge conflict markers (a line that is only `<<<<<<< x`, `=======` or `>>>>>>> x`): the line numbers, or []. A merge left them in scripts/build.mjs once and the deploy failed. */
export function conflictMarkers(text) {
  const out = [];
  text.split('\n').forEach((l, i) => { if (/^(<{7}|>{7})( .*)?$/.test(l) || /^={7}$/.test(l)) out.push(i + 1); });
  return out;
}

/** Rule `long-line` (ratchet, scripts/lint-long-lines.json): no new source line over LONG_LINE characters. The review (F16) counted 1,169 lines over 300, mostly code with a long comment after it, which makes diffs and reviews hard to read.
 *  The existing long lines are not failed: each file's count today is its allowance, so a file may not gain a long line, and a file with none may not get one. A comment goes on its own line, above the code.
 *  The copied engine, the 2D copies (`.copied.`) and generated data (`.generated.`) are not hand-written here and are not counted. `files` is [{ path, text }]; returns { [path]: number of lines over the limit } for the files with any. */
export const LONG_LINE = 200;
export const longLineExempt = (p) => vendored(p) || /\.(copied|generated)\./.test(p);
export function longLines(files) {
  const out = {};
  for (const { path, text } of files) {
    if (longLineExempt(path)) continue;
    let n = 0;
    for (const l of text.split('\n')) if (l.length > LONG_LINE) n++;
    if (n) out[path] = n;
  }
  return out;
}

/** Compare per-file long-line counts with the allowances: `over` names each file that has more than its allowance (0 when unlisted), `under` each file that has fewer (a prompt to lower it), `gone` allowances for files that no longer exist or have no long line left. */
export function judgeLongLines(counts, allow) {
  const over = [], under = [], gone = [];
  for (const [p, n] of Object.entries(counts)) { const a = allow[p] ?? 0; if (n > a) over.push({ path: p, count: n, allowed: a }); else if (n < a) under.push({ path: p, count: n, allowed: a }); }
  for (const p of Object.keys(allow)) if (!counts[p]) gone.push(p);
  return { over, under, gone };
}
