// Chart lettering reads at 4.5:1 on what it stands on, in every look (audit v2 B8: "PPG" and "HVPG" at 4.33:1, "WHVP" at 3.29:1). One rule, legible.ts, applied where every frame is shown (painter.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHARTS } from '../src/ui/charts/registry.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';
import { paletteOf } from '../src/ui/charts/palette.ts';
import { contrast, parseColour, type Rgba } from '../src/ui/charts/colour.ts';
import { legible, inkFor, backdropOf, MIN_INK } from '../src/ui/charts/legible.ts';
import type { Frame, TextShape } from '../src/ui/charts/scene.ts';
import { ctxOf } from './charts-helpers.ts';

const word = (color: Rgba, o: Partial<TextShape> = {}): TextShape => ({ k: 'text', x: 20, y: 20, s: 'HVPG', size: 12, color, ...o });
const frame = (shapes: Frame['shapes']): Frame => ({ w: 100, h: 60, shapes, label: '' } as unknown as Frame);

test('a word that reads is the same word; one that does not is drawn toward the text colour by the least share', () => {
  const surface = parseColour('#F1EBE0'), text = parseColour('#1B1710'), amber = parseColour('#D9A441');
  assert.ok(contrast(amber, surface) < MIN_INK);
  const f = frame([word(amber)]);
  const g = legible(f, surface, text);
  const c = (g.shapes[0] as TextShape).color;
  assert.ok(contrast(c, surface) >= MIN_INK, `reads ${contrast(c, surface).toFixed(2)}`);
  assert.ok(contrast(c, surface) < MIN_INK + 0.4, 'but no more than it must: the hue is kept as far as it can be');
  const ok = frame([word(text)]);
  assert.equal(legible(ok, surface, text), ok, 'nothing short of 4.5 : the very frame comes back');
  assert.equal(inkFor(text, surface, text), text);
});

test('a word over a dark bar is judged on the bar, not on the card; over a path or a band its backdrop is unknown and it is left alone', () => {
  const surface = parseColour('#F1EBE0'), text = parseColour('#1B1710');
  const bar: Frame['shapes'][number] = { k: 'rect', x: 0, y: 0, w: 100, h: 40, fill: parseColour('#223344') };
  const mid = parseColour('#7a7a7a');   // over the dark bar it falls short and goes toward white
  const g = legible(frame([bar, word(mid)]), surface, text);
  const c = (g.shapes[1] as TextShape).color;
  assert.ok(contrast(c, parseColour('#223344')) >= MIN_INK && c[0] > mid[0], 'lighter, to read on the dark bar');
  const blob: Frame['shapes'][number] = { k: 'path', pts: [0, 0, 100, 0, 100, 40, 0, 40], closed: true, fill: parseColour('#223344') };
  assert.equal(backdropOf([blob], 1, 20, 20, surface), null);
  const f = frame([blob, word(mid)]);
  assert.equal(legible(f, surface, text), f);
});

test('every chart specimen, every look, at a phone and a Mac width: each word with a known backdrop reads 4.5:1 once shown', () => {
  let words = 0, fixed = 0;
  for (const c of CHARTS) for (const s of c.specimens) for (const look of LOOK_IDS) for (const [w, d] of [[330, 'desktop'], [300, 'phone-portrait']] as const) {
    let f: Frame;
    try { f = s.build(ctxOf(look, w, d)); } catch { continue; }
    const pal = paletteOf(look), surface = pal.tok('surface');
    const g = legible(f, surface, pal.tok('text'));
    if (g !== f) fixed++;
    g.shapes.forEach((t, i) => {
      if (t.k !== 'text' || !t.s.trim()) return;
      const bg = backdropOf(g.shapes, i, t.x, t.y, surface);
      if (!bg) return;
      words++;
      const r = contrast(t.color, bg);
      assert.ok(r >= MIN_INK - 0.02, `${c.kind} ${look} ${w}: "${t.s}" reads ${r.toFixed(2)}:1`);
    });
  }
  assert.ok(words > 500, `${words} words judged`);
  console.log(`# chart words judged: ${words}; frames that needed ink: ${fixed}`);
});

test('every chart is shown through the rule: the painter inks each frame before it draws it', () => {
  const src = readFileSync('src/ui/charts/painter.ts', 'utf8');
  assert.match(src, /show\(next: Frame, glide = true\) \{\s*next = this\.legible\(next\);/);
});
