// The audit's low-contrast words on the iPhone (build fd67073f, Soft look): "Splenic vein" 4.03:1 (a linked term inked 80% of its tone, the violet #7D5CDB) and "Sinusoidal" 4.26:1
// (the level kicker, inked as the raw level colour). Both inks are the colour drawn toward the text colour; this pins the share so each reaches 4.5:1 on the page's own background in every look.
import { merged2d } from './merged-2d.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = merged2d('app-04-presenter.css');
const hex = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const mix = (a: number[], b: number[], p: number) => a.map((v, i) => v * p + b[i]! * (1 - p));
const lum = (c: number[]) => { const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!); };
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
/** The share of the colour in the ink of the rule that starts with `head` (the rest of that line holds `color: color-mix(in srgb, <colour> N%, var(--text))`). */
const share = (head: string): number => {
  const line = css.split('\n').find((l) => l.startsWith(head));
  assert.ok(line, head);
  const m = /[^-]color: color-mix\(in srgb, .*? (\d+)%, var\(--text\)\)/.exec(line!);
  assert.ok(m, head);
  return +m![1]! / 100;
};
// each look's page background and text colour (tokens.css), and the portal and systemic colours that look draws the level colours from
const LOOKS = [['light', '#F1EBE0', '#1B1710', '#B8326F', '#3F7FCB'], ['soft', '#DDD0B9', '#1F1A12', '#B8326F', '#3F7FCB'], ['dark', '#1A1917', '#EEEBE5', '#E06AA2', '#79AEEF'], ['navy', '#0E1422', '#E9EDF6', '#E06AA2', '#79AEEF']] as const;

test('a linked term (Splenic vein) reads 4.5:1 on every look', () => {
  const p = share('.pz-term:not(.pz-lens-t) {');
  for (const [name, bg, tx] of LOOKS) assert.ok(ratio(mix(hex('#7D5CDB'), hex(tx), p), hex(bg)) >= 4.5, name);
});

test('the level kicker (Sinusoidal) reads 4.5:1 on every look, every level but the far ends', () => {
  const p = share('.pz-kick {');
  for (const [name, bg, tx, pk, sy] of LOOKS) for (const v of [1, 0.8, 0.6, 0.4]) assert.ok(ratio(mix(mix(hex(pk), hex(sy), v), hex(tx), p), hex(bg)) >= 4.5, `${name} ${v}`);
});

// ── every colour a linked term can take, on the cards of every look (27 Nov: "superior mesenteric veins" 4.05:1 on Light; the 66% share was pinned for one violet only) ──
import { TARGETS_FIG } from '../src/scene/labels/figure2d.copied.ts';
import { toneVar, toneInk } from '../src/ui/text/rich.ts';

const TOKENS = readFileSync(new URL('../src/ui/styles/tokens.css', import.meta.url), 'utf8');
const BLOCKS = [...TOKENS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim(), body: m[2]! }));
const DARK = ':root[data-theme="dark"]', DARK_AUTO = ':root:not([data-theme="light"]):not([data-theme="soft"])';
/** The selectors that apply to each look, in the order the cascade applies them. */
const APPLY: Record<string, string[]> = {
  light: [':root'], soft: [':root', ':root[data-theme="soft"]'],
  dark: [':root', DARK_AUTO, DARK], navy: [':root', DARK_AUTO, DARK, `${DARK}[data-palette="navy"]`], black: [':root', DARK_AUTO, DARK, `${DARK}[data-palette="black"]`],
};
/** A look's custom properties as written (later rules win), then resolved to a colour: a hex, a `var()` of another, or a `color-mix(in srgb, A N%, B)`. */
function lookVars(look: string): (name: string) => number[] | null {
  const raw = new Map<string, string>();
  for (const sel of APPLY[look]!) for (const b of BLOCKS) if (b.sel.split(',').map((x) => x.trim()).includes(sel)) for (const m of b.body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) raw.set(m[1]!, m[2]!.trim());
  const val = (v: string): number[] | null => {
    const h = /^#([0-9A-Fa-f]{6})$/.exec(v); if (h) return hex(v);
    const r = /^var\((--[\w-]+)\)$/.exec(v); if (r) return raw.has(r[1]!) ? val(raw.get(r[1]!)!) : null;
    const c = /^color-mix\(in srgb, (.+) (\d+)%, (.+)\)$/.exec(v);
    if (c) { const a = val(c[1]!), b = val(c[3]!); return a && b ? mix(a, b, +c[2]! / 100) : null; }
    return null;
  };
  return (name) => (raw.has(name) ? val(raw.get(name)!) : null);
}
const FACE = (look: string) => {
  const own = BLOCKS.filter((b) => APPLY[look]!.some((s) => b.sel.split(',').map((x) => x.trim()).includes(s)) && /--bg:/.test(b.body)).at(-1)!.body;
  return { text: /--text:\s*(#[0-9A-Fa-f]{6})/.exec(own)![1]!, cards: [...own.matchAll(/--(?:surface|surface-2):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => m[1]!) };
};
/** The colour a term takes in a look: the CSS's own mix of its tone (or its `-term` token) with the text colour. */
const termInk = (look: string, tone: string, share: number): number[] | null => {
  const get = lookVars(look), text = hex(FACE(look).text);
  const css = toneInk(tone), name = (x: string) => /var\((--[\w-]+)/.exec(x)![1]!;
  const term = get(name(css)) ?? get(name(toneVar(tone)));
  return term ? mix(term, text, share) : null;
};

test('a linked term reads 4.5:1 on the cards of every look, whatever it points at (the share was pinned for one violet; amber SMV read 3.75:1 on Light, 2.88:1 on Soft)', () => {
  const tones = [...new Set(Object.values(TARGETS_FIG).map((t) => t.tone).filter((t) => t !== 'accent'))];
  const p = share('.pz-term:not(.pz-lens-t) {');
  let n = 0;
  const skipped = new Set<string>();
  for (const look of Object.keys(APPLY)) for (const tone of tones) {
    const ink = termInk(look, tone, p);
    if (!ink) { skipped.add(`${look} ${tone}`); continue; }
    for (const card of FACE(look).cards) {
      n++;
      assert.ok(ratio(ink, hex(card)) >= 4.5, `${look}: a term of tone "${tone}" on ${card}: ${ratio(ink, hex(card)).toFixed(2)}:1 at ${p * 100}%`);
    }
  }
  assert.ok(n > 100, `read ${n} pairs (skipped: ${[...skipped].slice(0, 8).join(', ')})`);
  for (const s of ['smv', 'imv', 'sv', 'pv', 'wedge']) assert.ok(![...skipped].some((k) => k.endsWith(` ${s}`)), `${s} resolves in every look`);
});
