// The 2D app's card rules name a card's contents as its direct children (`.pz-data > .pz-dh`, `.pz-data.has-tool > .pz-tool`). Here the contents sit one box deeper: the card is
// `.pz-data > .dk-in > (.pz-dh, .pz-tool, ...)` (src/ui/cards/CardFrame.tsx), so none of those rules matched and the card went without them: 296 slides hid their header readings (d1a30038, found by hand), and
// 31 more rules (tool boxes' width, zoom and container, the header's size and zoom, the criteria card's header) never applied either (27 Nov, the 2D-plate audit). Like scripts/fade-hidden.mjs, the meaning of the 2D
// sheets is restored where the CSS is built: every rule that names the card's direct child gets its twin, right after it, through the `.dk-in` box. `:where()` keeps the twin at the 2D rule's own specificity,
// so ties against other rules fall out as they did in 2D. A rule written for 3D that already goes through `.dk-in` has no twin made.
const ROOTS = ['pz-data', 'pz-panel', 'pz-case'];
/** Children a card keeps as its own direct children (CardFrame.tsx): the twin would match nothing. */
const STAYS = ['dk-in', 'pz-grip', 'pz-cred'];

/** The top-level pieces of a selector: compounds and the combinators between them (` `, `>`, `+`, `~`), parentheses and brackets kept whole. */
function pieces(sel) {
  const out = []; let depth = 0, cur = '';
  const flush = () => { if (cur) out.push({ t: 'c', s: cur }); cur = ''; };
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i];
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (depth === 0 && (ch === '>' || ch === '+' || ch === '~' || /\s/.test(ch))) {
      flush();
      if (/\s/.test(ch)) { if (out.length && out[out.length - 1].t !== 'k') out.push({ t: 'k', s: ' ' }); }
      else { if (out.length && out[out.length - 1].t === 'k' && out[out.length - 1].s === ' ') out.pop(); out.push({ t: 'k', s: ch }); }
    } else cur += ch;
  }
  flush();
  return out.filter((p, i, a) => !(p.t === 'k' && p.s === ' ' && (i === a.length - 1 || a[i + 1].t === 'k')));
}
/** Whether a compound is one of the card roots (its class, not inside a :not() or :has()). */
const isRoot = (c) => { const bare = c.replace(/:(not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g, ''); return ROOTS.some((r) => new RegExp(`\\.${r}(?![\\w-])`).test(bare)); };
const startsWithClass = (c, names) => names.some((n) => new RegExp(`^(\\.${n}(?![\\w-])|[^.]*\\.${n}(?![\\w-]))`).test(c));

/** The selector with the card's direct-child step sent through `.dk-in`, or null when it names none (or already goes through `.dk-in`). */
export function dkInTwin(sel) {
  const p = pieces(sel.trim());
  if (p.some((x) => x.t === 'c' && /\.dk-in(?![\w-])/.test(x.s))) return null;
  for (let i = 0; i + 2 < p.length; i++) {
    if (p[i].t === 'c' && isRoot(p[i].s) && p[i + 1].t === 'k' && p[i + 1].s === '>' && p[i + 2].t === 'c') {
      if (startsWithClass(p[i + 2].s, STAYS) || /^[*]/.test(p[i + 2].s)) return null;
      // (rebuilt from its pieces: a descendant is a space, any other combinator has one on each side)
      return p.map((x, j) => (j === i + 1 ? ' > :where(.dk-in) > ' : x.t === 'k' ? (x.s === ' ' ? ' ' : ` ${x.s} `) : x.s)).join('').replace(/ {2,}/g, ' ').trim();
    }
  }
  return null;
}

/** A PostCSS plugin (a plain object plugin, as fade-hidden.mjs): after a rule with direct-child selectors, a rule with their twins and the same declarations. */
export function dkInTwins() {
  return {
    postcssPlugin: 'dk-in-twins',
    Rule(rule) {
      if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
      // (a `zoom` rule is not carried over: in 2D `zoom: 1` or `zoom: var(--pz-z)` on a card's child REPLACES the card's fit zoom, but here the fit zoom sits on `.dk-in` and nests with the child's, so the same
      //  rule would multiply: the card's zoom is its own work, css3d-over-2d.css `.pz-data > .dk-in { zoom: var(--pz-fit) }`)
      if (rule.some((d) => d.type === 'decl' && d.prop === 'zoom')) return;
      const twins = rule.selectors.map(dkInTwin).filter((s) => !!s);
      if (!twins.length) return;
      const mine = [...new Set(twins)], after = rule.next();
      // (made once: a sheet run again finds its twin standing after the rule)
      if (after?.type === 'rule' && mine.every((t) => after.selectors.includes(t))) return;
      const next = rule.clone({ selectors: mine });
      next.raws.before = '\n';
      rule.after(next);
    },
  };
}
dkInTwins.postcss = true;
