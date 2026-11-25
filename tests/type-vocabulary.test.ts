// One type vocabulary for everything the 3D app owns (23 Nov 2026, font audit; docs/approved/type.md).
// Root cause of the drift: the one type guard (ui-vocabulary.test.ts) judges a hand-kept list of files, so the Over time card (bigtime.css), the callouts, the action cards and the chart words
// each grew their own weights (450, 550, 650, 700), tracking (24 values) and size multipliers. This test judges EVERY stylesheet we own, found by walking src/, and every chart-word weight and
// tracking written in TS, so a new file cannot drift. Source-level only (nothing is run in a browser). The byte-copied 2D files (styles/, *.copied.*) are 2D's own and are not judged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir: string, out: string[] = []): string[] => {
  for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, out); else out.push(p.replace(/\\/g, '/')); }
  return out;
};
const ALL = walk('src');
const OURS = (f: string) => !/\/ui\/styles\/|\.copied\.|\.generated\.|\/debug\/|\/parity\/|\/perf\//.test(f);
const CSS = ALL.filter((f) => f.endsWith('.css') && OURS(f));
const TS = ALL.filter((f) => /\.(ts|tsx)$/.test(f) && OURS(f) && !/\.d\.ts$/.test(f));
const blank = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
const decls = (line: string, prop: RegExp) => [...line.matchAll(new RegExp(`(?<![\\w-])(${prop.source}):\\s*([^;}]*)`, 'g'))].map((m) => ({ prop: m[1]!, value: m[2]!.trim() }));

/** The one 700 the app keeps: the step numeral, bold with its halo (owner, 23 Nov, docs/approved/step-markers.md). */
const STEP_NUMERAL = /data-fig="step"|\.pz-step/;
const WEIGHT_OK = new Set(['400', '500', '600']);
const TRACK_OK = /^(0|normal|inherit|var\(--caps-ls\)|var\(--ls-tight\)|var\(--lb-track-organ\))(\s*!important)?$/;

test('every stylesheet we own uses weights 400, 500 and 600 only (the step numeral keeps 700)', () => {
  assert.ok(CSS.length > 20, 'the walk found the stylesheets');
  for (const f of CSS) blank(readFileSync(f, 'utf8')).split('\n').forEach((l, i) => {
    for (const d of decls(l, /font-weight/)) {
      const v = d.value.replace(/\s*!important/, '');
      if (/^(var\(|inherit|normal)/.test(v)) continue;
      assert.ok(WEIGHT_OK.has(v) || (v === '700' && STEP_NUMERAL.test(l)), `${f}:${i + 1}: font-weight ${v}: use 400, 500 or 600`);
    }
    for (const d of decls(l, /font/)) {
      const w = d.value.match(/^(?:(?:italic|oblique|normal)\s+)*(\d{3})\s/);
      if (w) assert.ok(WEIGHT_OK.has(w[1]!) || (w[1] === '700' && STEP_NUMERAL.test(l)), `${f}:${i + 1}: font weight ${w[1]}: use 400, 500 or 600`);
    }
  });
});

test('tracking is 0, the caps token or the display token, and no size is a multiple of a role token', () => {
  for (const f of CSS) blank(readFileSync(f, 'utf8')).split('\n').forEach((l, i) => {
    for (const d of decls(l, /letter-spacing/)) assert.match(d.value, TRACK_OK, `${f}:${i + 1}: letter-spacing ${d.value}: use 0, var(--caps-ls) (kickers) or var(--ls-tight) (serif titles, big numbers)`);
    for (const d of decls(l, /font|font-size/)) assert.doesNotMatch(d.value, /calc\(\s*var\(--t-[a-z]+\)\s*\*\s*[\d.]+\s*\)/, `${f}:${i + 1}: a size is a role token (--t-cap, --t-lab, --t-body, --t-name, --t-val, --t-big), never a multiple of one`);
  });
});

test('chart words and label runs written in TS keep to the same weights and tracking', () => {
  for (const f of TS) readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
    for (const m of l.matchAll(/\bweight:\s*(\d{3})\b/g)) assert.ok(WEIGHT_OK.has(m[1]!) || (m[1] === '700' && /String\(i \+ 1\)/.test(l)), `${f}:${i + 1}: weight ${m[1]}: use 400, 500 or 600 (the chart's step numeral keeps 700)`);
    for (const m of l.matchAll(/\bls:\s*(-?[\d.]+)\b/g)) assert.ok(['0', '0.06', '-0.015'].includes(m[1]!), `${f}:${i + 1}: ls ${m[1]}: use 0, 0.06 (caps) or -0.015 (display)`);
  });
});

test('the symbols the Google latin subsets leave out are served in Inter and Source Serif 4 (they were drawn in Arial)', () => {
  const css = readFileSync('public/fonts/fonts.css', 'utf8');
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]!);
  const ranges = (family: string) => faces.filter((b) => b.includes(`font-family: '${family}'`)).flatMap((b) => [...(b.match(/unicode-range:\s*([^;]*);/)?.[1] ?? '').matchAll(/U\+([0-9A-F]+)(?:-([0-9A-F]+))?/gi)].map((r) => [parseInt(r[1]!, 16), parseInt(r[2] ?? r[1]!, 16)] as const));
  const covered = (family: string, cp: number) => ranges(family).some(([a, b]) => cp >= a && cp <= b);
  for (const ch of '≥≤→←≈▲▼✓≠√∞') for (const fam of ['Inter', 'Source Serif 4']) assert.ok(covered(fam, ch.codePointAt(0)!), `${ch} is in a ${fam} face's unicode-range`);
  for (const f of ['inter-symbols.woff2', 'source-serif-4-symbols.woff2']) assert.ok(statSync(`public/fonts/${f}`).size > 1000, `${f} exists`);
  assert.match(readFileSync('src/boot/fonts.ts', 'utf8'), /≥.*→/, 'the first card waits for the symbols');
});
