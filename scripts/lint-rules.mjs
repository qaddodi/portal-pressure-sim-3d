// The project's rules that do not bend, as one pass over the syntax tree (scripts/lint.mjs runs it, tests/lint-rules.test.ts proves each rule).
// The parser is rolldown's (oxc: it ships with Vite, so nothing new to install, and parses TS/TSX in milliseconds); typescript 7 has no JS syntax-tree API.
// A rule is { applies(path), visit(node) }; a hit is { rule, path, line, text }. scripts/lint-allow.json holds each rule's allowance (hits tolerated today); it may only go down.
import { parseAst } from 'rolldown/parseAst';

const under = (p, ...dirs) => dirs.some((d) => p === d || p.startsWith(`${d}/`));
// the copied engine and its worker host are not this app's code (and the host has no animation frames)
const vendored = (p) => under(p, 'src/engine');

/** The surfaces that live outside src/ui/surface/ in one file each (the rest are their own folders: treat, history, compare, why). */
const SURFACE_FILES = new Set(['src/ui/tests/TestsLayer.tsx', 'src/ui/action/ActionCard.tsx', 'src/ui/menu/UMenu.tsx', 'src/ui/search/SearchSheet.tsx', 'src/ui/shell/Pages.tsx',
  'src/ui/bigtime/TimelineSheet.tsx']);

