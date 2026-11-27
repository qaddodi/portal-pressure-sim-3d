// A callout fades in ONCE: its words come up from nothing and never dip on the way (Mohammad, 27 Nov: the FHVP and WHVP cards of the HVPG catheter, and the sinusoid's pressure and WHVP callouts in the HVPG
// deck, "flicker first, then appear; they should just fade in").
//
// Root cause, in the one path every callout writes its words through (tag-dom.ts `words`, figure-cards.ts `paintCard`, roll.ts `restyle`), two faults that met on the first frame:
//  (1) `restyle` was told how visible the tag is by the opacity the frame was ABOUT to write. A tag that is only now coming in already has 0.1 on its first frame, above RESTYLE_SHOWING, so the words it
//      was handed for the first time (or the other words it last stood with, while it was hidden) were treated as a change to a label that is showing, and crossed over from the old copy.
//  (2) That crossing brought the new words in with `animate([{ opacity: 0 }])`. A lone keyframe with no offset is the END of an animation, so the words ran from their own opacity DOWN to 0 for 240 ms and
//      snapped back: visible as a flash, a dip, then the callout. (The keyframe is the start only with `offset: 0`: roll.ts `comeIn`.)
// The rule, pinned here on the real paint paths with a fake DOM that evaluates Web Animations as a browser does: a tag that is coming in is judged by what is on the screen (`painted`), takes its words at once,
// and its words' opacity (inline opacity times any animation on them or their parents) only ever rises until it is whole, for the catheter's cards, the HVPG stack, the figure's callouts (the sinusoid's
// pair), a card that comes back with other words than it left with, and every card a slide stands, in any deck.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { CathShow, type CathIn } from '../src/scene/labels/cath-show.ts';
import { buildCath } from '../src/scene/labels/cath-dom.ts';
import { FigureCards, type CardDeps, type FigCard } from '../src/scene/labels/figure-cards.ts';
import { painted, makeTag, words, fade, type Tag } from '../src/scene/labels/tag-dom.ts';
import { comeIn, restyle } from '../src/scene/labels/roll.ts';

// ── a DOM that knows Web Animations ──
type Key = { opacity?: number; offset?: number };
interface Opts { duration: number; easing?: string; fill?: string }
let now = 0;   // the page's time, ms: the test's frames set it
class Anim {
  onfinish: (() => void) | null = null; oncancel: (() => void) | null = null; start = now; keys: Key[]; opts: Opts;
  constructor(keys: Key[], opts: Opts) { this.keys = keys; this.opts = opts; }
}
class Style { [k: string]: unknown; setProperty(n: string, v: string) { this[n] = v; } removeProperty(n: string) { delete this[n]; return ''; } getPropertyValue(n: string) { return String(this[n] ?? ''); } }
class El {
  style = new Style(); dataset: Record<string, string> = {}; attrs = new Map<string, string>(); children: El[] = []; parentElement: El | null = null; anims: Anim[] = []; text = '';
  tag: string;
  constructor(tag: string) { this.tag = tag; }
  get className(): string { return this.attrs.get('class') ?? ''; }
  set className(v: string) { this.attrs.set('class', v); }
  get textContent(): string { return this.children.length ? this.children.map((c) => c.textContent).join('') : this.text; }
  set textContent(v: string) { this.text = v; }
  appendChild(k: El): El { this.children.push(k); k.parentElement = this; return k; }
  append(...ks: El[]): void { for (const k of ks) this.appendChild(k); }
  insertBefore(e: El, ref: El): void { this.children.splice(this.children.indexOf(ref), 0, e); e.parentElement = this; }
  remove(): void { if (this.parentElement) { this.parentElement.children = this.parentElement.children.filter((c) => c !== this); this.parentElement = null; } }
  setAttribute(n: string, v: string): void { this.attrs.set(n, v); }
  removeAttribute(n: string): void { this.attrs.delete(n); }
  hasAttribute(n: string): boolean { return this.attrs.has(n); }
  getAttribute(n: string): string | null { return this.attrs.get(n) ?? null; }
  cloneNode(deep: boolean): El {
    const c = new El(this.tag); c.attrs = new Map(this.attrs); c.dataset = { ...this.dataset }; c.text = this.text;
    for (const k of Object.keys(this.style)) if (typeof this.style[k] === 'string') c.style[k] = this.style[k];
    if (deep) for (const k of this.children) c.appendChild(k.cloneNode(true));
    return c;
  }
  getAnimations(): Anim[] { return this.anims; }
  animate(keys: Key[], opts: Opts): Anim { const a = new Anim(keys, opts); this.anims.push(a); return a; }
}
(globalThis as unknown as { document: unknown }).document = { createElement: (t: string) => new El(t), createElementNS: (_n: string, t: string) => new El(t) };
const realSet = globalThis.setTimeout;
(globalThis as unknown as { setTimeout: unknown }).setTimeout = () => 0;
test.after(() => { (globalThis as unknown as { setTimeout: unknown }).setTimeout = realSet; });

