// A capture's JSON says what each card stands at (box, drawn content, how far the drawn content reaches past the box, fit, room), so a clipped card from a phone this build cannot be run on says why (Stiffness 12, Doppler 2, 25 Nov).
// And it says it TRUE (capture 2274649a, 26 Nov): 17 cards on iPhone and Mac read "content 250 against a box of 146" and the Albumin belly "43 px past the foot", while every card stood whole in its picture. The reading counted
// what nobody sees: the hidden chart table (`table.sr-only`, 118 px tall under the chart) and the belly's fluid, parked `translate: 0 100%` under the belly's own `overflow: hidden`. The rule is general, so it is pinned for every card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardBoxes, drawnFoot, type Part } from '../src/ui/debug/audit/card-boxes.ts';

interface Node { tag: string; cls: string[]; top: number; h: number; style?: Record<string, string>; kids?: Node[]; w?: number }
const BASE = { display: 'block', visibility: 'visible', overflowX: 'visible', overflowY: 'visible', contain: 'none', position: 'static', clip: 'auto', clipPath: 'none', overflow: 'visible', width: '300px', height: '10px', paddingBottom: '0px' };

/** A card from a tree of boxes: the elements the card code reads (boxes, styles, parents, class lists), nothing else. */
function build(root: Node, props: Record<string, string> = {}) {
  const styles = new Map<unknown, Record<string, string>>();
  const make = (n: Node, parent: unknown): Record<string, unknown> => {
    const el: Record<string, unknown> = { tagName: n.tag.toUpperCase(), classList: n.cls, parentElement: parent, getBoundingClientRect: () => ({ top: n.top, bottom: n.top + n.h, height: n.h, width: n.w ?? 300, left: 0, right: n.w ?? 300 }), closest: () => null };
    styles.set(el, { ...BASE, ...n.style });
    const kids = (n.kids ?? []).map((k) => make(k, el));
    const all = (e: Node): Node[] => (e.kids ?? []).flatMap((k) => [k, ...all(k)]);
    el.kids = kids; el.flat = all(n);
    return el;
  };
  const elOf = new Map<Node, Record<string, unknown>>();
  const walk = (n: Node, parent: unknown): Record<string, unknown> => { const e = make({ ...n, kids: [] }, parent); elOf.set(n, e); for (const k of n.kids ?? []) walk(k, e); return e; };
  const card = walk(root, null);
  const inner = elOf.get(root.kids![0]!)!;
  const below = (n: Node): Node[] => (n.kids ?? []).flatMap((k) => [k, ...below(k)]);
  const dkIn = root.kids![0]!;
  card.style = { getPropertyValue: (k: string) => props[k] ?? '' };
  card.querySelector = () => inner;
  card.querySelectorAll = () => below(dkIn).map((n) => elOf.get(n));
  const doc = { querySelectorAll: () => [card] } as unknown as Document;
  return { doc, styleOf: ((e: unknown) => styles.get(e)) as unknown as (e: Element) => CSSStyleDeclaration };
}
const card = (cls: string[], h: number, inner: Node): Node => ({ tag: 'div', cls: ['dk-card', ...cls], top: 10, h, style: { overflowX: 'hidden', overflowY: 'hidden', overflow: 'hidden' }, kids: [inner] });

test('a card reports its box, its drawn content and the px its lowest drawn child reaches past the box', () => {
  const tree = card(['pz-data', 'has-tool'], 175, { tag: 'div', cls: ['dk-in'], top: 11, h: 173, kids: [{ tag: 'div', cls: ['a'], top: 20, h: 100 }, { tag: 'svg', cls: ['pze-plot', 'x'], top: 120, h: 150 }] });   // the lowest ends at 270, the card at 185
  const { doc, styleOf } = build(tree, { '--pz-fit': '0.72', '--pz-room': '259px' });
  const [b] = cardBoxes(doc, styleOf);
  assert.equal(b.card, 'pz-data has-tool');
  assert.equal(b.box, 175);
  assert.equal(b.content, 260);   // (from the card's top to the lowest drawn foot)
  assert.equal(b.past, 85);
  assert.equal(b.lowest, 'svg.pze-plot.x');
  assert.equal(b.fit, '0.72');
  assert.equal(b.room, '259px');
});

