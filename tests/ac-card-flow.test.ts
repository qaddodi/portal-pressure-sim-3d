// The tap-anything card has its height from its body: the body must be in the card's flow whatever the 2D stylesheets say (they lay `.ac-body` over its box, `position: absolute; inset: 0`,
// and undo that only under 2D's `.action-card`). With the body absolute the card collapsed to a 12 px sliver and a vessel's tap seemed to open no card (iPhone, 20 Nov).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const css = (f: string) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
const rules = (src: string) => [...src.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! }));

test('the card\'s body (and its Details face, also an .ac-body) is placed in the flow by a rule that out-ranks 2D\'s `.ac-body { position: absolute }`', () => {
  const lifted = rules(css('css2d/app-03-layouts.css')).find((r) => /^\.ac-body, \.ac-ghost, \.ac-details$/.test(r.sel));
  assert.ok(lifted && /position:\s*absolute/.test(lifted.body), 'the lifted 2D sheet lays the body over its box (this is what the override answers)');
  const own = rules(css('action/action.css')).find((r) => r.sel === '.ac-card > .ac-body');
  assert.ok(own, 'action.css puts the body back in the flow');
  assert.match(own!.body, /position:\s*relative/);
  assert.match(own!.body, /inset:\s*auto/);
  // specificity: two classes beat one, whatever the load order
  assert.equal((own!.sel.match(/\./g) ?? []).length, 2);
  // the Details face uses the same element class
  assert.match(readFileSync(new URL('../src/ui/action/DetailsFace.tsx', import.meta.url), 'utf8'), /className="ac-body ac-details"/);
  // and the card itself is a flex column with a height cap, so a tall body scrolls instead of the card growing past its room
  const card = rules(css('action/action.css')).find((r) => r.sel === '.ac-card')!;
  assert.match(card.body, /display:\s*flex/); assert.match(card.body, /max-height/);
});
