import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the FibroScan probe screen number has no halo: near-black digits on the orange display, a dark look\'s dark halo made one blob of them', () => {
  const css = readFileSync('src/scene/labels/labels.css', 'utf8');
  const rule = /\n\.pl-scan \{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.ok(rule.includes('color: color-mix'), 'the rule is found');
  assert.ok(!/text-stroke|text-shadow|paint-order/.test(rule), rule);
});

test('a criteria card\'s rule line ("Baveno VIII 1.4, 1.10, 2.3") is set in proportional figures, not the page-wide tabular ones that spread it as "1.1 0" (Stiffness 16)', () => {
  const css = readFileSync('src/ui/deck-ui.css', 'utf8');
  const line = css.split('\n').find((l) => l.includes('proportional-nums !important') && l.includes('.pz-cite')) ?? '';
  assert.ok(line.includes('.pzc-rule') && line.includes('.pzc-lead'), line.slice(0, 200));
});
