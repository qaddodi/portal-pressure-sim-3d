import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync('src/ui/glass.css', 'utf8');
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** every surface that sits over the figure and must wear the glass (Mohammad, 19 Nov 2026: unified, menus, UI and cards) */
const SURFACES = [
  '.topbar .tb-face', '.topbar .float-pill', '.zoom-pill', '.vdock > .vd-face', '.nb-views > .vp-face',
  '.sh-sheet', '.sh-dialog', '.dk-jump', '.toast', '.sh-toast', '.modal', '.pal', '.why-pop',
  '.tr-card', '.ac-card', '.t-card', '.cmp-banner', '.dk-card', '.dk-strip', '.pz-shade', '.pz-data', '.pz-case', '.pz-scales', '.pz-fk', '.lb-key',
  '.case-bar', '.cs-card', '.cs-pass', '.cs-own', '.sh-waitcue', '.pz-jump',
];
test('the one glass lists every panel, menu, pill and card', () => {
  for (const s of SURFACES) assert.ok(bare.includes(s), `${s} is not in glass.css`);
});
test('the glass is 2D\'s: 22 px blur, 1.15 saturation, the 66 % surface tint, with the Safari prefix, and off with Blur effect off', () => {
  assert.match(bare, /--glass-blur: 22px/); assert.match(bare, /--glass-sat: 1\.15/);
  assert.match(bare, /-webkit-backdrop-filter: blur\(var\(--glass-blur\)\) saturate\(var\(--glass-sat\)\)/);
  assert.match(bare, /background: var\(--glass-tint\)/);
  assert.match(readFileSync('src/ui/styles/app-03-layouts.css', 'utf8'), /--glass-tint: color-mix\(in srgb, var\(--surface\) var\(--pz-frost, 66%\)/);
  assert.ok(bare.includes('html:not([data-noglass])'), 'the glass is gated on Blur effect');
});
test('reduced transparency is an override of the glass, never a gate on it (Safari does not know the query)', () => {
  assert.ok(!/@media\s+\(?not\s+\(prefers-reduced-transparency/.test(bare) && !/prefers-reduced-transparency:\s*no-preference/.test(bare));
  assert.match(bare, /@media \(prefers-reduced-transparency: reduce\)/);
});
test('glass is not nested: a glass holding a popover or another glass carries its frost on a face', () => {
  // the presenter pill holds the Settings sheet; the dock holds the view pill's face
  assert.match(bare, /\.dk-bar::before/); assert.match(bare, /\.dk-bar \{ isolation: isolate; background: transparent !important[^}]*border-color: transparent !important; box-shadow: none !important; \}/, 'the pill\'s own border and shadow ride on its face (Plan 44)');
  const list = /html:not\(\[data-noglass\]\) :where\(([\s\S]*?)\n  \) \{/.exec(bare)![1];
  assert.ok(!list.includes('.dk-bar') && !list.includes('.vdock,') && !/\.vdock\s*$/.test(list), 'the dock and the presenter pill are not in the self-glass list');
  const dock = readFileSync('src/ui/shell/Dock.tsx', 'utf8');
  assert.ok(dock.includes('className="vd-face"'), 'the dock has its face');
});
test('no other stylesheet declares a backdrop blur: the lifted 2D sheets declare none, and the 3D sheets leave it to glass.css', () => {
  const found: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.css') && !p.endsWith('glass.css')) {
    const t = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of t.matchAll(/[^{}]*\{[^{}]*(?<![-\w])(?:-webkit-)?backdrop-filter\s*:(?!\s*none)[^;]+;/g)) found.push(`${p}: ${m[0].trim().slice(0, 80)}`);
  } } };
  walk('src');
  assert.deepEqual(found, []);
});
test('main imports the glass after the lifted 2D sheets', () => {
  const m = readFileSync('src/main.tsx', 'utf8');
  assert.ok(m.indexOf("./ui/styles/index.css") > -1 && m.indexOf("./ui/styles/index.css") < m.indexOf("./ui/glass.css"));
});

test('the phone dock is one glass: 2D\'s opaque layers (::before, tab row face and top) come off unless blur is off', () => {
  for (const r of [
    /html:not\(\[data-noglass\]\) \.app\.thumb \.vdock:not\(\.mini\)::before \{ background: none; box-shadow: none; \}/,
    /html:not\(\[data-noglass\]\) \.app\.thumb \.vdock:not\(\.mini\) \.thumb-bar \{ background: none; box-shadow: none; \}/,
    /html:not\(\[data-noglass\]\) \.app\.thumb \.vdock:not\(\.mini\) \.thumb-bar::before \{ background: none; box-shadow: inset 0 1px 0 var\(--hairline\); \}/,
  ]) assert.match(bare, r);
});

// "When the search menu appears, it appears without blur then the blur comes in" (owner, 20 Nov). Root cause: a backdrop-filter sees only what is painted inside the nearest ancestor with opacity < 1
// (a backdrop root), and 2D fades the wrappers .pal-back and .modal-back (crossfade) with the glass panel inside, so the panel was unblurred for the whole fade. The panel fades itself.
test('no glass sits inside a fading wrapper: no shell draws a 2D wrapper that crossfades, the panels fade with their own blur', () => {
  const l = readFileSync('src/ui/styles/app-03-layouts.css', 'utf8'), c = readFileSync('src/ui/styles/app-02-controls.css', 'utf8');
  assert.match(l, /\.pal \{[^}]*animation: scale-settle /); assert.match(c, /\.modal \{[^}]*animation: scale-settle /);
  // the same cause anywhere: every wrapper of a glass panel that 2D crossfades (.pal-back, .modal-back) is drawn by no source; the dialog shell's layer stands in their place and
  // eases only its colour (tests/dialog-shell.test.ts). A source that draws one again must neutralise its fade in glass.css first (a new one fails here).
  const wrappers = [...(l + c).matchAll(/^\.([\w-]+-back)(?:\.\w+)? *\{[^}]*animation: crossfade/gm)].map((m) => m[1]!);
  assert.ok(wrappers.length >= 2, 'the walk found the 2D wrappers');
  const src = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? src(p) : /\.tsx?$/.test(f) ? [p] : []; });
  const drawn = src('src').map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const w of new Set(wrappers)) {
    const draws = new RegExp(`className=[^>]*\\b${w}\\b|classList\\.add\\([^)]*\\b${w}\\b`).test(drawn);
    assert.ok(!draws || bare.includes(`.${w}`), `${w} is drawn and fades a glass panel`);
  }
});

