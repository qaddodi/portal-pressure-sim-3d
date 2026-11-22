// Production review, bug 1: L never turned the laser on in a talk (the key was decided, then dropped where it is carried out). The laser is the 2D spotlight (ink-gl.js) and
// behaves as 2D's: L toggles it, it stays on from slide to slide, the black screen and the talk's end put it away, Esc is the talk's (not the laser's), a held finger on the
// figure (never on a card or a button) shows it. And no other key of 2D's presenter is decided and then dropped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clickerKey, type ClickCtx, type ClickEv } from '../src/ui/deck/clicker.ts';
import { platesAt, halfOf, radius, onFigure, HOLD_MS, HOLD_SLOP, VEIL, EAT_MS } from '../src/ui/deck/laser.ts';

const ctx: ClickCtx = { digits: '', jumpOpen: false, wallet: false, controlOwnsEnter: false, controlOwnsArrows: false, inField: false, stops: 12 };
const key = (k: string, c: Partial<ClickCtx> = {}, e: Partial<ClickEv> = {}) => clickerKey({ key: k, ...e }, { ...ctx, ...c });
const src = (f: string) => readFileSync(f, 'utf8');

test('L is the laser: once per press, never from a field, never with Ctrl, Cmd or Alt, and by the key\'s place on a board with no Latin L', () => {
  assert.deepEqual(key('l'), { type: 'laser' }); assert.deepEqual(key('L'), { type: 'laser' });
  assert.equal(key('l', {}, { repeat: true })?.type, 'swallow', 'a held L is one press');
  assert.equal(key('l', { inField: true }), null, 'typing an l in a field is typing');
  for (const m of ['ctrlKey', 'metaKey', 'altKey', 'isComposing'] as const) assert.equal(key('l', {}, { [m]: true }), null, m);
  assert.equal(key('l', { jumpOpen: true }), null, 'the open slide list keeps its keys');
  assert.deepEqual(key('م', {}, { code: 'KeyL' }), { type: 'laser' }, 'an Arabic layout: the key in L\'s place');
  assert.deepEqual(key('л', {}, { code: 'KeyK' }), null, 'a letter in another key\'s place is not L');
  assert.deepEqual(key('ش', {}, { code: 'KeyB' }), { type: 'black' }); assert.deepEqual(key('ل', {}, { code: 'KeyG' }), { type: 'jump' });
});

test('every key 2D\'s presenter takes (presenter.js onKey) is decided the same way here', () => {
  // [key, what 2D does]: transcribed from onKey at the pin
  const TWO_D: [string, string][] = [
    ['ArrowRight', 'move:next'], ['PageDown', 'move:next'], [' ', 'move:next'], ['Enter', 'move:next'], ['ArrowLeft', 'move:back'], ['PageUp', 'move:back'], ['Backspace', 'move:back'],
    ['Home', 'move:first'], ['End', 'move:last'], ['b', 'black'], ['.', 'black'], ['w', 'black'], ['f', 'full'], ['g', 'jump'], ['l', 'laser'], ['p', 'presenter'],
    ['n', 'swallow'], ['s', 'swallow'], ['F5', 'swallow'], ['Escape', 'escape'], ['7', 'digit'],
  ];
  for (const [k, want] of TWO_D) { const a = key(k)!; assert.equal(a.type === 'move' ? `move:${a.to}` : a.type, want, k); }
  for (const k of ['d', 'e', 'x', 'Tab', 'ArrowUp', 'ArrowDown', '?', '/']) assert.equal(key(k), null, `2D leaves ${k} alone (the pen has no key in 2D)`);
  // a number that names no slide is dropped with the Enter, so the next Enter moves on (2D: digits = '' before the test)
  assert.deepEqual(key('Enter', { digits: '0' }), { type: 'swallow', clear: true });
  assert.deepEqual(key('Enter', { digits: '12' }), { type: 'go', stop: 11 });
});

test('no decided key is dropped where it is carried out: every act but "swallow" does something, and L toggles the laser', () => {
  const t = src('src/ui/deck/useDeckInput.ts');
  const types = [...src('src/ui/deck/clicker.ts').matchAll(/\{ type: '(\w+)'/g)].map((m) => m[1]!).filter((v, i, a) => a.indexOf(v) === i && /^[a-z]+$/.test(v));
  const acts = new Set(types.filter((x) => ['digit', 'go', 'move', 'swap', 'black', 'full', 'jump', 'laser', 'presenter', 'escape', 'swallow'].includes(x)));
  assert.equal(acts.size, 11, 'the act types the clicker can return');
  for (const a of acts) {
    const m = t.match(new RegExp(`case '${a}':\\s*([^\\n]*)`));
    assert.ok(m, `carryOut has no case for ${a}`);
    if (a !== 'swallow') assert.ok(!/^(case |break;)/.test(m[1]!.trim()), `${a} is decided, then dropped: ${m[1]}`);
  }
  assert.match(t, /case 'laser': laser\.toggle\(\)/);
  // 2D: Esc puts the black screen away, else ends the talk; the laser has no Esc of its own and is not put away by a new slide
  assert.match(t, /case 'escape': if \(ui\.black\) ui\.setBlack\(false\); else if \(cardZoom\.on\) void cardZoom\.close\(\); else stopTalk\(\)/);   // (2D: a zoomed card first glides back)
  assert.ok(!/st\.pos !== prev\.pos\) laser\.set\(false\)/.test(t), 'the laser stays on from slide to slide, as in 2D (only the pen\'s strokes are a slide\'s)');
  assert.match(t, /active: \(\) => .*!u\.black/, 'not under the black screen (2D active())');
});

