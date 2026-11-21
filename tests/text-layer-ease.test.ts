// A word that joins a chart already showing words eases in; the chart's own first words come with the chart (the iPhone audit: "NEEDLE PRESSURE · mmHg" appeared at full opacity).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TextLayer, WORD_IN_MS } from '../src/ui/charts/text-layer.ts';
import type { Shape } from '../src/ui/charts/scene.ts';

const calls: { opacity: number }[][] = [];
const el = () => { const e: Record<string, unknown> = { ownerDocument: undefined as unknown, style: { setProperty() {} }, textContent: '', append() {}, remove() {}, setAttribute() {}, animate: (f: { opacity: number }[], o: { duration: number }) => { calls.push(f); assert.equal(o.duration, WORD_IN_MS); } }; return e; };
const doc = { createElement: el } as unknown as Document;
const mk = (): Record<string, unknown> => { const e = el(); e.ownerDocument = doc; return e; };
(doc as unknown as { createElement: unknown }).createElement = mk;
const word = (s: string, alpha?: number) => ({ k: 'text', s, x: 0, y: 0, size: 13, color: [1, 1, 1, 1], alpha }) as unknown as Shape;

test('the first words of a chart do not animate; a word added later eases from 0 to its alpha', () => {
  const l = new TextLayer(doc);
  l.sync([word('a'), word('b')]);
  assert.equal(calls.length, 0);
  l.sync([word('a'), word('b'), word('NEEDLE PRESSURE · mmHg', 0.8)]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [{ opacity: 0 }, { opacity: 0.8 }]);
  l.sync([word('a'), word('b'), word('NEEDLE PRESSURE · mmHg', 0.8)]);
  assert.equal(calls.length, 1);
});