/** An element's own opacity at `now`: its inline opacity, then what the animations on it do to it (Web Animations: a lone keyframe with no offset is the END, one at offset 0 the START; the other end is the
 *  element's own opacity; a finished animation holds its end only with fill `both` or `forwards`, a not-yet-started one its start with `both` or `backwards`). */
function own(e: El): number {
  const base = e.style.opacity === undefined || e.style.opacity === '' ? 1 : Number(e.style.opacity);
  let o = base;
  for (const a of e.anims) {
    const fill = a.opts.fill ?? 'none', p = (now - a.start) / a.opts.duration;
    if (p >= 1 && fill !== 'both' && fill !== 'forwards') continue;
    if (p < 0 && fill !== 'both' && fill !== 'backwards') continue;
    const u = Math.min(1, Math.max(0, p)), k = a.keys;
    const [from, to] = k.length === 1 ? (k[0]!.offset === 0 ? [k[0]!.opacity!, base] : [base, k[0]!.opacity!]) : [k[0]!.opacity!, k[k.length - 1]!.opacity!];
    o = from + (to - from) * u;
  }
  return o;
}
const visible = (e: El): boolean => { for (let x: El | null = e; x; x = x.parentElement) if (x.hasAttribute('data-on')) return true; return false; };
/** How much of an element's words reach the eye: its parts' opacity down the chain (0 where it is not switched on). */
function ink(e: El): number {
  if (!visible(e)) return 0;
  let o = 1;
  for (let x: El | null = e; x; x = x.parentElement) o *= own(x);
  return o;
}
/** The words standing in a layer, by part: the live tag's `k`, `n` and `u` with text (the largest is the tag's), and every old copy left beside it. */
function tagInk(t: El): number { return Math.max(0, ...t.children.filter((k) => k.textContent !== '').map(ink)); }
const copies = (layer: El): El[] => layer.children.filter((c) => /lb-was/.test(c.className));
const copyInk = (layer: El): number => Math.max(0, ...copies(layer).flatMap((c) => (c.children.length ? c.children : [c]).filter((k) => k.textContent !== '').map(ink)));

/** Runs `frames` of 16 ms, calling `each` after every one; returns the ink of what `read` names, frame by frame. */
function series(frames: number, each: () => void, read: () => number): number[] {
  const out: number[] = [];
  for (let i = 0; i < frames; i++) { now += 16; each(); out.push(read()); }
  return out;
}
/** Never falls (a hair of rounding) while it rises to whole: the arrival of a callout is one fade. */
function assertArrival(s: number[], what: string): void {
  for (let i = 1; i < s.length; i++) assert.ok(s[i]! >= s[i - 1]! - 1e-6, `${what}: frame ${i} fell from ${s[i - 1]!.toFixed(3)} to ${s[i]!.toFixed(3)} (${s.map((v) => v.toFixed(2)).join(' ')})`);
  assert.ok(Math.abs(s[s.length - 1]! - 1) < 1e-6, `${what}: it ends whole (${s[s.length - 1]})`);
  assert.ok(s[0]! < 0.5, `${what}: it begins faint, not at once (${s[0]})`);
}