/** The shells' components (src/ui/surface/): a role passed to one is a prop the shell writes on its own box. */
const SHELLS = new Set(['Dialog', 'DialogPage', 'Menu', 'Panel', 'ShellPanel']);

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
  /** A card's readiness waits (its stand-still, the crash net) are on the page's REAL work (a layout, a measure, a font), so the layer never waits or reads time on the scaled page clock: the audit's speed mode shrank
   *  the 120 ms stand-still to 2 ms and let cards in half-measured. Use clock.afterReal / clock.nowReal (tests/card-readiness-real-time.test.ts). */
  'card-wait-page-time': {
    applies: (p) => p === 'src/ui/cards/CardLayer.tsx',
    visit: (n) => n.type === 'CallExpression' && ['clock.after', 'clock.now', 'clock.every'].includes(dotted(unwrap(n.callee))),
  },
  /** A timeout raced against outside work is REAL time. `Promise.race([work, new Promise(r => clock.after(r, ms))])` bounds work the page does not drive (the network, a decode, the fonts, the second engine), and
   *  `clock.after` is page time, which the audit's speed mode runs N times faster: the bound fires N times early and a capture reports a picture "did not load" for a file the site serves (capture 414a0ce2, MASLD 3).
   *  Use clock.afterReal; a race between the page's OWN tweens (both legs page time) keeps `// (page time: why)` on the line above or the same line. (tests/outside-waits-real.test.ts lists the known sites.) */
  'race-page-time': {
    applies: (p) => !vendored(p) && !under(p, 'src/clock'),
    visit: (n, text) => {
      if (n.type !== 'CallExpression' || dotted(unwrap(n.callee)) !== 'Promise.race') return [];
      const lineStart = text.lastIndexOf('\n', n.start - 1) + 1, prevStart = text.lastIndexOf('\n', Math.max(0, lineStart - 2)) + 1;
      const end = text.indexOf('\n', n.end), nearby = text.slice(prevStart, end < 0 ? text.length : end);
      if (nearby.includes('(page time')) return [];
      const out = [];
      const walk = (x) => {
        if (!x || typeof x !== 'object') return;
        if (Array.isArray(x)) { for (const y of x) walk(y); return; }
        if (x.type === 'CallExpression' && dotted(unwrap(x.callee)) === 'clock.after') out.push(x);
        for (const k of Object.keys(x)) if (k !== 'type' && k !== 'start' && k !== 'end') walk(x[k]);
      };
      walk(n.arguments);
      return out;
    },
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
  /** A slider keeps its element for the whole drag: a range input (or a component named Slider / Range / SliderCtl) is never keyed by a computed value (`key={c.id + d}`, a template). The key changes when
   *  the value does, React remounts the input under the finger, and the browser drops the drag (TIPS Diameter, 26 Nov 2026: the user had to grab it again at every step). Key by a stable id or the list index only. */
  'slider-key-by-value': {
    applies: (p) => !vendored(p) && p.endsWith('.tsx'),
    visit: (n) => {
      if (n.type !== 'JSXOpeningElement' || n.name.type !== 'JSXIdentifier') return [];
      const range = n.name.name === 'input' && n.attributes.some((a) => a.type === 'JSXAttribute' && a.name.name === 'type' && a.value?.value === 'range');
      if (!range && !/(Slider|Range)/.test(n.name.name)) return [];
      return n.attributes.filter((a) => a.type === 'JSXAttribute' && a.name.name === 'key' && a.value?.type === 'JSXExpressionContainer'
        && ['BinaryExpression', 'TemplateLiteral', 'CallExpression', 'ConditionalExpression', 'LogicalExpression'].includes(unwrap(a.value.expression).type));
    },
  },
  /** One door to the anatomy (anatomy integration plan, phase 1, 24 Nov 2026): where organs and vessels are is read from src/scene/anatomy/source.ts only, so the new placement replaces the
   *  data in one place. No file outside src/scene/anatomy imports the copied 2D courses (vessels/paths.copied.ts) or the decks' region boxes (regions.generated.ts, regions.copied.ts). */
  'anatomy-through-source': {
    applies: (p) => !vendored(p) && under(p, 'src') && !under(p, 'src/scene/anatomy'),
    visit: (n) => (n.type === 'ImportDeclaration' || n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration' || n.type === 'ImportExpression')
      && typeof n.source?.value === 'string' && /(^|\/)(paths\.copied|regions\.(generated|copied))(\.ts)?$/.test(n.source.value),
  },
  /** One map between the 2D figure and the scene (27 Nov 2026, the 2D-plate audit): src/scene/frame2d.ts owns the origin (700, 556) and the scale (300). The origin's y, 556, is written nowhere else, in a number or in a
   *  shader string: a second copy of the map is how a point of the 2D plate ends up laid on the 3D one by a map that has since moved (the spleen caliper, the organ marks). Import x3, y3, x2d, y2d, ORIGIN_2D. */
  'plate-map-literal': {
    applies: (p) => !vendored(p) && under(p, 'src') && p !== 'src/scene/frame2d.ts' && !/\.(copied|generated)\.|\/copied\//.test(p),
    visit: (n) => (n.type === 'Literal' && (n.value === 556 || (typeof n.value === 'string' && /(^|[^\d.])556(\.0)?($|[^\d])/.test(n.value))))
      || (n.type === 'TemplateElement' && /(^|[^\d.])556(\.0)?($|[^\d])/.test(n.value?.raw ?? '')),
  },
  /** One place decides "this patient's HVPG is not measurable" (27 Nov 2026, review 3531bdfa W1): src/engine/hv-flag.ts (hvpgBlockedBy for params, hvpgNotMeasurable for a fingerprint). No file imports the engine's `hvBlocked`
   *  itself, or a surface decides for itself, and the next one (a tile, a table, a chart) prints a number the others call "Not measurable". (The 2D copies keep theirs: `.copied.` files and copied/ folders.) */
  'hv-blocked-direct': {
    applies: (p) => !vendored(p) && under(p, 'src') && !/\.copied\.|\/copied\//.test(p),
    visit: (n) => n.type === 'ImportDeclaration' && /pressure-cuts(\.js)?$/.test(String(n.source?.value))
      && n.specifiers.some((s) => (s.type === 'ImportSpecifier' && (s.imported?.name ?? s.imported?.value) === 'hvBlocked')),
  },
  /** One shell per kind of surface (menu unification, reports/menu-unification.md section 5): a dialog's or a menu's role, `aria-modal` and the sheet's grab bar (`sh-grabbar`) are written only
   *  in src/ui/surface/ (Menu.tsx, Panel.tsx and usePanelShell, Dialog.tsx, parts.tsx GrabBar), so a new menu, panel or dialog cannot be hand-built again: it renders through its kind's shell.
   *  A selector that only reads a role (`'[role="dialog"]'` in a closest()) is not one. The exceptions, each with its reason:
   *    src/ui/tests/ir/TipsView.tsx  role="menu": the TIPS views menu is a small inline menu inside its Tests pane (SURFACES 'tips-views'), closed by the shared outside press;
   *    src/ui/debug/                 the debug tools' own pages (the feedback packet sheet) are not the app's surfaces and never ship in a lesson. */
  'surface-outside-shell': {
    applies: (p) => under(p, 'src/ui') && !under(p, 'src/ui/surface') && !under(p, 'src/ui/debug') && !/\.copied\.|\/copied\//.test(p),
    visit: (n, _text, p) => {
      const roles = p === 'src/ui/tests/ir/TipsView.tsx' ? ['dialog', 'alertdialog'] : ['dialog', 'alertdialog', 'menu'];
      const lit = (v) => {
        v = unwrap(v?.type === 'JSXExpressionContainer' ? v.expression : v);
        return v?.type === 'Literal' ? v.value : v?.type === 'TemplateLiteral' ? v.quasis.map((q) => q.value.raw).join(' ') : null;
      };
      if (n.type === 'JSXOpeningElement') {
        // (a role handed to a shell, `<Dialog role="alertdialog">`, is the shell's to write)
        const toShell = n.name.type === 'JSXIdentifier' && SHELLS.has(n.name.name);
        return n.attributes.filter((a) => {
          if (a.type !== 'JSXAttribute' || a.name.type !== 'JSXIdentifier') return false;
          const name = a.name.name, v = lit(a.value);
          if (name === 'role') return !toShell && roles.includes(v);
          if (name === 'aria-modal') return true;
          return name === 'className' && typeof v === 'string' && /(^|\s)sh-grabbar(\s|$)/.test(v);
        });
      }
      // (a role written by hand outside JSX: an element's setAttribute, or an object of attributes to spread)
      if (n.type === 'CallExpression' && callName(n) === 'setAttribute') {
        const [k, v] = n.arguments.map(lit);
        return k === 'aria-modal' || (k === 'role' && roles.includes(v));
      }
      return n.type === 'Property' && !n.computed && (n.key.name === 'role' || n.key.value === 'role') && roles.includes(lit(n.value));
    },
  },
  /** One answer to "is this surface a sheet?" (menu unification stage 0, surface/mode.ts): a file that renders a surface (it imports the menu, panel or dialog shell, the panel head or
   *  usePanelShell, or it is in src/ui/surface/) never imports the five old rules that disagreed on a phone held sideways (STACK_MQ, THUMB_MQ / isThumb / useThumb, usesBottomBar, onPhone,
   *  frameIsSheet). It asks sheetMode(), surfaceModeNow() or useSurfaceMode(). A file that decides something else (the top bar's layout, the dock, the figure's room) and renders no surface
   *  may still read the bars' layout (shell/room.ts, shell/thumb.ts). */
  'one-sheet-rule': {
    applies: (p) => under(p, 'src/ui') && p !== 'src/ui/surface/mode.ts',
    visit: (n, _text, p) => {
      if (n.type !== 'Program') return [];
      const imps = n.body.filter((x) => x.type === 'ImportDeclaration');
      const shell = (x) => /(^|\/)surface\/(Panel|Menu|Dialog|PanelHead)(\.tsx)?$/.test(x.source.value)
        || (/(^|\/)surface\/wire(\.ts)?$/.test(x.source.value) && x.specifiers.some((q) => (q.imported?.name ?? q.imported?.value) === 'usePanelShell'));
      if (!under(p, 'src/ui/surface') && !imps.some(shell)) return [];
      const OLD = ['STACK_MQ', 'THUMB_MQ', 'isThumb', 'useThumb', 'usesBottomBar', 'onPhone', 'frameIsSheet'];
      return imps.flatMap((x) => x.specifiers.filter((q) => q.type === 'ImportSpecifier' && OLD.includes(q.imported?.name ?? q.imported?.value)));
    },
  },
  /** One motion set (menu unification, section 3.2): a surface's times come from ui/motion.ts (D_FLIP, D_SMALL, D_SURFACE, LEAVE_SLACK_MS) or surface/motion.ts (leaveMs, leaveCss and the
   *  surfaces' named own-pace times), never a millisecond count written where it is used. In src/ui/surface/ and the surface files (Treat, the Tests layer, History, Compare, Why, the
   *  action card, the main menu, Search, the pages, the timeline chart) no number of milliseconds is passed to clock.after, usePresence or an animate() duration, or given to a `*_MS`
   *  const. A token scaled by a factor (`D_SMALL * 0.6`) is a token; a token with ms added (`D_SMALL + 40`) is not. 0 (the next turn) is no duration. The 2D copies keep theirs. */
  'surface-motion-tokens': {
    applies: (p) => !/\.copied\.|\/copied\//.test(p) && p !== 'src/ui/surface/motion.ts'
      && (under(p, 'src/ui/surface', 'src/ui/treat', 'src/ui/history', 'src/ui/compare', 'src/ui/why') || SURFACE_FILES.has(p)),
    visit: (n) => {
      const ms = (e) => {
        e = unwrap(e);
        if (!e) return false;
        if (e.type === 'Literal') return typeof e.value === 'number' && e.value !== 0;
        if (e.type === 'BinaryExpression' && (e.operator === '+' || e.operator === '-')) return ms(e.left) || ms(e.right);
        return e.type === 'ConditionalExpression' ? ms(e.consequent) || ms(e.alternate) : false;
      };
      if (n.type === 'VariableDeclarator') return n.id.type === 'Identifier' && /_MS$/.test(n.id.name) && ms(n.init);
      if (n.type !== 'CallExpression') return false;
      const name = callName(n), at = n.arguments[1];
      if (dotted(unwrap(n.callee)) === 'clock.after' || name === 'usePresence') return ms(at);
      if (name !== 'animate') return false;
      const o = unwrap(at);
      return ms(o) || (o?.type === 'ObjectExpression' && o.properties.some((q) => q.type === 'Property' && !q.computed && q.key.name === 'duration' && ms(q.value)));
    },
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
        const h = r.visit(n, text, path);
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

/** Brackets in a stylesheet that do not close (or close without opening): a file cut off mid-rule (a merge or an edit that lost its tail) fails the production build with "Unclosed block" while every test, the typecheck and the lint still pass.
 *  Comments and quoted strings are skipped. Returns [{ line, message }] (empty for a well-formed file); the build's own parser is postcss, this needs no dependency so it runs before `npm install`. */
export function cssProblems(text) {
  const out = [], stack = [], pair = { '}': '{', ')': '(', ']': '[' };
  let line = 1, i = 0;
  while (i < text.length) {
    const c = text[i], two = text.slice(i, i + 2);
    if (two === '/*') { const e = text.indexOf('*/', i + 2); if (e < 0) { out.push({ line, message: 'a comment that is never closed' }); return out; } line += text.slice(i, e).split('\n').length - 1; i = e + 2; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < text.length && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1; if (text[j] !== c) out.push({ line, message: 'a string that is never closed' }); i = j + 1; continue; }
    if (c === '\n') line++;
    else if (c === '{' || c === '(' || c === '[') stack.push({ c, line });
    else if (pair[c]) { const top = stack.pop(); if (!top || top.c !== pair[c]) out.push({ line, message: `a stray '${c}'` }); }
    i++;
  }
  for (const s of stack) out.push({ line: s.line, message: `a '${s.c}' that is never closed` });
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
