// A standing label changes colour, weight, words or number by crossfade, never in one frame (visual polish review B, 22 Nov 2026: "everything eases, nothing pops").
// Root cause: LabelLayer, the catheter cards, the figure's cards and the captions wrote a state straight onto the element (tone, tint, gate, a card's number and unit, a caption's name and key),
// and a leader was switched off by `visibility`; only a number rolled. LabelFader (fade.ts) already crossed over a label whose KEY changes (form, words, unit, badge, alert, reversal mark: controller.ts
// `key: ${p.form}|${m.vkey}|${rev}`); tone, tint and gate were not in that key, so they now are (Want.look, refreshed every frame): a gliding label and a recoloured one share the one crossing, with no copy left
// behind. Everything the fader does not cross (a card, a caption, a station's ring, a callout) goes through `restyle` (roll.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { restyle, RESTYLE_SHOWING } from '../src/scene/labels/roll.ts';
import { D_SMALL } from '../src/ui/motion.ts';
import { LabelFader, lookKey, type Want } from '../src/scene/labels/fade.ts';
import type { Placement } from '../src/scene/labels/solver.ts';

type Keys = { opacity?: number; offset?: number }[];
type Opts = { duration: number; easing: string };
class Anim {
  onfinish: (() => void) | null = null; oncancel: (() => void) | null = null; keys: Keys; opts: Opts;
  constructor(keys: Keys, opts: Opts) { this.keys = keys; this.opts = opts; }
}
class El {
  attrs: Record<string, string> = {}; style: Record<string, string> = {}; children: El[] = []; parentElement: El | null = null; anims: Anim[] = []; text = '';
  tag: string;
  constructor(tag = 'div') { this.tag = tag; }
  get textContent(): string { return this.children.length ? this.children.map((c) => c.textContent).join('') : this.text; }
  set textContent(v: string) { this.text = v; }
  getAttribute(k: string): string | null { return this.attrs[k] ?? null; }
  setAttribute(k: string, v: string): void { this.attrs[k] = v; }
  appendChild(e: El): void { this.children.push(e); e.parentElement = this; }
  insertBefore(e: El, ref: El): void { const i = this.children.indexOf(ref); this.children.splice(i, 0, e); e.parentElement = this; }
  cloneNode(deep: boolean): El { const c = new El(this.tag); c.attrs = { ...this.attrs }; c.style = { ...this.style }; c.text = this.text; if (deep) for (const k of this.children) c.appendChild(k.cloneNode(true)); return c; }
  remove(): void { if (this.parentElement) { this.parentElement.children = this.parentElement.children.filter((c) => c !== this); this.parentElement = null; } }
  animate(keys: Keys, opts: Opts): Anim { const a = new Anim(keys, opts); this.anims.push(a); return a; }
}
const timers: (() => void)[] = [];
const realSet = globalThis.setTimeout;
(globalThis as unknown as { setTimeout: unknown }).setTimeout = (fn: () => void) => { timers.push(fn); return 0; };
test.after(() => { (globalThis as unknown as { setTimeout: unknown }).setTimeout = realSet; });

/** A label: a name and a number, in a layer, drawn at `opacity`. */
function label(opacity = '1') {
  const layer = new El(), el = new El(), name = new El('span'), val = new El('span');
  name.text = 'Portal vein'; val.text = '12.0';
  el.appendChild(name); el.appendChild(val); layer.appendChild(el);
  el.attrs.class = 'lb'; el.style.opacity = opacity;
  return { layer, el, name, val };
}
const asEl = (e: El) => e as unknown as Element;