const measure = (t: string, size: number, _w?: number, track = 0) => t.length * size * 0.56 + track * t.length;
const base: CathIn = { vp: { w: 1280, h: 800 } as CathIn['vp'], cath: 'wedge', measure: measure as CathIn['measure'], band: { x0: 0, y0: 56, x1: 1280, y1: 800 }, blockers: [], tip: [600, 400], ahead: [650, 330], got: 2, text: { f: '5.0', w: '16.5', h: '11.5', hv: 11.5 } };
const run = (c: ReturnType<typeof rig>, frames: number, hold = false) => { for (let i = 0; i < frames; i++) { now += 16; c.show.step(16, hold); c.dom.paint(c.show.frame); } };
function rig() {
  const layer = new El('div');
  return { layer, show: new CathShow(), dom: buildCath(layer as unknown as HTMLElement) };
}
const pillEl = (layer: El, k: 'f' | 'w') => layer.children.find((c) => c.dataset.k === k && /cl-pill/.test(c.className))!;

test('FHVP and WHVP: the first time they come in, each reads from nothing to whole and never dips', () => {
  const c = rig();
  c.show.solve(base);
  const f = pillEl(c.layer, 'f'), w = pillEl(c.layer, 'w');
  const fs: number[] = [], ws: number[] = [], cs: number[] = [];
  for (let i = 0; i < 40; i++) { run(c, 1); fs.push(tagInk(f)); ws.push(tagInk(w)); cs.push(Math.max(copyInk(c.layer), 0)); }
  assertArrival(fs.slice(fs.findIndex((v) => v > 0)), 'FHVP');
  assertArrival(ws.slice(ws.findIndex((v) => v > 0)), 'WHVP');
  assert.equal(Math.max(...cs), 0, 'no old copy of a card that was never on show is ever drawn');
  assert.equal(copies(c.layer).length, 0, 'none is even made');
});

test('FHVP and WHVP that come back with other numbers than they left with arrive the same way: no old copy, no dip', () => {
  const c = rig();
  c.show.solve(base); run(c, 60);
  assert.ok(tagInk(pillEl(c.layer, 'f')) > 0.99, 'on show');
  // the picture moves: they leave; the slide's next patient has other numbers (the cards keep the old ones while they leave), and they come in again
  run(c, 30, true);
  assert.equal(tagInk(pillEl(c.layer, 'f')), 0, 'gone');
  c.show.setText({ f: '7.9', w: '21.3', h: '13.4', hv: 13.4 }, false);
  c.show.solve({ ...base, text: { f: '7.9', w: '21.3', h: '13.4', hv: 13.4 }, tip: [610, 405], ahead: [655, 338] });
  const f = pillEl(c.layer, 'f'), w = pillEl(c.layer, 'w');
  const fs: number[] = [], ws: number[] = [], cs: number[] = [];
  for (let i = 0; i < 40; i++) { run(c, 1); fs.push(tagInk(f)); ws.push(tagInk(w)); cs.push(copyInk(c.layer)); }
  assertArrival(fs.slice(fs.findIndex((v) => v > 0)), 'FHVP again');
  assertArrival(ws.slice(ws.findIndex((v) => v > 0)), 'WHVP again');
  assert.equal(Math.max(...cs), 0, 'the words it left with are not drawn again beside the new ones');
  assert.equal(f.children[1]!.textContent, '7.9', 'and it says what it says now');
});

test('the HVPG stack comes in as one fade too: each row and the HVPG rise without a dip, the bracket and the leaders with them', () => {
  const c = rig();
  c.show.solve({ ...base, cath: 'result' });
  const sum = c.layer.children.find((x) => x.dataset.k === 's')!;
  const parts = sum.children.filter((x) => /cl-row/.test(x.className));
  assert.equal(parts.length, 3);
  const all = parts.map(() => [] as number[]), cs: number[] = [];
  for (let i = 0; i < 80; i++) { run(c, 1); parts.forEach((p, j) => all[j]!.push(tagInk(p))); cs.push(copyInk(c.layer)); }
  all.forEach((s, j) => assertArrival(s.slice(s.findIndex((v) => v > 0)), `stack part ${j}`));
  assert.equal(Math.max(...cs), 0, 'no old copy of anything in the stack');
});