test('the instrument\'s hidden chart table is not content: Portal flow 4 stood whole at 146 px and read "content 250" (every tool card, every deck, every size)', () => {
  const sr = { position: 'absolute', clip: 'rect(0px, 0px, 0px, 0px)', clipPath: 'inset(50%)', overflow: 'hidden', overflowX: 'hidden', overflowY: 'hidden', width: '1px', height: '1px' };
  const tree = card(['pz-data', 'has-tool'], 146, { tag: 'div', cls: ['dk-in'], top: 11, h: 143, kids: [{ tag: 'div', cls: ['pz-tool'], top: 44, h: 100, kids: [{ tag: 'table', cls: ['sr-only'], top: 143, h: 118, style: sr }] }] });
  const { doc, styleOf } = build(tree);
  const [b] = cardBoxes(doc, styleOf);
  assert.equal(b.lowest, 'div.pz-tool');
  assert.ok(b.content <= b.box, `content ${b.content} against a box of ${b.box}`);
  assert.equal(b.past, 0);
});

test('a part an ancestor clips away is not drawn: the Albumin belly\'s fluid waits under the belly\'s own overflow and read "43 px past the foot"', () => {
  const belly = { tag: 'div', cls: ['ab-belly'], top: 60, h: 120, style: { overflowX: 'hidden', overflowY: 'hidden', overflow: 'hidden' }, kids: [{ tag: 'i', cls: ['ab-belly-fill'], top: 180, h: 120 }, { tag: 'b', cls: ['ab-big'], top: 100, h: 40 }] };
  const tree = card(['pz-data', 'has-tool'], 189, { tag: 'div', cls: ['dk-in'], top: 11, h: 187, kids: [belly, { tag: 'p', cls: ['ab-foot'], top: 190, h: 5 }] });
  const { doc, styleOf } = build(tree);
  const [b] = cardBoxes(doc, styleOf);
  assert.equal(b.lowest, 'p.ab-foot', 'the fluid under the clip is not the lowest part');
  assert.ok(b.past <= 6, `${b.past}`);
});

test('a part that really stands past the card\'s foot is still reported, clip or no clip around it that leaves it showing', () => {
  const tree = card(['pz-data'], 100, { tag: 'div', cls: ['dk-in'], top: 11, h: 98, kids: [{ tag: 'div', cls: ['wrap'], top: 20, h: 300, kids: [{ tag: 'canvas', cls: ['late'], top: 30, h: 200 }] }] });
  const { doc, styleOf } = build(tree);
  const [b] = cardBoxes(doc, styleOf);
  assert.equal(b.lowest, 'div.wrap');
  assert.equal(b.past, 210);
  assert.ok(b.content > b.box);
});

test('drawnFoot: cut to the clip, a part clipped away whole is out, nothing drawn is null', () => {
  const p = (top: number, bottom: number, clip: Part['clip'] = null): Part => ({ top, bottom, left: 0, right: 10, clip });
  assert.deepEqual(drawnFoot([p(0, 50), p(10, 90)]), { foot: 90, at: 1 });
  assert.deepEqual(drawnFoot([p(0, 50), p(10, 200, { top: 0, bottom: 80, left: 0, right: 10 })]), { foot: 80, at: 1 }, 'a clip cuts the foot');
  assert.deepEqual(drawnFoot([p(0, 50), p(120, 200, { top: 0, bottom: 80, left: 0, right: 10 })]), { foot: 50, at: 0 }, 'wholly under its clip: not drawn');
  assert.equal(drawnFoot([]), null);
});
