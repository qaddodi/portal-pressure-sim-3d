// A reading callout that is measuring does not flicker (Mohammad, 22 Nov 2026: "the callout FLICKERS as it's measuring": the EUS-PPG's "PV 20.4 mmHg" card).
// Root cause: while the needle reads, the card's number is the model's live pressure, written a few times a second. cath-dom.ts `words` sent EVERY change of a showing card through `restyle`,
// which clones the card as `.lb-was` and fades the clone 1 -> 0 and the new number 0 -> 1 over D_SMALL; a second change inside those 240 ms made a second clone that began again at full
// opacity beside the first, so the number pulsed instead of holding still. Two rules at the root: (1) restyle runs one crossing per element at a time (a change that arrives mid-crossing
// rides it); (2) a reading that only ticks (same kicker, unit and tone, a number within ROLL_MIN of the last) is written where it stands, as the station labels' numbers are.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { restyle } from '../src/scene/labels/roll.ts';
import { words, type Card } from '../src/scene/labels/cath-dom.ts';

class Anim { onfinish: (() => void) | null = null; oncancel: (() => void) | null = null; keys: unknown[]; opts: unknown; constructor(keys: unknown[], opts: unknown) { this.keys = keys; this.opts = opts; } }
class El {
  attrs: Record<string, string> = {}; style: Record<string, string> = {}; dataset: Record<string, string> = {}; children: El[] = []; parentElement: El | null = null; anims: Anim[] = []; text = '';
  get textContent(): string { return this.children.length ? this.children.map((c) => c.textContent).join('') : this.text; }
  set textContent(v: string) { this.text = v; }
  getAttribute(k: string): string | null { return this.attrs[k] ?? null; }
  setAttribute(k: string, v: string): void { this.attrs[k] = v; }
  appendChild(e: El): void { this.children.push(e); e.parentElement = this; }
  insertBefore(e: El, ref: El): void { this.children.splice(this.children.indexOf(ref), 0, e); e.parentElement = this; }
  cloneNode(deep: boolean): El { const c = new El(); c.attrs = { ...this.attrs }; c.style = { ...this.style }; c.text = this.text; if (deep) for (const k of this.children) c.appendChild(k.cloneNode(true)); return c; }
  remove(): void { if (this.parentElement) { this.parentElement.children = this.parentElement.children.filter((c) => c !== this); this.parentElement = null; } }
  getAnimations(): Anim[] { return this.anims; }
  animate(keys: unknown[], opts: unknown): Anim { const a = new Anim(keys, opts); this.anims.push(a); return a; }
}
const realSet = globalThis.setTimeout;
(globalThis as unknown as { setTimeout: unknown }).setTimeout = () => 0;
test.after(() => { (globalThis as unknown as { setTimeout: unknown }).setTimeout = realSet; });

function card(value = '20.4') {
  const layer = new El(), root = new El(), k = new El(), n = new El(), u = new El();
  k.text = 'PV'; n.text = value; u.text = 'mmHg';
  root.appendChild(k); root.appendChild(n); root.appendChild(u); layer.appendChild(root); root.attrs.class = 'cl cl-pill';
  const c = { root, k, n, u, text: `PV|${value}|mmHg`, tone: 'pv' } as unknown as Card;
  return { layer, root, n, c };
}
const copies = (layer: El) => layer.children.filter((e) => /lb-was/.test(e.attrs.class ?? '')).length;
const read = (v: string, tone = 'pv') => ({ kicker: 'PV', value: v, unit: 'mmHg', tone });

test('a number that ticks while the card shows is written where it stands: no copy, no animation', () => {
  const { layer, n, c } = card('20.4');
  for (const v of ['20.5', '20.4', '20.6', '20.7', '20.5']) words(c, read(v), 1);
  assert.equal(copies(layer), 0, 'a tick never starts a crossing');
  assert.equal(n.anims.length, 0);
  assert.equal(n.text, '20.5', 'the number on the card is the newest');
  assert.equal(c.text, 'PV|20.5|mmHg');
});

test('a real change (a dash comes to a number, a jump, a new unit or tone) still crosses over', () => {
  const a = card('—'); words(a.c, read('20.4'), 1); assert.equal(copies(a.layer), 1, 'a dash to a number');
  const b = card('20.4'); words(b.c, read('27.9'), 1); assert.equal(copies(b.layer), 1, 'a jump of 0.5 or more');
  const t = card('20.4'); words(t.c, read('20.4', 'danger'), 1); assert.equal(copies(t.layer), 1, 'a tone');
});

test('a change that arrives while a crossing runs rides it: one copy, never a second one starting at full opacity', () => {
  const { layer, root, n } = card('20.4');
  restyle(root as unknown as Element, () => { n.text = '27.9'; }, 1);
  assert.equal(copies(layer), 1);
  restyle(root as unknown as Element, () => { n.text = '31.0'; }, 1);
  restyle(root as unknown as Element, () => { n.text = '35.0'; }, 1);
  assert.equal(copies(layer), 1, 'still the one copy');
  assert.equal(n.text, '35.0', 'the live number is the newest');
  assert.equal(n.anims.length, 1, 'the number fades in once; a later change does not restart it');
});