test('a callout on the lobule (the sinusoid pair\'s WHVP and pressure) comes in from nothing to whole, also when it returns with other words', () => {
  let moving = false;
  const deps: CardDeps = {
    project: (_p, out) => { out.x = 300; out.y = 320; return out; }, cameraMoving: () => moving, view: () => ({ x0: 0, y0: 56, x1: 1280, y1: 800 }), blockers: () => [],
    vp: () => ({ w: 1280, h: 800, safe: { top: 0, right: 0, bottom: 0, left: 0 } }) as never, measure: measure as never, now: () => now, spleenScale: () => 1,
    lobule: (_n, out) => out.set(0, 0, 0), lobuleRing: (_n, out) => out.set(0.1, 0, 0), circuit: () => null,
  };
  const layer = new El('div');
  const fc = new FigureCards(layer as unknown as HTMLElement, deps);
  const card = (value: string): FigCard => ({ id: 'callout', kind: 'mark', text: 'WHVP', value, unit: 'mmHg', tone: 'wedge', anchor: { lobule: 'sinusoid:pair' } });
  const frame = () => { now += 16; fc.tick(); };
  const tag = () => layer.children.find((x) => /cl-pill/.test(x.className))!;
  // (the callout's ring and the leader to its words, the pair's two strokes)
  const lead = () => layer.children.find((x) => x.className === 'lz-co')?.children[0];
  fc.set([card('16.5')], [], now, []);
  const s: number[] = [], l: number[] = [], cs: number[] = [];
  for (let i = 0; i < 80; i++) { frame(); const t = tag(); if (!t) continue; s.push(tagInk(t)); // (a leader's opacity is its own: it is hidden by its scale, not by data-on)
    l.push(lead() ? own(lead()!) : 0); cs.push(copyInk(layer)); }
  assertArrival(s.slice(s.findIndex((v) => v > 0)), 'the callout\'s words');
  assertArrival(l.slice(l.findIndex((v) => v > 0)), 'its ring\'s leader');
  assert.equal(Math.max(...cs), 0, 'no old copy');
  assert.equal(copies(layer).length, 0, 'none is made: not of the words, the ring or the leader');
  // out with the picture, back with another number
  moving = true; for (let i = 0; i < 40; i++) frame();
  assert.equal(tagInk(tag()), 0, 'gone');
  fc.set([card('18.9')], [], now, []); moving = false;
  const s2: number[] = [], cs2: number[] = [];
  for (let i = 0; i < 120; i++) { frame(); s2.push(tagInk(tag())); cs2.push(copyInk(layer)); }
  assertArrival(s2.slice(s2.findIndex((v) => v > 0)), 'the callout\'s words, again');
  assert.equal(Math.max(...cs2), 0, 'the words it left with are not drawn again beside the new ones');
  assert.equal(copies(layer).length, 0, 'and none of the ring or the leader either');
  assert.equal(tag().children[1]!.textContent, '18.9');
});