test('a showing label crosses over: two copies for D_SMALL whose weights sum to 1, then one', () => {
  const { layer, el, name } = label();
  restyle(asEl(el), () => { el.attrs['data-tone'] = ''; name.text = 'PV'; }, 1);
  assert.equal(layer.children.length, 2, 'the old look and the new stand together');
  const old = layer.children.find((c) => c !== el)!;
  assert.match(old.attrs.class!, /lb-was/, 'the old copy is marked');
  assert.equal(old.attrs['data-tone'], undefined, 'and keeps the old look (it was copied before the change)');
  assert.equal(old.children[0]!.text, 'Portal vein', 'and the old words');
  assert.equal(el.attrs['data-tone'], '', 'the live label has the new look at once, under the old one');
  // the old copy's parts fade 1 to 0 and the live part whose words changed comes in 0 to 1 (its own opacity at the end), linear, over D_SMALL
  const out = old.children[0]!.anims[0]!, inn = name.anims[0]!;
  assert.deepEqual(out.keys, [{ opacity: 1 }, { opacity: 0 }]);
  assert.deepEqual(inn.keys, [{ opacity: 0, offset: 0 }], 'a lone keyframe is the START (offset 0), never the end: the words come in from 0 to their own opacity');
  for (const a of [out, inn]) { assert.equal(a.opts.duration, D_SMALL); assert.equal(a.opts.easing, 'linear', 'linear: the weights sum to 1 all the way'); }
  assert.equal(el.children[1]!.anims.length, 0, 'a part whose words did not change does not fade: it never dips');
  // when the old copy's animation ends, one is left
  old.children[0]!.anims[0]!.onfinish!();
  assert.equal(layer.children.length, 1);
  assert.equal(layer.children[0], el);
});

test('a colour change alone leaves the words still: only the old colour fades off the new one', () => {
  const { layer, el, name, val } = label();
  restyle(asEl(el), () => { el.attrs['data-tone'] = ''; }, 1);
  assert.equal(name.anims.length + val.anims.length, 0, 'no live part fades in');
  const old = layer.children.find((c) => c !== el)!;
  assert.equal(old.children.reduce((n, c) => n + c.anims.length, 0), 2, 'every part of the old copy fades out');
});

test('the old copy is drawn at the label\'s own opacity, so a faint label crosses over faintly', () => {
  const { layer, el } = label('0.4');
  el.children[0]!.style.opacity = '0.4';
  restyle(asEl(el), () => { el.attrs['data-tone'] = ''; }, 0.4);
  const old = layer.children.find((c) => c !== el)!;
  assert.equal(old.style.opacity, '0.4');
  assert.deepEqual(old.children[0]!.anims[0]!.keys, [{ opacity: 0.4 }, { opacity: 0 }]);
});

test('a hidden label takes the change at once: no copy, no animation', () => {
  for (const alpha of [0, 0.01, RESTYLE_SHOWING]) {
    const { layer, el, name } = label('0');
    let ran = 0;
    restyle(asEl(el), () => { ran++; el.attrs['data-tone'] = ''; name.text = 'PV'; }, alpha);
    assert.equal(ran, 1);
    assert.equal(layer.children.length, 1, `no copy at alpha ${alpha}`);
    assert.equal(name.anims.length, 0);
    assert.equal(el.attrs['data-tone'], '');
  }
});

test('an element with no parts (a leader, a ring) fades itself out; one that leaves nothing behind when its animation never reports is cleared by its own timer', () => {
  const layer = new El(), lead = new El('i');
  lead.style.opacity = '0.8'; layer.appendChild(lead);
  timers.length = 0;
  restyle(asEl(lead), () => { lead.attrs['data-tone'] = ''; }, 0.8);
  const old = layer.children.find((c) => c !== lead)!;
  assert.deepEqual(old.anims[0]!.keys, [{ opacity: 0.8 }, { opacity: 0 }]);
  timers.forEach((t) => t());
  assert.equal(layer.children.length, 1, 'a copy never outlives its crossing by more than a moment');
});

test('a browser without the Web Animations API takes the change at once', () => {
  const { layer, el } = label();
  (el as unknown as { animate: unknown }).animate = undefined;
  restyle(asEl(el), () => { el.attrs['data-tone'] = ''; }, 1);
  assert.equal(layer.children.length, 1);
  assert.equal(el.attrs['data-tone'], '');
});