// plan 21, the root of the dark step discs: `:is()` weighs its most specific argument (`.topbar #viewSeg` holds an id), so every glass in the list weighed (1,2,1) and no class-only override could win,
// not even with !important. `:where()` weighs nothing: the glass rule is (0,1,1) and a deliberate !important override beats it.
test('the glass lists weigh nothing (:where), so an !important override of a glass wins', () => {
  assert.ok(!/html:not\(\[data-noglass\]\) :is\(\s*\n/.test(bare), 'a glass list written with :is() takes the weight of its id argument');
  assert.equal((bare.match(/html:not\(\[data-noglass\]\) :where\(\s*\n/g) ?? []).length, 2, 'both lists (the glass and its reduced-transparency twin) are :where');
});
/** (ids, classes+attrs+pseudo-classes, types) of a selector without :is/:where/:not bodies counted past their own weight */
function weigh(sel: string): [number, number, number] {
  const s = sel.replace(/:where\([^)]*\)/g, '').replace(/::?[a-z-]+\(([^()]*)\)/g, (m, inner) => (/^:not|^:is|^:has/.test(m) ? ' ' + inner + ' ' : m));
  return [(s.match(/#[\w-]+/g) ?? []).length, (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[a-z-]+/g) ?? []).length, (s.match(/(^|[\s>+~])[a-z][\w-]*/g) ?? []).length];
}
const higher = (a: [number, number, number], b: [number, number, number]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
test('the glass weigher sees an id', () => {
  const glass: [number, number, number] = [0, 1, 1];   // html:not([data-noglass]) :where(...)
  assert.ok(higher(weigh('.topbar #viewSeg'), glass) > 0, 'the weigher sees an id');
});

// The root of "the blur is messed up" (owner, 26 Nov, playing a case on the iPhone): a new panel over the figure painted its own solid fill and never joined the list, and nothing said so.
// Now every panel a stylesheet floats over the figure (placed absolutely, with a surface or glass fill and the sheet's or a card's corners) is in the glass list, or named here with why not.
const NOT_GLASS: readonly [RegExp, string][] = [
  [/^\.vdock$/, 'the dock: its face (.vdock > .vd-face) is its glass, so the view pill above it is not nested in a glass'],
  [/^\.treat-card$/, 'Treat: its sheet plate (.tr-card > .sheet-plate) is the glass, so its height can glide'],
  [/^\.action-card$/, 'the action card: its plate (.ac-card > .ac-plate) is the glass'],
  [/^\.um-pv$/, 'the menu row preview: glass when it is on (.um-pv.on)'],
  [/^\.tool-card$/, "2D's tool card: no 3D component renders it"],
];
test('every panel floated over the figure wears the one glass, or says why not', () => {
  const list = [...bare.matchAll(/:where\(([\s\S]*?)\n  \) \{/g)][0]![1]!.replace(/\/\*[\s\S]*?\*\//g, '');
  const inList = new Set(list.split(',').map((x) => x.trim().replace(/\s+/g, ' ')));
  const files = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : p.endsWith('.css') && !p.endsWith('glass.css') ? [p] : []; });
  const strays: string[] = [];
  for (const f of files('src/ui')) {
    const t = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of t.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const b = m[2]!;
      if (!/position:\s*(absolute|fixed)/.test(b) || !/background(-color)?:\s*var\(--(surface|glass|glass-tint)\)/.test(b) || !/border-radius:\s*var\(--r-(sheet|card)\)/.test(b)) continue;
      for (const sel of m[1]!.split(',').map((x) => x.trim().replace(/\s+/g, ' '))) {
        const glassed = [...inList].some((g) => g === sel || g.startsWith(`${sel}:`) || g.startsWith(`${sel} >`) || g.startsWith(`${sel}.`));
        if (!glassed && !NOT_GLASS.some(([re]) => re.test(sel))) strays.push(`${f}: ${sel}`);
      }
    }
  }
  assert.deepEqual(strays, [], 'a panel over the figure with a solid fill: put it in the glass list (glass.css), or say here why it is not glass');
});
test('playing a case: on a phone the tab row keeps the glass while the dock\'s face steps aside for the case bar', () => {
  const caseCss = readFileSync('src/ui/case/case.css', 'utf8');
  assert.match(caseCss, /\.app\.thumb\.case-on \.vdock:not\(\.mini\) > :is\(\.vd-face/, 'the face steps aside');
  assert.ok(bare.includes('.app.thumb.case-on .vdock:not(.mini) > .thumb-bar'), 'the tab row wears the glass');
  assert.doesNotMatch(caseCss.replace(/\/\*[\s\S]*?\*\//g, ''), /\.cs-passing\[data-on="true"\] \{[^}]*opacity/, 'the notes\' wrapper never fades (the notes fade themselves)');
});

