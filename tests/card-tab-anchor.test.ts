// Plan 46: the deck-name tab (`.pz-tabname`, position:absolute; top:0; right:0) stays in the card's corner. Static, no DOM, node only.
// A transform (or translate, filter, perspective, will-change) on the element the tab is placed in re-anchors it to that element's own top, which is where the title starts: the eyebrow over the title (slide 12, 23 Nov).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseAst } from 'rolldown/parseAst';

const rd = (p: string) => readFileSync(p, 'utf8');

test('CardFrame never writes a transform or translate on the card\'s inner, and cancels animations in one place only', () => {
  const src = rd('src/ui/cards/CardFrame.tsx');
  assert.doesNotMatch(src, /innerRef\.current[?!]?\.style\.(transform|translate)/, 'the inner takes no transform: the words are shifted child by child (card-glide.ts shiftWords)');
  assert.doesNotMatch(src, /innerRef\.current[?!]?\.style\.setProperty\(\s*['"](transform|translate)/);
  assert.equal((src.match(/\.cancel\(\)/g) ?? []).length, 1, 'one cancel, inside the host\'s cancelAnims; every other path goes through settle()');
  assert.match(src, /cancelAnims: \(\) => \{ anims\.current\.forEach\(\(x\) => x\.cancel\(\)\); anims\.current = \[\]; \}/);
  assert.doesNotMatch(src, /anims\.current\.forEach\([^)]*=>\s*[a-z]\.cancel\(\)\)\s*;\s*(?!anims)/m, 'no bare cancel loop');
  // the glide helpers are the only way in
  for (const f of ['beginSink', 'beginReveal', 'finishSink', 'finishReveal', 'settle', 'committed']) assert.match(src, new RegExp(`\\b${f}\\(`), `${f} is used`);
});

// ---- css ------------------------------------------------------------------------------------------------------------------------
const cssFiles = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : []; });
interface Rule { sel: string; body: string; file: string }
function rules(css: string, file: string): Rule[] {
  const s = css.replace(/\/\*[\s\S]*?\*\//g, ''), out: Rule[] = [];
  const walk = (t: string) => {
    let i = 0;
    while (i < t.length) {
      const o = t.indexOf('{', i);
      if (o < 0) break;
      let d = 1, j = o + 1;
      while (j < t.length && d) { if (t[j] === '{') d++; else if (t[j] === '}') d--; j++; }
      const head = t.slice(i, o).trim(), body = t.slice(o + 1, j - 1);
      if (head.startsWith('@keyframes') || head.startsWith('@font-face')) { /* (an animation's own steps: not a rule on an element) */ }
      else if (head.startsWith('@')) walk(body);
      else out.push({ sel: head.replace(/^[^{}]*;/, '').trim(), body, file });
      i = j;
    }
  };
  walk(s);
  return out;
}
/** the comma-separated selectors of a rule, top level only (`:is(a, b)` stays whole) */
const selectors = (sel: string): string[] => { const r: string[] = []; let d = 0, cur = ''; for (const c of sel) { if (c === '(' || c === '[') d++; if (c === ')' || c === ']') d--; if (c === ',' && !d) { r.push(cur.trim()); cur = ''; } else cur += c; } r.push(cur.trim()); return r.filter(Boolean); };
/** the last compound of a selector: the element the rule is about */
const subject = (s: string): string => { let d = 0, cut = 0; for (let i = 0; i < s.length; i++) { const c = s[i]!; if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d--; else if (!d && /[\s>+~]/.test(c)) cut = i + 1; } return s.slice(cut); };
const hasClass = (subj: string, cls: string) => new RegExp(`\\.${cls}(?![\\w-])`).test(subj.replace(/:(is|where|not|has)\([^)]*\)/g, ''));
const FORBIDDEN = ['transform', 'translate', 'rotate', 'scale', 'filter', 'perspective', 'will-change', 'backdrop-filter'];
const declares = (body: string, prop: string) => new RegExp(`(^|[;\\s])${prop}\\s*:`).test(body);
const all = cssFiles('src').flatMap((f) => rules(rd(f), f));