// ── the grep: these files never write a state straight onto an element ──
const FILES = [
  'src/scene/labels/LabelLayer.tsx', 'src/scene/labels/cath-dom.ts', 'src/scene/labels/figure-cards.ts', 'src/scene/labels/fade.ts', 'src/scene/labels/type.ts',
  'src/scene/circuit/CircuitCaptions.tsx', 'src/scene/lobule/LobuleCaptions.tsx',
];
/** The source with every `restyle(...)` call (its callback included) cut out: what is left is what is written outside it. */
function outsideRestyle(src: string): string {
  let out = '', i = 0;
  for (;;) {
    const at = src.indexOf('restyle(', i);
    if (at < 0) return out + src.slice(i);
    out += src.slice(i, at);
    let depth = 0, j = at + 'restyle'.length;
    for (; j < src.length; j++) { const ch = src[j]; if (ch === '(') depth++; else if (ch === ')') { depth--; if (!depth) break; } }
    i = j + 1;
  }
}
const FORBIDDEN: [RegExp, string][] = [
  [/\.style\.display\s*=[^=]/, 'style.display'], [/\.style\.visibility\s*=[^=]/, 'style.visibility'],
  [/\.dataset\.tone\s*=[^=]/, 'dataset.tone'], [/setAttribute\(\s*['"]data-tone['"]/, "setAttribute('data-tone')"],
];

test('no label, card or caption writes style.display, style.visibility or a tone outside restyle', () => {
  for (const f of FILES) {
    const src = outsideRestyle(readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n'));
    for (const [re, what] of FORBIDDEN) assert.doesNotMatch(src, re, `${f} writes ${what} outside restyle: it must cross over, not step`);
  }
  // (the test itself bites: the same writes in a restyle callback pass, outside it they are found)
  assert.match(outsideRestyle("a.style.display = 'none'; restyle(el, () => { el.dataset.tone = 'x'; }, 1);"), /style\.display/);
  assert.doesNotMatch(outsideRestyle("restyle(el, () => { el.dataset.tone = 'x'; }, 1);"), /dataset\.tone/);
});

test('the stylesheet gives an empty part no room, and a leader no visibility switch, so nothing needs those writes', () => {
  const css = readFileSync('src/scene/labels/labels.css', 'utf8');
  assert.match(css, /\.lb \.lb-name:empty[^{]*\{ display: none; \}/);
  assert.match(css, /\.cl \.cl-n:empty/); assert.match(css, /\.cl \.cl-u:empty/);
  assert.match(css, /\.lb\.cc \.cc-key:empty/);
  for (const sel of ['\\.lz-co-line', '\\.cl-lead-line', '\\.cl-lead-dot']) {
    const rule = new RegExp(`^${sel} \\{[^}]*\\}`, 'm').exec(css)![0];
    assert.doesNotMatch(rule, /visibility/, `${sel} is scaled to nothing, never hidden`);
  }
  assert.match(css, /\.lb-was \{ pointer-events: none; \}/);
});

test('the callout leader and the step leaders are eased to zero length by their scale (source)', () => {
  const fc = readFileSync('src/scene/labels/figure-cards.ts', 'utf8');
  assert.match(fc, /co\.k = this\.ease\(co\.k, !!seg\)/);
  assert.match(fc, /scaleX\(\$\{round\(co\.len \* co\.k\)\}\)/);
  assert.match(fc, /scaleX\(\$\{round\(lead\.len\[i\]! \* kl\)\}\)/);
  assert.match(fc, /return busy \|\| hold \|\| this\.dirty \|\| this\.easing/, 'frames keep coming while a leader eases');
  // every file in the labels folder that restyles imports it from roll.ts (one helper)
  for (const f of readdirSync('src/scene/labels')) if (/\.(ts|tsx)$/.test(f)) {
    const src = readFileSync(`src/scene/labels/${f}`, 'utf8');
    if (/\brestyle\(/.test(src) && f !== 'roll.ts') assert.match(src, /import \{[^}]*\brestyle\b[^}]*\} from '\.\/roll\.ts'/, `${f} uses the one restyle`);
  }
});

// ── the fader's key holds the look ──
const P: Placement = { id: 'a', form: 0, dx: 10, dy: 0, w: 100, h: 26, leader: false, au: 0.5 };
const wantLook = (look: string, snap: unknown): ReadonlyMap<string, Want> => new Map([['a', { p: P, dim: false, key: '0|12.0', look, snap }]]);

test('a label that changes colour, tint or gate in place crosses over like new words: the old picture is held, the new one comes in', () => {
  const f = new LabelFader();
  for (let t = 0; t < 400; t += 16) f.step(16, wantLook('|', { tone: null }), false);
  assert.equal(f.frame.get('a')!.from, null, 'settled');
  f.step(16, wantLook('red|', { tone: 'red' }), false);
  const s = f.frame.get('a')!;
  assert.ok(s.from, 'the old picture is held for the crossing');
  assert.deepEqual(s.from!.snap, { tone: null }, 'and it keeps the old look');
  assert.deepEqual(s.snap, { tone: 'red' }, 'the new one wears the new');
  assert.equal(s.alpha, 1, 'the label itself never leaves');
  assert.ok(s.mix < 0.1, 'the new picture starts at nothing and takes over');
  for (let t = 0; t < 400; t += 16) f.step(16, wantLook('red|', { tone: 'red' }), false);
  assert.equal(f.frame.get('a')!.from, null);
  assert.equal(f.frame.get('a')!.mix, 1);
  // tint and gate are in the look the same way
  f.step(16, wantLook('red|#0f0|1', { tone: 'red', tint: '#0f0' }), false);
  assert.ok(f.frame.get('a')!.from, 'a tint or a gate crosses over too');
  // an unchanged look is no crossing (a flicker of nothing)
  const g = new LabelFader();
  for (let t = 0; t < 400; t += 16) g.step(16, wantLook('red|', {}), false);
  g.step(16, wantLook('red|', {}), false);
  assert.equal(g.frame.get('a')!.from, null);
});

test('the controller puts tone, tint and gate in the snapshot every frame, and the picture it leaves keeps its own (source)', () => {
  const c = readFileSync('src/scene/labels/controller.ts', 'utf8');
  assert.match(c, /this\.refreshLooks\(next\);\n\s*const busy = anyMoving\(this\.fader\.step/, 'refreshed before every fader step');
  assert.match(c, /w\.snap = \{ \.\.\.was, \.\.\.now \}/, 'a changed look is a new snapshot, never a mutation of the one the old picture holds');
  assert.match(c, /tone: snap \? snap\.tone/, 'a picture is drawn in the look it was snapped with');
  assert.match(c, /tone: fs \? fs\.tone/, 'and the ghost in the old one');
  assert.match(c, /tint: !snap \|\| snap\.tinted \? m\.ex\.tint \?\? '' : ''/, 'the tint COLOUR is always live; the snapshot holds only whether there is one');
  assert.match(c, /gate: snap \? snap\.gate : /);
});

test('the look key is discrete by construction: a tint that follows a reading smoothly never starts a crossing; only gaining or losing one does', () => {
  const f = new LabelFader();
  const colour = (i: number) => `color-mix(in srgb, #${(0x30 + (i % 200)).toString(16).padStart(2, '0')}80c0 var(--vel-ink, 55%), var(--lb-val))`;
  for (let t = 0; t < 400; t += 16) f.step(16, wantLook(lookKey(null, true, false), { tinted: true }), false);
  assert.equal(f.frame.get('a')!.from, null, 'settled');
  const keys = new Set<string>();
  for (let i = 0; i < 300; i++) {
    keys.add(lookKey(null, !!colour(i), false));   // (a different colour every frame: the key sees none of it)
    f.step(16, wantLook(lookKey(null, !!colour(i), false), { tinted: true }), false);
    assert.equal(f.frame.get('a')!.from, null, `frame ${i}: a smoothly changing tint is no crossing`);
  }
  assert.equal(keys.size, 1, 'one key for every colour');
  // gaining or losing a tint is a state, and crosses once
  f.step(16, wantLook(lookKey(null, false, false), { tinted: false }), false);
  assert.ok(f.frame.get('a')!.from, 'a point that loses its tint crosses over');
  const c = readFileSync('src/scene/labels/controller.ts', 'utf8');
  assert.doesNotMatch(c, /interface Snap \{[^}]*\btint: string/, 'the snapshot never holds the colour');
});
