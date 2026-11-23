// No speech bubble anywhere on the figure (Mohammad, 22 and 23 Nov: "NO speech-bubble callouts ever", "I remember telling you to get rid of this callout and replace it with something better like how the
// labels work... Every. Fucking. Where"). The bubble came back four times because there was ONE primitive that could draw one (a glass card with a pointer: `pillGlass` and `makeCard`), and each fix switched
// it off for one consumer (marks, the lobule's callout, sites) while the readings nobody had looked at (a caliper's "7.3 mm", a Circuit span, the catheter's FHVP / WHVP, the HVPG stack) kept their tails.
// The root fix deleted the primitive: every reading is a TAG (tag-dom.ts: words with the labels' halo, a thin leader and a dot where they stand away from what they name), and nothing in src/ can build a box
// with a pointer. This file pins that from four sides: the source, the stylesheets, the DOM every slide and the catheter really build, and the legibility of the words that took the cards' place.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FigureCards, caliperSpot, spanSpot, CAL_GAP, SPAN_GAP, type CardDeps, type FigCard } from '../src/scene/labels/figure-cards.ts';
import { buildCath } from '../src/scene/labels/cath-dom.ts';
import { CathShow } from '../src/scene/labels/cath-show.ts';
import { cathLook } from '../src/scene/labels/cath.ts';
import { LS } from '../src/scene/labels/type.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';
import { figurePlan } from '../src/ui/deck/figure-plan.ts';
import { figureCalls } from '../src/ui/deck/figure-calls.ts';
import { RW_LOADERS } from '../src/decks/rw/copied/index.ts';
import { AG_IDS, loadAgDeck } from '../src/decks/ag/index.ts';
import { HP_IDS, loadHpDeck } from '../src/decks/hp/index.ts';

// ── the fake page (what the DOM tests build into) ──
class Style { [k: string]: unknown; setProperty(n: string, v: string) { this[n] = v; } removeProperty(n: string) { delete this[n]; return ''; } getPropertyValue(n: string) { return String(this[n] ?? ''); } }
class El {
  style = new Style(); dataset: Record<string, string> = {}; attrs = new Map<string, string>(); kids: El[] = []; className = ''; textContent = ''; tag: string; parent: El | null = null;
  constructor(tag: string) { this.tag = tag; }
  appendChild(k: El) { this.kids.push(k); k.parent = this; return k; } append(...ks: El[]) { for (const k of ks) this.appendChild(k); }
  remove() { if (this.parent) this.parent.kids = this.parent.kids.filter((k) => k !== this); this.parent = null; }
  setAttribute(n: string, v: string) { this.attrs.set(n, v); } removeAttribute(n: string) { this.attrs.delete(n); } hasAttribute(n: string) { return this.attrs.has(n); } getAttribute(n: string) { return this.attrs.get(n) ?? null; }
  get classes(): string[] { return (this.className || this.attrs.get('class') || '').split(/\s+/).filter(Boolean); }
}
(globalThis as unknown as { document: unknown }).document = { createElement: (t: string) => new El(t), createElementNS: (_n: string, t: string) => new El(t) };
const walk = (e: El, f: (e: El) => void): void => { f(e); for (const k of e.kids) walk(k, f); };

type Slide = Parameters<typeof figurePlan>[0];
const decks = async (): Promise<{ id: string; slides?: readonly unknown[] }[]> => [
  ...(await Promise.all(Object.values(RW_LOADERS).map((l) => l()))),
  ...(await Promise.all(AG_IDS.map((id) => loadAgDeck(id)))),
  ...(await Promise.all(HP_IDS.map((id) => loadHpDeck(id)))),
];
const allSlides = async (): Promise<{ deck: string; slide: Slide }[]> => (await decks()).flatMap((d) => ((d.slides ?? []) as Slide[]).map((slide) => ({ deck: d.id, slide })));

const files = (dir: string, ok: (f: string) => boolean): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p, ok) : ok(p) ? [p] : []; });
const stripComments = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── 1. the source: nothing builds a bubble ──
// (src/engine is the vendored engine and src/ui/css2d the 2D app's own stylesheets, byte for byte: nothing in 3D creates the classes they style, which this scan of the code proves)
const code = files('src', (f) => /\.(ts|tsx|js|css)$/.test(f) && !f.includes('src/engine/') && !f.includes('src/ui/css2d/') && !f.endsWith('.generated.js'));