test('no rule puts a containing-block property on the card\'s inner (.dk-in) or a panel\'s header (.pz-ph)', () => {
  assert.ok(all.length > 500, `the stylesheets were read (${all.length} rules)`);
  const bad: string[] = [];
  for (const r of all) for (const s of selectors(r.sel)) {
    const sub = subject(s);
    for (const cls of ['dk-in', 'pz-ph']) if (hasClass(sub, cls)) for (const p of FORBIDDEN) if (declares(r.body, p)) bad.push(`${r.file}: ${s} { ${p} }`);
  }
  assert.deepEqual(bad, []);
});

test('.pz-text (the words card\'s inner) is already its own containing block by `contain: layout`, so the tab stands at its corner; only the listed rules may move it, and a new one fails here', () => {
  const found: string[] = [];
  for (const r of all) for (const s of selectors(r.sel)) {
    const sub = subject(s);
    if (!hasClass(sub, 'pz-text')) continue;
    for (const p of FORBIDDEN) if (declares(r.body, p) && !(p === 'transform' && /transition/.test(r.body) && !/transform\s*:/.test(r.body))) found.push(`${s} { ${p} }`);
  }
  // the 2D leave (`.pz-leave`: the 3D rail never adds it to a card), the contrast mode's filter and the wide screen's `--pz-rise` lift (both move the words card's own box, and the card's shell with it: the tab goes with them)
  const allowed = /\.pz-leave|\.pz-hi \.pz-text|\[data-out|\.pz-wide \.pz-text \{ translate/;
  assert.deepEqual(found.filter((f) => !allowed.test(f)), []);
  assert.match(all.find((r) => selectors(r.sel).includes('.pz-text') && /contain:/.test(r.body))?.body ?? '', /contain:\s*layout/, 'the words card\'s inner keeps `contain: layout` (the tab\'s anchor)');
  assert.ok(rd('src/ui/cards/CardFrame.tsx').includes("alone ? 'dk-in' : 'dk-in pz-text'"), 'a panel or case inner is a plain .dk-in: the card itself is the tab\'s anchor');
});

// ---- the cards -------------------------------------------------------------------------------------------------------------------
type Node = { type: string; [k: string]: any };   // (oxc's ESTree with JSX)
test('every card that has a name tab renders it (and the site tab) as a direct child of the card\'s content root, which is the inner itself', () => {
  for (const f of ['src/ui/cards/TeachingCard.tsx', 'src/ui/cards/CheckCard.tsx']) {
    const ast = parseAst(rd(f), { lang: 'tsx' }) as unknown as Node;
    let n = 0;
    const walk = (node: any, up: Node[]) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach((x) => walk(x, up)); return; }
      if (typeof node.type !== 'string') return;
      if (node.type === 'JSXElement') {
        const name = node.openingElement.name.name as string, cls = JSON.stringify(node.openingElement.attributes);
        if (name === 'NameTab' || /pz-sitetab/.test(cls)) {
          n++;
          let i = up.length - 1;
          while (i >= 0 && ['LogicalExpression', 'ConditionalExpression', 'ParenthesizedExpression', 'JSXExpressionContainer'].includes(up[i]!.type)) i--;
          assert.equal(up[i]?.type, 'JSXFragment', `${f}: ${name === 'NameTab' ? 'the name tab' : 'the site tab'} is a child of the root fragment, not of a wrapper element (${up[i]?.type} ${up[i]?.openingElement?.name?.name ?? ''})`);
          let j = i - 1;
          while (j >= 0 && up[j]!.type === 'ParenthesizedExpression') j--;
          assert.equal(up[j]?.type, 'ReturnStatement', `${f}: the fragment is the component's returned root`);
        }
      }
      for (const k of Object.keys(node)) if (k !== 'type' && k !== 'start' && k !== 'end') walk(node[k], [...up, node]);
    };
    walk(ast, []);
    assert.ok(n >= 1, `${f}: the tabs were found (${n})`);
  }
  const frame = rd('src/ui/cards/CardFrame.tsx');
  assert.match(frame, /<div ref=\{innerRef\} className=\{[^}]*\}[^>]*>\{children\}<\/div>/, 'the card\'s children are the inner\'s direct children, with no wrapper that could take a transform');
});