test('a tag shows what is on the screen: born at nothing, `painted` follows `fade`, and a change of words while it shows still crosses over, rising and never dipping', () => {
  const layer = new El('div');
  const t: Tag = makeTag(layer as unknown as Element, 'cl cl-pill');
  assert.equal(painted(t), 0, 'a new tag is not showing');
  assert.equal(((t.k as unknown) as El).style.opacity, '0', 'and its parts are born at 0');
  (t.root as unknown as El).setAttribute('data-on', '');
  words(t, { kicker: 'FHVP', value: '5.0', unit: 'mmHg', tone: 'free' });
  fade(t, 0.12);
  assert.equal(painted(t), 0.12);
  assert.equal(copies(layer).length, 0, 'the first words of a tag that is coming in need no crossing');
  // whole: a real change of the words now crosses over
  fade(t, 1);
  words(t, { kicker: 'FHVP', value: '9.5', unit: 'mmHg', tone: 'free' });
  assert.equal(copies(layer).length, 1, 'a showing tag crosses over to a new number');
  // the old copy leaves and the new number comes in: at no moment of the crossing are both dim
  const live = (t.n as unknown as El), old = copies(layer)[0]!.children[1]!;
  const sum: number[] = [];
  const t0 = now;
  for (let ms = 0; ms <= 240; ms += 16) { now = t0 + ms; sum.push(ink(live) + ink(old)); }
  for (const v of sum) assert.ok(Math.abs(v - 1) < 0.07, `the two copies' weights sum to 1 all the way (${sum.map((x) => x.toFixed(2)).join(' ')})`);
});

test('the incoming part of a crossing starts from nothing: `comeIn` is a keyframe at offset 0, never a lone end keyframe', () => {
  const k = new El('b'); k.style.opacity = '1';
  comeIn(k as unknown as Element, 240);
  assert.deepEqual(k.anims[0]!.keys, [{ opacity: 0, offset: 0 }]);
  now = 1000; k.anims[0]!.start = 1000;
  assert.equal(own(k), 0, 'it starts at 0'); now = 1120; assert.ok(Math.abs(own(k) - 0.5) < 1e-9, 'rises through the middle'); now = 1240; assert.equal(own(k), 1, 'and arrives at the part\'s own opacity');
  // (the old form, which the browser runs from the part's opacity DOWN to 0)
  const j = new El('b'); j.style.opacity = '1'; j.animate([{ opacity: 0 }], { duration: 240, fill: 'backwards' }); now = 1000; j.anims[0]!.start = 1000;
  assert.equal(own(j), 1, 'a lone keyframe starts at the part\'s opacity'); now = 1120; assert.ok(own(j) < 0.6, '...and runs down to 0: the dip this test exists to keep out');
  // restyle's own crossing writes it the right way, whichever way it is reached
  const layer = new El('div'), e = new El('div'), part = new El('b');
  part.text = 'a'; e.appendChild(part); layer.appendChild(e); part.style.opacity = '1'; e.attrs.set('class', 'x');
  restyle(e as unknown as Element, () => { part.text = 'b'; }, 1);
  assert.deepEqual(part.anims[0]!.keys, [{ opacity: 0, offset: 0 }]);
});

test('source: nothing hands a tag\'s change of words the opacity it is about to write, and no crossing writes a lone end keyframe', () => {
  const read = (f: string) => readFileSync(new URL(`../src/scene/labels/${f}`, import.meta.url), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const tag = read('tag-dom.ts'), cath = read('cath-dom.ts'), fig = read('figure-cards.ts'), roll = read('roll.ts');
  assert.match(tag, /export function words\(c: Tag, r: TagWords\): void/, '`words` takes no opacity: it asks what is painted');
  assert.match(tag, /\}, painted\(c\)\);/, 'and judges the crossing by it');
  assert.doesNotMatch(cath + fig, /\bwords\([^\n]*(alpha|\br\.a\b)/, 'no call of `words` passes an opacity');
  assert.doesNotMatch(roll, /\.animate\(\[\{ opacity: 0 \}\]/, 'restyle brings its words in with comeIn (offset 0), not a lone end keyframe');
  assert.match(roll, /export function comeIn/);
  // every restyle of the figure's cards and the stack is judged by what was painted before this frame: `a` and `r.a` are what it is about to paint
  for (const m of (cath + fig).matchAll(/restyle\([\s\S]*?\},\s*([^,;]+?)\);/g)) assert.doesNotMatch(m[1]!, /^(a|r\.a|s\.lead \* s\.alpha)$/, `restyle judged by the opacity about to be written: ${m[0].slice(-60)}`);
});
