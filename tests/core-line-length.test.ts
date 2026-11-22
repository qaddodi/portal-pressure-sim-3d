// R11: the four core files stay readable. No line is longer than 240 characters (history goes to docs/decisions.md, a long expression is broken up), so a new thread reads them without scrolling sideways.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const f of ['src/scene/scene.ts', 'src/scene/api.ts', 'src/scene/Stage.tsx', 'src/ui/ui-store.ts']) {
  test(`${f} has no line over 240 characters`, () => {
    const long = readFileSync(f, 'utf8').split('\n').flatMap((l, i) => (l.length > 240 ? [`${i + 1} (${l.length})`] : []));
    assert.deepEqual(long, []);
  });
}
