import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the FibroScan probe screen number has no halo: near-black digits on the orange display, a dark look\'s dark halo made one blob of them', () => {
  const css = readFileSync('src/scene/labels/labels.css', 'utf8');
  const rule = /\n\.pl-scan \{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.ok(rule.includes('color: color-mix'), 'the rule is found');
  assert.ok(!/text-stroke|text-shadow|paint-order/.test(rule), rule);
});