test('the spotlight is 2D\'s: 500 ms hold within 10 px, 62% veil, the window R = min(W, H) x 0.09 in 50 to 100 px, whole from 1.55 R', () => {
  assert.deepEqual([HOLD_MS, HOLD_SLOP, VEIL, EAT_MS], [500, 10, 0.62, 600]);
  assert.equal(radius(390, 844), 50); assert.equal(radius(1440, 900), 81); assert.equal(radius(3000, 2000), 100);
  assert.equal(halfOf(100), 155); assert.equal(halfOf(81), 126);
  const css = src('src/ui/deck/laser.css');
  assert.match(css, /--stage-bg/); assert.match(css, /62%/); assert.match(css, /var\(--d-flip\) linear/, '2D fades it over D_FLIP, linearly');
  assert.match(css, /calc\(var\(--r\) \* \.8\)/); assert.match(css, /calc\(var\(--r\) \* \.75\)/, '0.8 R + 0.75 R = 1.55 R');
});

test('the five plates cover the screen exactly once round the window, wherever the pointer is, on whole pixels', () => {
  const parse = (t: string) => { const m = t.match(/^translate\((-?\d+)px, (-?\d+)px\)(?: scale\((\d+), (\d+)\))?$/); assert.ok(m, t); return m!.slice(1).map((v) => (v == null ? NaN : Number(v))); };
  for (const [w, h] of [[1440, 900], [390, 844], [1366, 1024]] as const) {
    const R = radius(w, h), k = halfOf(R);
    for (const [x, y] of [[w / 2, h / 2], [0, 0], [w, h], [3.4, h - 2.6], [w - 10, 40], [-500, -500], [k, k]] as const) {
      const p = platesAt(x, y, w, h, R);
      const [hx, hy] = parse(p.hole);
      assert.equal(hx, Math.round(x) - k); assert.equal(hy, Math.round(y) - k);
      const rects = [p.top, p.bottom, p.left, p.right].map(parse).map(([l, t, sw, sh]) => ({ l: l!, t: t!, r: l! + sw!, b: t! + sh! }));
      const hole = { l: Math.max(0, Math.min(w, hx!)), t: Math.max(0, Math.min(h, hy!)), r: Math.max(0, Math.min(w, hx! + 2 * k)), b: Math.max(0, Math.min(h, hy! + 2 * k)) };
      const area = (r: { l: number; t: number; r: number; b: number }) => Math.max(0, r.r - r.l) * Math.max(0, r.b - r.t);
      assert.equal(rects.reduce((a, r) => a + area(r), 0) + area(hole), w * h, `the plates and the window tile ${w}x${h} at ${x},${y}`);
      for (const r of rects) assert.ok(r.l >= 0 && r.t >= 0 && r.r <= w && r.b <= h && r.r >= r.l && r.b >= r.t);
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) { const a = rects[i]!, b = rects[j]!; assert.ok(area({ l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) }) === 0, 'no two plates overlap (a doubled veil would show as a seam)'); }
    }
  }
  const laser = src('src/ui/deck/laser.ts');
  const place = laser.slice(laser.indexOf('const place ='), laser.indexOf('const set ='));
  assert.ok(/style\.transform/.test(place) && !/style\.(width|height|left|top|setProperty)/.test(place), 'a move writes transform only');
  assert.ok(!/requestAnimationFrame/.test(laser));
});

test('a held finger is the laser only on the figure: a card, the pill, a button or a list keeps its press and its click', () => {
  const el = (chain: string[]) => ({ closest: (sel: string) => (sel.split(',').map((s) => s.trim()).some((s) => chain.includes(s)) ? {} : null) });
  assert.equal(onFigure(el(['canvas'])), true);
  assert.equal(onFigure(el(['#stageView', '#stageWrap'])), true);
  assert.equal(onFigure(el(['canvas', '.deck-ui'])), false, 'a chart drawn in a card');
  assert.equal(onFigure(el(['button', '.deck-ui'])), false);
  assert.equal(onFigure(el(['.dk-jump'])), false);
  assert.equal(onFigure(el([])), false);
  assert.equal(onFigure(null), false);
});