test('no file of src/ names or builds the speech-bubble primitive: no pillGlass, makeCard, 2D pointer or outline copy, glass-and-rim classes or clip-path outlines', () => {
  const banned: [RegExp, string][] = [
    [/pillGlass/, 'pillGlass'], [/makeCard/, 'makeCard'], [/callout-ptr/, 'callout-ptr'], [/callout-outline/, 'callout-outline'], [/\bPTR\b/, 'PTR'],
    [/cl-glass/, 'cl-glass'], [/cl-ring/, 'cl-ring'], [/cl-hair/, 'cl-hair'], [/clip-path:\s*path\(/, 'clip-path: path('], [/clipPath\s*=\s*`?path\(/, 'clipPath = path('],
  ];
  const hits: string[] = [];
  for (const f of code) { const t = stripComments(readFileSync(f, 'utf8')); for (const [re, name] of banned) if (re.test(t)) hits.push(`${f}: ${name}`); }
  assert.deepEqual(hits, []);
  assert.ok(code.length > 200, 'the scan saw the source');
});

test('the 2D pointer and outline are not copied and the script that copied them no longer does', () => {
  const dir = readdirSync('src/scene/labels/cath2d');
  assert.deepEqual(dir.filter((f) => /callout/.test(f)), []);
  const script = readFileSync('scripts/copy-label-names.mjs', 'utf8');
  assert.doesNotMatch(script.replace(/^\s*\/\/.*$/gm, ''), /callout-ptr|callout-outline|OUTLINE_FILE/);
});

test('the label solver has no callout mode and no tail: nothing can ask it for a pointer', () => {
  const t = stripComments(readFileSync('src/scene/labels/solver.ts', 'utf8')) + stripComments(readFileSync('src/scene/labels/fade.ts', 'utf8'));
  assert.doesNotMatch(t, /calloutCands|\bcallout\??:|\btail\b/);
});

test('a card kind that points somewhere with a card is gone: no `site` card, and a deck site that is no station, split or resistor fails the plan', () => {
  const fc = stripComments(readFileSync('src/scene/labels/figure-cards.ts', 'utf8'));
  assert.match(fc, /export type CardKind = 'mark' \| 'step' \| 'split';/);
  const plan = stripComments(readFileSync('src/ui/deck/figure-plan.ts', 'utf8'));
  assert.match(plan, /bad\('site off station', k\)/);
});

// ── 2. the stylesheets: no rule draws a triangle on a label, a tag, a callout or a tooltip ──
test('no rule that targets a label, a tag, a callout, a reading or a tooltip draws a triangle (a zero-size border tip or a polygon clip), on itself or its ::before and ::after', () => {
  const css = files('src', (f) => f.endsWith('.css'));
  const target = /(^|[\s,>+~(])(\.lb|\.tg|\.cl|\.cath-label|\.pl|\.lz-co|\.tooltip)(?![\w-])/;
  const bad: string[] = [];
  for (const f of css) {
    const t = stripComments(readFileSync(f, 'utf8'));
    for (const m of t.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      const sel = m[1]!.trim(), body = m[2]!;
      if (!sel.split(',').some((s) => target.test(' ' + s.trim()))) continue;
      const tip = /border(-[a-z]+)*\s*:[^;]*transparent/.test(body) && /(width|height)\s*:\s*0\b/.test(body);
      if (tip || /polygon\(/.test(body) || /clip-path\s*:\s*path\(/.test(body)) bad.push(`${f}: ${sel.slice(0, 80)}`);
    }
  }
  assert.deepEqual(bad, []);
});

// ── 3. the DOM: build every reading of every slide and of the catheter, and look at what was made ──
const deps = (view = { x0: 0, y0: 56, x1: 1280, y1: 800 }): CardDeps => ({
  project: (_p, out) => { out.x = 640; out.y = 400; return out; }, cameraMoving: () => false, view: () => view, blockers: () => [],
  vp: () => ({ w: 1280, h: 800, safe: { top: 0, right: 0, bottom: 0, left: 0 } }) as never, measure: (s: string, size: number) => s.length * size * 0.56, now: () => t, spleenScale: () => 1,
  lobule: () => null, lobuleRing: () => null, circuit: () => null,
});
let t = 0;

/** The one thing a tag's markup may hold besides words: its leader's line and dot, and a step's plain round face. */
function judgeTree(root: El, where: string): void {
  walk(root, (e) => {
    assert.ok(!('clipPath' in e.style), `${where}: ${e.className} has a clip-path`);
    assert.ok(!e.classes.some((c) => /^cl-(glass|ring|hair)$/.test(c)), `${where}: ${e.className} is glass or a rim`);
    if (e.tag === 'path' || e.tag === 'svg') {
      let inOk = false; for (let p: El | null = e.parent; p; p = p.parent) if (p.classes.includes('cl-brace') || p.classes.includes('cl-leads')) inOk = true;
      assert.ok(e.classes.includes('cl-brace') || e.classes.includes('cl-leads') || inOk, `${where}: a ${e.tag} outside the bracket and the stack's leaders`);
    }
  });
}

test('every card, caliper and bracket of every slide of every deck is built as words: a tag with no glass, no rim, no clip and no path, a step is its numeral alone', async () => {
  let tags = 0, calipers = 0, spans = 0, steps = 0, ticks = 0;
  for (const { deck, slide } of await allSlides()) {
    const calls = figureCalls(figurePlan(slide));
    if (!calls.cards.length && !calls.calipers.length && !calls.spans.length) continue;
    const parent = new El('div'), fc = new FigureCards(parent as unknown as HTMLElement, deps());
    fc.set(calls.cards as FigCard[], calls.calipers, 0, calls.spans);
    for (let i = 0; i < 160; i++) { t += 16; fc.tick(); ticks++; }
    judgeTree(parent, `${deck}/${slide.id}`);
    walk(parent, (e) => {
      if (e.classes.includes('cl')) { tags++; assert.ok(e.classes.includes('tg'), `${deck}/${slide.id}: ${e.className} is a reading without the tag class`); if (e.classes.includes('cl-step')) { steps++; assert.ok(!e.kids.some((k) => k.className === 'cl-disc'), 'a step is its numeral alone: no disc'); } }
    });
    calipers += calls.calipers.length; spans += calls.spans.length;
    fc.destroy();
  }
  assert.ok(tags > 40 && calipers >= 8 && spans >= 4 && steps >= 5, `the decks give tags, calipers, brackets and steps to judge (${tags}, ${calipers}, ${spans}, ${steps}, ${ticks} frames)`);
});

test('the catheter\'s readings (FHVP, WHVP, the HVPG stack) are tags with a leader and a dot: no glass, no clip, no path outside the bracket and the stack\'s leaders', () => {
  const parent = new El('div'), dom = buildCath(parent as unknown as HTMLElement);
  const text = { f: '5.0', w: '16.5', h: '11.5', hv: 11.5 }, measure = (s: string, size: number) => s.length * size * 0.56;
  const base = { vp: { w: 1280, h: 800 }, measure, band: { x0: 0, y0: 56, x1: 1280, y1: 800 }, blockers: [], tip: [600, 400] as [number, number], ahead: [650, 330] as [number, number], got: 2 as const, text };
  for (const cath of ['free', 'wedge', 'result'] as const) {
    const show = new CathShow();
    show.solve({ ...base, cath });
    for (let i = 0; i < 180; i++) show.step(16, false);
    dom.paint(show.frame);
    judgeTree(parent, `cath ${cath}`);
  }
  const tagsMade: El[] = []; walk(parent, (e) => { if (e.classes.includes('cl')) tagsMade.push(e); });
  assert.equal(tagsMade.length, 5, 'FHVP, WHVP, two stack rows and the HVPG');
  for (const e of tagsMade) assert.ok(e.classes.includes('tg'), `${e.className} is a reading`);
  assert.equal(parent.kids.filter((k) => k.classes.includes('cl-lead')).length, 2, 'a leader for each reading that stands alone');
});

test('a caliper\'s reading stands in line with it, 6 px past its far tick, with no leader; a bracket\'s 4 px under the middle of its line', () => {
  const view = { x0: 0, y0: 0, x1: 1000, y1: 800 };
  const e: [number, number, number, number] = [400, 300, 400, 340];   // a caliper across a vertical vessel's width... turned: its line runs down
  const s = caliperSpot('cal:v', e, 50, 18, view, [], [])!;
  assert.ok(s.ok && s.direct);
  // the box starts CAL_GAP past the tick along the caliper's line (the tick at y 340 or the one at y 300, whichever end has room, the one reading away to the right first)
  const gapAt = (b: { x0: number; y0: number; x1: number; y1: number }) => Math.min(Math.abs(b.y0 - 340), Math.abs(b.y1 - 300));
  assert.equal(CAL_GAP, 6); assert.ok(Math.abs(gapAt(s.box) - CAL_GAP) < 1e-6 || Math.abs(s.box.y0 - 340 - CAL_GAP) < 1e-6 || Math.abs(300 - CAL_GAP - s.box.y1) < 1e-6, `6 px from a tick (${JSON.stringify(s.box)})`);
  const flat: [number, number, number, number] = [380, 300, 420, 300];
  const f = caliperSpot('cal:h', flat, 50, 18, view, [], [])!;
  assert.ok(Math.abs(f.box.x0 - (420 + CAL_GAP)) < 1e-6 || Math.abs(f.box.x1 - (380 - CAL_GAP)) < 1e-6, 'a level caliper: the words past a tick, level with it');
  assert.ok(Math.abs((f.box.y0 + f.box.y1) / 2 - 300) < 1e-6, 'in line');
  // taken: no direct place (the fallback is placeCards with a leader, tested through the DOM below)
  assert.equal(caliperSpot('cal:h', flat, 50, 18, view, [{ x0: 300, y0: 250, x1: 520, y1: 350 }], []), null);
  const sp = spanSpot('span:a', [300, 500, 500, 500], 60, 18, view, [], [])!;
  assert.equal(SPAN_GAP, 4); assert.ok(sp.direct && sp.ok && Math.abs(sp.box.y0 - 504) < 1e-6 && Math.abs((sp.box.x0 + sp.box.x1) / 2 - 400) < 1e-6, 'centred 4 px under the middle');
  assert.equal(spanSpot('span:a', [300, 500, 500, 500], 60, 18, view, [{ x0: 350, y0: 495, x1: 450, y1: 530 }], []), null);
});

test('a caliper whose in-line places are taken stands where there is room, with a thin leader that stops 1 px short of the nearer tick and no dot', () => {
  const parent = new El('div'), fc = new FigureCards(parent as unknown as HTMLElement, { ...deps(), blockers: () => [{ x0: 560, y0: 330, x1: 720, y1: 470 }] });
  fc.set([], [{ id: 'varix', line: { ends: [[0.4, 0.4], [0.6, 0.4]] }, text: '7.3 mm' }], 0, []);
  for (let i = 0; i < 160; i++) { t += 16; fc.tick(); }
  judgeTree(parent, 'caliper');
  const lead = parent.kids.find((k) => k.classes.includes('cl-lead-one'));
  assert.ok(lead, 'the leader exists');
  assert.equal(lead!.kids.length, 2, 'a line and a dot element');
  assert.ok(!('clipPath' in lead!.style));
});

// ── 4. legibility: words with a halo carry the readings now, so they must read ──
function rgb(c: string): [number, number, number, number] {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (hex) { const h = hex[1]!.length === 3 ? hex[1]!.replace(/./g, (x) => x + x) : hex[1]!; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1]; }
  const m = /^rgba?\(([^)]+)\)$/.exec(c.trim()); if (!m) throw new Error(`colour ${c}`);
  const p = m[1]!.split(',').map((x) => parseFloat(x)); return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
}
const lum = (c: readonly number[]): number => { const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!); };
const ratio = (a: readonly number[], b: readonly number[]): number => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const over = (top: [number, number, number, number], under: readonly number[]): [number, number, number, number] => [0, 1, 2].map((i) => top[i]! * top[3] + under[i]! * (1 - top[3])).concat(1) as [number, number, number, number];
/** `var(--x)` and `color-mix(in srgb, A n%, B)` as cathLook writes them, resolved against the look's own tokens. */
function resolve(v: string, k: Record<string, string>): [number, number, number, number] {
  const mix = /^color-mix\(in srgb, (.+) (\d+)%, (.+)\)$/.exec(v);
  if (mix) { const a = resolve(mix[1]!, k), b = resolve(mix[3]!, k), n = parseInt(mix[2]!, 10) / 100; return [0, 1, 2].map((i) => a[i]! * n + b[i]! * (1 - n)).concat(1) as [number, number, number, number]; }
  const ref = /^var\((--[\w-]+)\)$/.exec(v); if (ref) return resolve(k[ref[1]!]!, k);
  return rgb(v);
}

test('every look: every tag ink reads against its halo over the worst the figure can put under it (black or white), at least 4.5:1 (WCAG AA)', () => {
  const worst: string[] = [];
  for (const look of LOOK_IDS) {
    const k = cathLook(look), halo = rgb((LS.LOOKS as Record<string, Record<string, string>>)[look]!['label-halo']!);
    const inks = ['--cl-hv-ink', '--cl-wedge-ink', '--cl-pv-ink', '--cl-ivc-ink', '--cl-ok-ink', '--cl-caution-ink', '--cl-danger-ink', '--cl-text', '--cl-text3'];
    for (const under of [[0, 0, 0], [255, 255, 255]]) for (const n of inks) {
      const r = ratio(resolve(n === '--cl-text' || n === '--cl-text3' ? k[n]! : k[n]!, k), over(halo, under));
      if (r < 4.5) worst.push(`${look} ${n} over ${under[0] ? 'white' : 'black'}: ${r.toFixed(2)}`);
    }
  }
  assert.deepEqual(worst, []);
});
