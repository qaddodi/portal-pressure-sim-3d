// Plan 44 (Mohammad, 23 Nov: "the slide pill and the zoomed in card should kind each other so when we zoom hide the pill"): while a card is zoomed the slide pill fades with the veil and
// comes back as the card starts home. The pill holds glass (its frost is .dk-bar::before), so the whole never fades: its face and its parts do. Read from the CSS, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const deck = readFileSync('src/ui/deck-ui.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const glass = readFileSync('src/ui/glass.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const pres2d = readFileSync('src/ui/styles/app-05-presenter-cards.css', 'utf8');
const talk = readFileSync('src/ui/shell/talk.ts', 'utf8');
const UP = 'body\\[data-card-zoom\\]:not\\(\\[data-card-zoom="back"\\]\\)';
const rule = (src: string, sel: RegExp) => { const m = sel.exec(src); assert.ok(m, String(sel)); return m![1]!; };

test('hidden while the zoom is going in or up, back as soon as it goes home ("back"), the veil\'s own timing', () => {
  // face and parts: opacity 0 on the zoom, never the whole bar (under the frost the bar must stay opaque)
  const face = rule(deck, new RegExp(`html:not\\(\\[data-noglass\\]\\) ${UP} \\.deck-ui \\.dk-bar::before \\{([^}]*)\\}`));
  assert.match(face, /opacity: 0;/); assert.match(face, /transition-duration: var\(--d-zoom-in\)/);
  const parts = rule(deck, new RegExp(`${UP} \\.deck-ui \\.dk-bar \\.dk-settings > \\.ib \\{([^}]*)\\}`));
  assert.match(parts, /opacity: 0 !important/); assert.match(parts, /var\(--d-zoom-in\) var\(--ease-arrive\)/);
  assert.match(deck, new RegExp(`${UP} \\.deck-ui \\.dk-bar > :not\\(\\.dk-settings\\),\\s*html:not\\(\\[data-noglass\\]\\) ${UP} \\.deck-ui \\.dk-bar \\.dk-settings > \\.ib`));
  // the way back is the veil's (.pz-zveil: --d-zoom-out, --ease-arrive)
  assert.match(deck, /html:not\(\[data-noglass\]\) \.deck-ui \.dk-bar::before \{ transition: opacity var\(--d-zoom-out\) var\(--ease-arrive\); \}/);
  assert.match(deck, /\.dk-bar > :not\(\.dk-settings\), html:not\(\[data-noglass\]\) \.deck-ui \.dk-bar \.dk-settings > \.ib \{ transition: opacity var\(--d-zoom-out\) var\(--ease-arrive\)/);
  assert.match(deck, /\.pz-zveil \{[^}]*transition: opacity var\(--d-zoom-out\) var\(--ease-arrive\)/); assert.match(deck, /\.pz-zveil\.on \{[^}]*transition-duration: var\(--d-zoom-in\)/);
});

test('the Settings sheet inside the pill is never faded or blurred out: only its gear goes', () => {
  assert.doesNotMatch(deck, /\.dk-settings \{[^}]*opacity/);
  assert.doesNotMatch(deck, /\.dk-bar \.sh-sheet[^{]*\{[^}]*opacity/);
});

test('while hidden the pill takes no touch, so a tap where it stood reaches the card or the veil, which put the card home', () => {
  assert.match(deck, new RegExp(`${UP} \\.deck-ui \\.dk-bar \\{ pointer-events: none; \\}`));
  assert.match(deck, new RegExp(`${UP} \\.deck-ui \\.dk-bar :is\\(button, \\.ib\\), ${UP} \\.deck-ui \\.dk-bar :is\\(button, \\.ib\\)::after \\{ pointer-events: none !important; \\}`));
  const layer = readFileSync('src/ui/cards/CardLayer.tsx', 'utf8');
  assert.match(layer, /pz-zveil/); assert.match(layer, /cardZoom\.close/);
});

test('the whole bar fades only where it holds no glass: blur off, or a browser with no backdrop blur', () => {
  // outside those two cases no rule sets opacity on .dk-bar itself
  for (const m of deck.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    if (!/opacity:/.test(m[2]!)) continue;
    for (const s of m[1]!.split(',').map((x) => x.trim())) {
      const last = s.split(/[\s>+~]+/).pop()!;
      if (/^\.dk-bar(\[[^\]]*\])?$/.test(last)) assert.match(s, /html\[data-noglass\]/, `${s} fades the whole pill`);
    }
  }
  assert.match(deck, new RegExp(`html\\[data-noglass\\] ${UP} \\.deck-ui \\.dk-bar \\{ opacity: 0; transition-duration: var\\(--d-zoom-in\\); \\}`));
  // (a browser with no backdrop blur at all: glass.css, the one place blur is named)
  assert.match(glass, /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\) \{[^}]*\.deck-ui \.dk-bar \{ transition: opacity var\(--d-zoom-out\) var\(--ease-arrive\) !important; \}\s*body\[data-card-zoom\]:not\(\[data-card-zoom="back"\]\) \.deck-ui \.dk-bar \{ opacity: 0; transition-duration: var\(--d-zoom-in\); \}/);
  assert.doesNotMatch(deck, /backdrop-filter/, 'blur is named in glass.css only');
});

