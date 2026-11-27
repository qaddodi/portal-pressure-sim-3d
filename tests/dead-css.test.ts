// The 2D app's stylesheets came over whole; the classes nothing sets any more (the plate's SVG overlay, the old shell and popover) were pruned (scripts/prune-dead-css.mjs).
// What is left is only named inside a `:not(...)` or `:is(...)`, where removing it would change what matches. A new dead class fails here: delete its rules, or write the name where the code uses it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error (plain .mjs tool)
import { deadClasses, BUILT_AT_RUNTIME } from '../scripts/dead-css.mjs';
// @ts-expect-error (plain .mjs tool)
import { prune, splitSelectors, namesOutsideNot } from '../scripts/prune-dead-css.mjs';

/** The classes the sheets name only inside `:not(...)` or `:is(...)` lists: the ratchet. It may only go down. */
const ONLY_IN_NOT = 34;

test('no stylesheet class is dead outside a :not() or :is(), and the count of those left only goes down', () => {
  const { dead } = deadClasses() as { dead: string[] };
  assert.ok(dead.length <= ONLY_IN_NOT, `${dead.length} dead classes (at most ${ONLY_IN_NOT}): ${dead.join(', ')}`);
});

test('the pruner takes a dead class\'s selectors and rules out, keeps a live one, and keeps a :not() or :is() naming one', () => {
  const dead = new Set(['gone']);
  const r = prune('.a, .gone .b { color: red }\n.gone { top: 0 }\n@media (min-width: 1px) { .gone > i { top: 1px } }\n.c:not(.gone) { left: 0 }\n.d { margin: 0 }', dead) as { css: string; rules: number; selectors: number };
  assert.equal(r.rules, 2); assert.equal(r.selectors, 3);
  assert.ok(/\.a \{/.test(r.css) && !/\.gone \.b/.test(r.css) && !/@media/.test(r.css));
  assert.ok(r.css.includes('.c:not(.gone)') && r.css.includes('.d {'));
  assert.deepEqual(splitSelectors('a:is(.x, .y), b'), ['a:is(.x, .y)', 'b']);
  assert.equal(namesOutsideNot('.p:not(.gone)', dead), false);
  assert.equal(namesOutsideNot(':is(.gone, .live) .p', dead), false);   // (another member of the list may be live)
  assert.equal(namesOutsideNot('.p .gone', dead), true);
});

test('the names built at runtime are never called dead', () => {
  for (const n of ['sv-region-alb', 'sv-end-arrow-u', 'cc-lane', 'lb-g-name', 'sh-crash-figure']) assert.ok((BUILT_AT_RUNTIME as RegExp).test(n), n);
});
