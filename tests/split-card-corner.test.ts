import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Capture 572259fd (Encephalopathy 2, 3.2, 10.2): the portal blood's split stood half its width left of the corner the placer gave it, and a card's height above it, because the 2D rule
// `.cath-label { translate: -50% calc(-100% - 18px) }` still applied to it while paintSplit writes the corner as transform.
const css = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
test('the base 2D label rule shifts a .cath-label (so the split needs its own override)', () => {
  assert.match(css('../src/ui/css2d/app-06-plate.css'), /^\.cath-label \{[^}]*translate: -50%/m);
});
test('the split card cancels that shift, so its transform is its corner', () => {
  assert.match(css('../src/scene/labels/labels.css'), /\.cath-label\.site\.split\.tg \{ translate: none; \}/);
});
test('the split card is made with the tg class the override names', () => {
  const src = css('../src/scene/labels/figure-cards.ts');
  assert.match(src, /'cath-label site split'/);
  assert.match(css('../src/scene/labels/tag-dom.ts'), /\$\{cls\} tg/);
});
