// The Labels setting is for free exploration: on a slide the figure names what the slide teaches whatever the setting (Mohammad, 24 Nov: Ascites 9's sinusoid had no names, Labels off).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { levelFor } from '../src/scene/labels/free-set.ts';

test('levelFor: None is overruled on a slide only; the setting itself is untouched', () => {
  assert.equal(levelFor('none', true), 'key');
  assert.equal(levelFor('none', false), 'none');
  assert.equal(levelFor('all', true), 'all');
  assert.equal(levelFor('key', true), 'key');
});

test('every micro/circuit caption layer reads the level through levelFor (none reads the raw setting)', () => {
  for (const f of ['sinusoid/SinusoidCaptions', 'lobule/LobuleCaptions', 'circuit/CircuitCaptions']) {
    const src = readFileSync(new URL(`../src/scene/${f}.tsx`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /(?<!levelFor\()useShell\.getState\(\)\.figure\.labelLevel(?!, useLabels)/, f);
    assert.match(src, /levelFor\(/, f);
  }
});
