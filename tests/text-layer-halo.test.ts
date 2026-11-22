// Root cause of "the word Liver on the bar is a dark smear" (iPhone, 22 Nov): a chart word's halo was `-webkit-text-stroke` plus `paint-order: stroke fill` on the letters themselves, and WebKit does not
// honour paint-order on HTML text, so the stroke (the card's dark colour) was laid OVER the fill. The halo is now its own span UNDER the letters, so the order never depends on the browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TextLayer } from '../src/ui/charts/text-layer.ts';
import type { Shape } from '../src/ui/charts/scene.ts';

interface Fake { style: Record<string, string> & { setProperty(k: string, v: string): void; cssText: string }; kids: Fake[]; textContent: string; ownerDocument: unknown; append(k: Fake): void; insertBefore(k: Fake, ref: Fake): void; remove(): void; setAttribute(): void }
const make = (doc: unknown): Fake => {
  const props: Record<string, string> = {};
  const f = { kids: [] as Fake[], textContent: '', ownerDocument: doc, remove() {}, setAttribute() {},
    append(k: Fake) { this.kids.push(k); }, insertBefore(k: Fake, ref: Fake) { this.kids.splice(this.kids.indexOf(ref), 0, k); },
    style: new Proxy({ cssText: '', setProperty(k: string, v: string) { props[k] = v; } } as unknown as Fake['style'], { get: (t, k: string) => (k in t ? (t as Record<string, unknown>)[k] : props[k]), set: (t, k: string, v: string) => { (t as Record<string, unknown>)[k] = v; props[k] = v; return true; } }) };
  return f as unknown as Fake;
};
const doc: { createElement(): Fake } = { createElement: () => make(doc) };
const word = (halo?: { color: number[]; w: number }) => ({ k: 'text', s: 'Liver', x: 0, y: 0, size: 14, weight: 500, color: [1, 1, 1, 1], ...(halo ? { halo } : {}) }) as unknown as Shape;

test('a word with a halo draws it as a span under the letters, never as paint-order on the letters', () => {
  const l = new TextLayer(doc as unknown as Document);
  l.sync([word({ color: [0.1, 0.1, 0.1, 1], w: 3 })]);
  const el = (l.root as unknown as Fake).kids[0]!;
  assert.doesNotMatch(el.style.cssText, /paint-order/, 'no paint-order on the letters');
  assert.ok(!el.style['-webkit-text-stroke'], 'the letters carry no stroke');
  assert.equal(el.kids.length, 2, 'a halo span and the letters');
  const [halo, txt] = el.kids as [Fake, Fake];
  // Regression (22 Nov, acf109b2): the halo is absolutely positioned, which paints OVER an unpositioned sibling, so every word was covered by its own halo. The letters must be positioned and after it.
  assert.match(txt.style.cssText, /position:relative/, 'the letters are positioned, so they paint over the halo');
  assert.match(halo.style.cssText, /position:absolute/);
  assert.equal(halo.textContent, 'Liver'); assert.equal(txt.textContent, 'Liver');
  assert.match(halo.style['-webkit-text-stroke']!, /^3px /, 'the halo is stroked at the halo width'); assert.match(halo.style.cssText, /stroke-linejoin:round/);
  assert.equal(halo.style.color, halo.style['-webkit-text-stroke']!.replace(/^3px /, ''), 'in the halo colour');
});

test('the letters are never the halo\'s colour: a word\'s colour is on the box the letters inherit, the halo\'s on its own span', () => {
  const l = new TextLayer(doc as unknown as Document);
  l.sync([word({ color: [0.1, 0.1, 0.1, 1], w: 3 })]);
  const el = (l.root as unknown as Fake).kids[0]!, [halo, txt] = el.kids as [Fake, Fake];
  assert.notEqual(el.style.color, halo.style.color, 'the word and its halo differ');
  assert.equal(txt.style.color, undefined, 'the letters take the box\'s colour');
});

test('a word without a halo has none, and a halo that goes away is hidden, a word that changes changes both', () => {
  const l = new TextLayer(doc as unknown as Document);
  l.sync([word()]);
  const el = (l.root as unknown as Fake).kids[0]!;
  assert.equal(el.kids.length, 1);
  l.sync([word({ color: [0, 0, 0, 1], w: 2 })]);
  assert.equal(el.kids.length, 2);
  l.sync([word()]);
  assert.equal((el.kids[0] as Fake).style.display, 'none');
  assert.deepEqual(l.words, ['Liver']);
});
