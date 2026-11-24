import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Ascites 8 on an iPhone (440 x 736): the two walls were 50 px past the card, so its last two lines were cut mid-line. The stacked drawing's width follows the screen's height.
test('a stacked walls card takes its drawings narrower on a short screen', () => {
  const css = readFileSync(new URL('../src/ui/charts/charts.css', import.meta.url), 'utf8');
  const m = /\.pz\.stack \.pzw-art \{[^}]*max-width: max\((\d+)px, calc\(\(100svh - (\d+)px\) \* 300 \/ 276\)\)/.exec(css);
  assert.ok(m, 'the stacked .pzw-art rule is there');
  const [floor, words] = [Number(m[1]), Number(m[2])];
  const widthAt = (vh: number) => Math.max(floor, (vh - words) * 300 / 276);
  const heightAt = (vh: number) => widthAt(vh) * 276 / 600;
  // the card's room is vh - 72; the words are about 374 px (c.f. the capture) and each drawing is 276/600 of its width
  assert.ok(2 * heightAt(736) + 374 + 24 <= 736 - 72, 'iPhone upright fits');
  assert.ok(widthAt(736) < 363, 'narrower than the 363 px box');
});
