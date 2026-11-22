// Owner's hard rule (22 Nov 2026, docs/HUMANIZED-DESIGN.md section 0): NEVER a pill with a dot, a status chip or a badge. A state is plain words in its colour.
// The 2D stylesheets (src/ui/css2d, copied unchanged) bring pills of their own; src/ui/humanized.css takes the paint off the ones the app uses. This test finds every
// style rule that paints a pill (a fully rounded fill or outline) on a class named pill, chip, badge or dot, that the app really makes, and fails unless the class is one of
// the retired ones (humanized.css strips it) or a listed exception. A new pill, chip, badge or dot, or a 2D re-copy that brings one, fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d: string, out: string[] = []): string[] => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; };
const files = walk('src');
const cssFiles = files.filter((f) => f.endsWith('.css'));
const srcText = files.filter((f) => /\.(tsx?|js)$/.test(f) && !f.includes('/css2d/') && !f.includes('/debug/') && !f.startsWith('src/decks/')).map((f) => readFileSync(f, 'utf8')).join('\n');

/** Classes whose pill paint humanized.css strips. */
const RETIRED = ['pz-val', 'pz-gpill', 'hp-chip', 'cmp-badge', 'tr-chip', 'ir-chip', 'pt-chip', 'fr-pill', 'fr-pillnote', 'sv-legend', 'pz-site', 'pz-dz', 'pz-lens-t'];
/** Exceptions, each with its reason. None carries a dot beside words. */
const ALLOWED: Record<string, string> = {
  'zoom-pill': 'a rounded bar of icon buttons (no words, no dot)', 'float-pill': 'a rounded bar of controls', 'sh-pill': 'a plain button',
  'pzb-pill': 'the presenter bar of buttons', 'chip-btn': 'a top-bar button', 'preview-badge': 'the build marker the owner reads (BuildPill)',
  'order-chip': 'a ruled row with a tick box (Treat)', 'oc-dot': 'the tick box of that row', 'look-chip': 'the Appearance swatch (a theme preview)',
  'pz-prail-dot': 'the owner-picked one-row step rail (mock A)', 'ms-dot': 'a numbered step circle', 'lead-dot': 'the callout leader\'s anchor on the figure',
  'cl-lead-dot': 'the callout leader\'s anchor on the figure', 'leader-dot': 'the leader\'s anchor on the figure', 'endo-chip': 'a data cell of the scope card',
  'sh-toast': 'excluded: the notes redesign waits on the owner\'s pick', 'toast': 'excluded: the notes redesign waits on the owner\'s pick',
};

const NAME = /(pill|chip|badge|dot)s?\b/;
type Hit = { cls: string; file: string; decl: string };
function pillRules(): Hit[] {
  const hits: Hit[] = [];
  for (const f of cssFiles) {
    if (f.endsWith('humanized.css')) continue;
    const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1]!.trim(), body = m[2]!;
      if (!/border-radius:\s*(999px|50%|var\(--r-pill\))/.test(body)) continue;
      if (!/(^|;|\s)(background(-color)?:\s*(?!none|transparent|inherit|initial|unset)|box-shadow:\s*inset|border:\s*[1-9]|border:\s*var)/.test(body)) continue;
      for (const c of sel.matchAll(/\.([A-Za-z][\w-]*)/g)) if (NAME.test(c[1]!) || /(^|-)(pill|chip|badge|dot)(s|-|$)/.test(c[1]!)) hits.push({ cls: c[1]!, file: f, decl: sel.slice(0, 80) });
    }
  }
  return hits;
}
/** Whether the app makes an element of this class: it stands as a whole word in a quoted string (a class list) in the app's own code. */
// (the bare words `dot` and `pill` are in every comment and chart key: only a compound class name like `fr-pill` can be told apart; the 2D file's bare `.pill` and `.drug .dot` are markup the app never makes)
const made = (cls: string) => cls.includes('-') && new RegExp(`['"\`](?:[\\w-]+ )*${cls}(?: [\\w-]+)*['"\`]`).test(srcText);

test('no pill, chip, badge or dot the app makes is painted as one, except the retired (stripped) and the listed', () => {
  const bad = pillRules().filter((h) => made(h.cls) && !RETIRED.includes(h.cls) && !(h.cls in ALLOWED));
  assert.deepEqual(bad.map((h) => `${h.cls} (${h.file}: ${h.decl})`), [], 'a pill-painted class: show the state as plain words in its colour (docs/HUMANIZED-DESIGN.md section 0), then strip it in humanized.css');
});

test('humanized.css strips the paint of every retired class', () => {
  const css = readFileSync('src/ui/humanized.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const c of RETIRED) {
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => new RegExp(`\\.${c}\\b`).test(m[1]!));
    assert.ok(rules.length, `${c} has no rule in humanized.css`);
    assert.ok(rules.some((m) => /background:\s*none/.test(m[2]!) || /border-radius:\s*0/.test(m[2]!)), `${c} is not stripped of its fill or rounding`);
  }
});

test('the retired pills do not come back in the app\'s own stylesheets', () => {
  for (const f of cssFiles.filter((x) => !x.includes('/css2d/') && !x.endsWith('humanized.css'))) {
    const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(css, /\.hist-dot\b/, `${f}: the history dot is gone (the event's words carry its colour)`);
  }
});

test('the History row has no dot and the Legend key has no round swatch', () => {
  assert.doesNotMatch(readFileSync('src/ui/history/HistoryList.tsx', 'utf8'), /hist-dot/);
  assert.doesNotMatch(readFileSync('src/scene/lenses/legend.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''), /\.lg-dots i\s*\{[^}]*border-radius:\s*50%/);
});
