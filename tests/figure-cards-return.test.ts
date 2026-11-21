import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FigureCards, type CardDeps, type FigCard } from '../src/scene/labels/figure-cards.ts';
import { FADE } from '../src/scene/labels/alpha.ts';

// Mohammad 21 Nov (iPhone, Circulation 3): tucking the instrument card made the step numbers 1 and 2 vanish, leaving their dots and leaders. Root cause: when a card faded out (the picture moved) paintCard
// wrote `opacity: 0` on the card's ROOT, and nothing ever wrote it back (opacity belongs to the children), so the number came back "on" with every child lit inside an invisible root. Every figure card
// (marks, steps, sites) that had faded once stayed gone; a tuck is just a move of the picture. Here a card goes out and returns, and its root is never left at 0.
class Style { [k: string]: unknown; setProperty(n: string, v: string) { this[n] = v; } removeProperty(n: string) { delete this[n]; return ''; } getPropertyValue(n: string) { return String(this[n] ?? ''); } }
class El {
  style = new Style(); dataset: Record<string, string> = {}; attrs = new Map<string, string>(); kids: El[] = []; className = ''; textContent = '';
  tag: string;
  constructor(tag: string) { this.tag = tag; }
  appendChild(k: El) { this.kids.push(k); return k; } append(...ks: El[]) { this.kids.push(...ks); } remove() { /* no-op */ }
  setAttribute(n: string, v: string) { this.attrs.set(n, v); } removeAttribute(n: string) { this.attrs.delete(n); } hasAttribute(n: string) { return this.attrs.has(n); } getAttribute(n: string) { return this.attrs.get(n) ?? null; }
}
(globalThis as unknown as { document: unknown }).document = { createElement: (t: string) => new El(t), createElementNS: (_n: string, t: string) => new El(t) };

test('a step number that faded out with the picture and came back is lit again: its root is never left at opacity 0', () => {
  let t = 0, moving = false;
  const deps: CardDeps = {
    project: (_p, out) => { out.x = 200; out.y = 300; return out; }, cameraMoving: () => moving, view: () => ({ x0: 0, y0: 56, x1: 390, y1: 800 }), blockers: () => [],
    vp: () => ({ w: 390, h: 844, safe: { top: 0, right: 0, bottom: 0, left: 0 } }) as never, measure: (s: string, size: number) => s.length * size * 0.56, now: () => t, spleenScale: () => 1,
    lobule: () => null, lobuleRing: () => null, circuit: () => null,
  };
  const parent = new El('div');
  const fc = new FigureCards(parent as unknown as HTMLElement, deps);
  const step: FigCard = { id: 'step:1', kind: 'step', text: '', tone: 'note', anchor: { edge: 'V_INT' }, n: 1 };
  fc.set([step], [], 0, []);
  const run = (ms: number) => { for (let i = 0; i < ms / 16; i++) { t += 16; fc.tick(); } };
  const chip = () => parent.kids.find((k) => k.className.includes('cl-step'))!;
  const lit = () => chip().attrs.has('data-on') && chip().style.opacity !== '0' && chip().kids.every((k) => k.style.opacity === '1' || k.style.display === 'none');
  run(1500); assert.ok(lit(), 'in');
  moving = true; run(FADE.outMs + 200);
  assert.ok(!chip().attrs.has('data-on'), 'out while the picture moves');
  moving = false; run(FADE.settleMs + FADE.inMs + 600);
  assert.ok(chip().attrs.has('data-on'), 'back');
  assert.notEqual(chip().style.opacity, '0', 'the card\'s root keeps no opacity of 0');
  assert.ok(lit(), 'and its children are lit');
});

test('no figure card but the split writes opacity on its root when it goes', () => {
  const src = readFileSync(new URL('../src/scene/labels/figure-cards.ts', import.meta.url), 'utf8');
  assert.match(src, /if \(c\.kind === 'split'\) r\.root\.style\.opacity = '0'/);
  assert.doesNotMatch(src, /show\(r\.card, false\); r\.root\.style\.opacity = '0'; fadeKids/);
});
