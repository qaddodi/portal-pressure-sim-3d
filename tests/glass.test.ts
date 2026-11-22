import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync('src/ui/glass.css', 'utf8');
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** every surface that sits over the figure and must wear the glass (Mohammad, 19 Nov 2026: unified, menus, UI and cards) */
const SURFACES = [
  '.topbar .tb-face', '.topbar .float-pill', '.zoom-pill', '.vdock > .vd-face', '.nb-views > .vp-face',
  '.sh-sheet', '.sh-pop', '.sh-dialog', '.dk-jump', '.toast', '.modal', '.pal', '.why-pop',
  '.tr-card', '.ac-card', '.t-card', '.cmp-banner', '.dk-card', '.dk-strip', '.pz-shade', '.pz-data', '.pz-case', '.pz-scales', '.pz-fk', '.cl-glass', '.lb-key',
];
test('the one glass lists every panel, menu, pill and card', () => {
  for (const s of SURFACES) assert.ok(bare.includes(s), `${s} is not in glass.css`);
});
test('the glass is 2D\'s: 22 px blur, 1.15 saturation, the 66 % surface tint, with the Safari prefix, and off with Blur effect off', () => {
  assert.match(bare, /--glass-blur: 22px/); assert.match(bare, /--glass-sat: 1\.15/);
  assert.match(bare, /-webkit-backdrop-filter: blur\(var\(--glass-blur\)\) saturate\(var\(--glass-sat\)\)/);
  assert.match(bare, /background: var\(--glass-tint\)/);
  assert.match(readFileSync('src/ui/css2d/app-03-layouts.css', 'utf8'), /--glass-tint: color-mix\(in srgb, var\(--surface\) var\(--pz-frost, 66%\)/);
  assert.ok(bare.includes('html:not([data-noglass])'), 'the glass is gated on Blur effect');
});
test('reduced transparency is an override of the glass, never a gate on it (Safari does not know the query)', () => {
  assert.ok(!/@media\s+\(?not\s+\(prefers-reduced-transparency/.test(bare) && !/prefers-reduced-transparency:\s*no-preference/.test(bare));
  assert.match(bare, /@media \(prefers-reduced-transparency: reduce\)/);
});
test('glass is not nested: a glass holding a popover or another glass carries its frost on a face', () => {
  // the presenter pill holds the Settings sheet; the dock holds the view pill's face
  assert.match(bare, /\.dk-bar::before/); assert.match(bare, /\.dk-bar \{ isolation: isolate; background: transparent !important/);
  const list = /html:not\(\[data-noglass\]\) :is\(([\s\S]*?)\n  \) \{/.exec(bare)![1];
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
  assert.ok(m.indexOf("./ui/css2d/index.css") > -1 && m.indexOf("./ui/css2d/index.css") < m.indexOf("./ui/glass.css"));
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
test('no glass sits inside a fading wrapper: the palette and dialog wrappers do not animate, the panels fade with their own blur', () => {
  assert.match(bare, /html:not\(\[data-noglass\]\) :is\(\.pal-back, \.pal-back\.leaving, \.modal-back\.show, \.modal-back\.leaving\) \{ animation: none !important; \}/);
  const l = readFileSync('src/ui/css2d/app-03-layouts.css', 'utf8'), c = readFileSync('src/ui/css2d/app-02-controls.css', 'utf8');
  assert.match(l, /\.pal \{[^}]*animation: scale-settle /); assert.match(l, /\.pal-back\.leaving \.pal \{ animation: scale-settle-out /);
  assert.match(c, /\.modal \{[^}]*animation: scale-settle /); assert.match(c, /\.modal-back\.leaving \.modal \{ animation: scale-settle-out /);
  // the same cause anywhere: every wrapper of a glass panel that 2D crossfades must be on that list (a new one fails here)
  const wrappers = [...(l + c).matchAll(/^(\.[\w-]+-back)(?:\.\w+)? *\{[^}]*animation: crossfade/gm)].map((m) => m[1]!);
  for (const w of new Set(wrappers)) assert.ok(bare.includes(w), `${w} fades a glass panel and is not neutralised in glass.css`);
});
