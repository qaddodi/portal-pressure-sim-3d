// G3 (Plan 39): colours follow the look. (a) No 3D sheet writes a raw white or black as text on a themed fill (the Dark looks' blue fill #7C9BFF took white text at 2.63:1;
// --on-accent and --on-danger exist for this). (b) In every look the ink on an accent or danger fill, the three text tones and the status colours reach 4.5:1 on the
// card and the ground, and Light's amber still reads as amber beside its red. (c) Every look token a 3D rule reads with no fallback is defined for all five looks.
// The values are resolved from the 2D tokens.css (src/ui/css2d, never edited) plus 3D's css3d-over-2d.css, by the cascade, not from a copy. Source-reading, node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOOKS, LOOK_IDS, lookVars, type LookId } from '../src/looks/looks.ts';
import { contrast } from '../src/ui/debug/contrast.ts';
import { parseCss, stylesheets, spec, cmpSpec, type Rule } from './css-parse.ts';

const tokensRules = parseCss('ui/css2d/tokens.css', readFileSync(new URL('../src/ui/css2d/tokens.css', import.meta.url), 'utf8'));
const threeRules = parseCss('ui/css3d-over-2d.css', readFileSync(new URL('../src/ui/css3d-over-2d.css', import.meta.url), 'utf8'), 100000);
const SELECTORS: Record<LookId, string[]> = {
  light: [':root'], soft: [':root', ':root[data-theme="soft"]'], dark: [':root', ':root[data-theme="dark"]'],
  navy: [':root', ':root[data-theme="dark"]', ':root[data-theme="dark"][data-palette="navy"]'], black: [':root', ':root[data-theme="dark"]', ':root[data-theme="dark"][data-palette="black"]'],
};
/** A look's custom properties after the cascade (only the top-level blocks that name the look; the system-dark media block is the same values for the system look). */
function resolve(id: LookId): Map<string, string> {
  const hits: { sp: number[]; order: number; decls: Rule['decls'] }[] = [];
  for (const r of [...tokensRules, ...threeRules]) if (!r.ctx && SELECTORS[id].includes(r.sel)) hits.push({ sp: spec(r.sel), order: r.order, decls: r.decls });
  hits.sort((a, b) => cmpSpec(a.sp, b.sp) || a.order - b.order);
  const m = new Map<string, string>();
  for (const h of hits) for (const d of h.decls) if (d.prop.startsWith('--')) m.set(d.prop, d.value);
  return m;
}
const hexOf = (v: string | undefined, id: LookId, name: string): string => { assert.match(v ?? '', /^#[0-9a-f]{6}$/i, `${id} ${name} is a plain hex in tokens.css`); return v!; };
const hue = (hex: string): number => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };

test('looks.ts and the stylesheets agree on the tokens the contrast table reads', () => {
  for (const id of LOOK_IDS) {
    const t = resolve(id), l = LOOKS[id];
    for (const [css, mine] of [['--accent', l.accent], ['--caution', l.caution], ['--danger', l.danger], ['--ok', l.ok], ['--on-accent', l.onAccent], ['--surface', l.card], ['--bg', l.bg], ['--text', l.text], ['--text-2', l.text2], ['--text-3', l.text3]] as const) {
      assert.equal(hexOf(t.get(css), id, css).toUpperCase(), mine.toUpperCase(), `${id} ${css}: tokens.css says ${t.get(css)}, looks.ts says ${mine}`);
    }
    assert.equal(lookVars(id)['--on-danger'], l.onDanger, `${id} --on-danger is published`);
  }
});

test('every look: ink on the accent and danger fills, text on the card and ground, status colours on the card: 4.5:1', () => {
  const bad: string[] = [];
  for (const id of LOOK_IDS) {
    const l = LOOKS[id];
    const pairs: [string, string, string, string][] = [
      ['--on-accent', l.onAccent, '--accent', l.accent], ['--on-danger', l.onDanger, '--danger', l.danger],
      ...(['text', 'text2', 'text3'] as const).flatMap((n) => [[`--${n}`, l[n], '--surface', l.card], [`--${n}`, l[n], '--bg', l.bg]] as [string, string, string, string][]),
      ['--ok', l.ok, '--surface', l.card], ['--caution', l.caution, '--surface', l.card], ['--danger', l.danger, '--surface', l.card], ['--accent', l.accent, '--surface', l.card],
    ];
    for (const [fn, f, bn, b] of pairs) { const r = contrast(f, b); if (r < 4.5) bad.push(`${id}: ${fn} ${f} on ${bn} ${b} is ${r}:1`); }
  }
  assert.deepEqual(bad, []);
});

test('Light\'s deepened amber still reads as amber beside its red (hue, not lightness: both are mid-dark)', () => {
  const caution = hue(LOOKS.light.caution), danger = hue(LOOKS.light.danger);
  assert.ok(caution > 30 && caution < 50, `amber hue ${Math.round(caution)}`);
  assert.ok(caution - danger >= 25, `amber ${Math.round(caution)} vs red ${Math.round(danger)}`);
  assert.equal(LOOKS.light.caution.toUpperCase(), '#8F6208');
});

// raw white or black as the text of a themed fill, in any 3D sheet (the copied 2D sheets are the 2D app's own)
const RAW_TEXT = /^(#fff(fff)?|#000(000)?|white|black)$/i;
const FILLS = /^var\(--(accent|danger|ok|caution|text|surface|bg|glass)\b/;
// [file, selector part, reason]: a fill that is not a themed one, or ink that is meant to be fixed in every look
const RAW_OK: [string, string, string][] = [];
test('no 3D sheet writes a raw white or black as text on a themed fill', () => {
  const bad: string[] = [];
  for (const [path, css] of stylesheets()) {
    if (path.startsWith('ui/css2d/') || path.includes('.copied.')) continue;
    for (const r of parseCss(path, css)) {
      const color = r.decls.find((d) => d.prop === 'color' && RAW_TEXT.test(d.value));
      const fill = r.decls.find((d) => /^background(-color)?$/.test(d.prop) && FILLS.test(d.value));
      if (color && fill && !RAW_OK.some(([f, s]) => f === path && r.sel.includes(s))) bad.push(`${path}: ${r.sel.slice(0, 90)} { color: ${color.value}; background: ${fill.value} }`);
    }
  }
  assert.deepEqual(bad, [], 'use --on-accent / --on-danger / --text-inverse, or list the rule in RAW_OK with its reason');
});

test('every look token a 3D rule reads without a fallback is defined in all five looks', () => {
  const defined = new Map<LookId, Map<string, string>>(LOOK_IDS.map((id) => [id, resolve(id)]));
  const anywhere = new Set<string>(); for (const r of tokensRules) for (const d of r.decls) if (d.prop.startsWith('--')) anywhere.add(d.prop);
  for (const id of LOOK_IDS) for (const k of Object.keys(lookVars(id))) defined.get(id)!.set(k, 'looks.ts');
  const bad = new Set<string>();
  for (const [path, css] of stylesheets()) {
    if (path.startsWith('ui/css2d/') || path.includes('.copied.')) continue;
    for (const m of css.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
      const name = m[1]!;
      if (!anywhere.has(name)) continue;   // a per-element property (set inline or by a parent), not a look token
      for (const id of LOOK_IDS) if (!defined.get(id)!.has(name)) bad.add(`${path}: ${name} is not defined in ${id}`);
    }
  }
  assert.deepEqual([...bad].sort(), []);
});