test('the pill\'s own border and shadow ride on its face, the same numbers as 2D\'s (app-05-presenter-cards.css), so it can fade without leaving an empty outline', () => {
  const twoD = rule(pres2d, /^\.pz-bar \{([^\n]*)\}/m);
  const tenPct = rule(twoD, /border: 1px solid (color-mix\(in srgb, var\(--text\) 10%, transparent\))/);
  const shadow = rule(twoD, /box-shadow: ([^;]*);/);
  const hi = rule(pres2d, /^\.app\.pz-hi \.pz-bar \{[^}]*border-color: (color-mix\([^;]*\));/m);
  const bar = rule(glass, /html:not\(\[data-noglass\]\) \.dk-bar \{([^}]*)\}/);
  assert.match(bar, /border-color: transparent !important/); assert.match(bar, /box-shadow: none !important/);
  const before = rule(glass, /html:not\(\[data-noglass\]\) \.dk-bar::before \{([^}]*)\}/);
  assert.match(before, /inset: -1px/, 'the pill\'s border box');
  assert.ok(before.includes(`border: 1px solid ${tenPct}`)); assert.ok(before.includes(`box-shadow: ${shadow}`));
  assert.ok(glass.includes(`html:not([data-noglass]) .app.pz-hi .dk-bar::before { border-color: ${hi}; }`));
  // the pill has a 1 px border in both layouts, so inset -1px is its border box: the face's outer edge and radius are the pill's own
  assert.match(pres2d, /\.pz\.stack \.pz-bar \{[^}]*border: 1px solid color-mix\(in srgb, var\(--text\) 10%, transparent\)/);
  assert.match(pres2d, /\.pz-bar\.pzb-pill \{[^}]*overflow: visible/); assert.match(pres2d, /\.pz\.stack \.pz-bar \{[^}]*overflow: visible/);
});

test('leaving a talk fades the pill\'s face and parts by an attribute, not the whole bar with an animation', () => {
  assert.doesNotMatch(talk, /querySelectorAll<HTMLElement>\('\.dk-bar[^']*'\)[^;]*\.animate/);
  assert.doesNotMatch(talk, /'\.dk-bar, \.pz-veil'/);
  assert.match(talk, /querySelectorAll<HTMLElement>\('\.dk-bar'\)\) b\.setAttribute\('data-leaving', ''\)/);
  assert.match(deck, /html:not\(\[data-noglass\]\) \.deck-ui \.dk-bar\[data-leaving\]::before \{ opacity: 0; transition: opacity var\(--d-small\) var\(--ease-in\); \}/);
  assert.match(deck, /\.dk-bar\[data-leaving\] > :not\(\.dk-settings\)/);
});
