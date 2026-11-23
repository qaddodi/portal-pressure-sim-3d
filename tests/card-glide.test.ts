// Plan 46: a card's height glide can never leave the frame held or the words moved. Node only.
// Mohammad (23 Nov, slide 12, iPhone): the name tab on the title, the chart cut at its foot. Root cause: a sink cut short by a reveal never finished, so its held height and its shift stayed (card-glide.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beginSink, beginReveal, finishSink, finishReveal, settle, committed, shiftWords, wordShift, type GlideAnchor, type GlideHost } from '../src/ui/cards/card-glide.ts';

const GLIDE = 340;
/** A card as the host sees it: the held height, the words' shift, the running animations (each ends at a time), the height the plan gives it. */
class Sim {
  animH: number | null = null; shift = 0; t = 0; rect = 0;
  anims: { end: number; kind: 'sink' | 'reveal' }[] = [];
  host: GlideHost = {
    cancelAnims: () => { this.anims = []; },
    setAnimH: (h) => { const was = this.animH; this.animH = h; if (was !== h) committed(this.host, h); },   // (React commits the held height: the effect on it runs when it changes)
    shiftWords: (px) => { this.shift = px; },
  };
  anchor: GlideAnchor;
  constructor(h: number, anchor: GlideAnchor) { this.rect = h; this.anchor = anchor; }
  sink(next: number) { const prev = this.rect; if (next >= prev) return; this.rect = next; beginSink(this.host, prev, next, this.anchor); this.anims = [{ end: this.t + GLIDE, kind: 'sink' }]; }
  reveal(next: number) { const prev = this.rect; if (next <= prev) return; this.rect = next; beginReveal(this.host, next); this.anims = [{ end: this.t + GLIDE, kind: 'reveal' }]; }
  out() { settle(this.host); }
  tick(ms: number) {
    this.t += ms;
    for (const a of [...this.anims]) if (a.end <= this.t && this.anims.includes(a)) { this.anims = this.anims.filter((x) => x !== a); if (a.kind === 'sink') finishSink(this.host); else finishReveal(this.host); }
  }
  get shown() { return this.animH ?? this.rect; }
}
/** The same card with the logic Plan 46 replaces: a cancel leaves the held height and the shift where they were. */
class Legacy {
  animH: number | null = null; shift = 0; t = 0; rect = 0; anims: { end: number; kind: 'sink' | 'reveal' }[] = [];
  anchor: GlideAnchor;
  constructor(h: number, anchor: GlideAnchor) { this.rect = h; this.anchor = anchor; }
  sink(next: number) { const prev = this.rect; this.rect = next; this.anims = [{ end: this.t + GLIDE, kind: 'sink' }]; this.animH = prev; this.shift = wordShift(this.anchor, prev - next); }
  reveal(next: number) { this.rect = next; this.anims = [{ end: this.t + GLIDE, kind: 'reveal' }]; }
  tick(ms: number) { this.t += ms; this.anims = this.anims.filter((a) => { if (a.end > this.t) return true; if (a.kind === 'sink') { this.animH = null; this.shift = 0; } return false; }); }
}

test('slide 12: a sink cut short by a reveal leaves nothing held (the old logic left the frame at 540 and the words 155 down)', () => {
  const old = new Legacy(540, 'mid'); old.sink(230); old.tick(120); old.reveal(300); old.tick(2000);
  assert.equal(old.animH, 540, 'the old logic holds the frame at its old height for good');
  assert.equal(old.shift, 155, 'and keeps the words 155 down (d/2 of the 310 the card lost)');
  const c = new Sim(540, 'mid'); c.sink(230); assert.equal(c.shift, 155); assert.equal(c.shown, 540);
  c.tick(120); c.reveal(300);
  assert.equal(c.shift, 0, 'the reveal let go of the shift at once'); assert.equal(c.shown, 300, 'and the frame is the card\'s own height');
  c.tick(2000);
  assert.equal(c.animH, null); assert.equal(c.shift, 0); assert.equal(c.anims.length, 0); assert.equal(c.shown, 300);
});

test('a card on its way out lets go of a running glide', () => {
  for (const a of ['foot', 'mid', 'top'] as const) { const c = new Sim(400, a); c.sink(200); c.tick(50); c.out(); assert.equal(c.animH, null); assert.equal(c.shift, 0); assert.equal(c.anims.length, 0); }
});

test('the words\' shift is what the frame still has to lose: all of it on a card on the foot, half on a centred one, none on a card at the top', () => {
  assert.equal(wordShift('foot', 80), 80); assert.equal(wordShift('mid', 80), 40); assert.equal(wordShift('top', 80), 0);
});

test('2,000 random sequences of sink, reveal, out and time end quiet: nothing held, no shift, the card its last height (seeded)', () => {
  let seed = 46;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let n = 0; n < 2000; n++) {
    const anchor = (['foot', 'mid', 'top'] as const)[Math.floor(rnd() * 3)]!;
    const c = new Sim(rnd() < 0.2 ? 540 : 20 + Math.round(rnd() * 480), anchor);
    const len = 1 + Math.floor(rnd() * 12);
    for (let i = 0; i < len; i++) {
      const h = rnd() < 0.2 ? 230 : 20 + Math.round(rnd() * 480), r = rnd();
      if (r < 0.3) c.sink(h); else if (r < 0.6) c.reveal(h); else if (r < 0.7) c.out(); else c.tick(Math.floor(rnd() * 500));
      // never an invalid mid-state: a shift with no frame held means the words moved with nothing under them
      if (c.shift !== 0) assert.notEqual(c.animH, null, `seq ${n}: words shifted with no held frame`);
    }
    c.tick(5000);
    assert.equal(c.animH, null, `seq ${n}: the frame is let go`);
    assert.equal(c.shift, 0, `seq ${n}: the words are back`);
    assert.equal(c.anims.length, 0, `seq ${n}: no animation left`);
    assert.equal(c.shown, c.rect, `seq ${n}: the card is the height last asked for`);
  }
});

test('shiftWords moves each content child by its own translate (the name tab too, so it rides with the corner), never the inner, and puts back only what it moved', () => {
  const mk = (tr = '') => ({ style: { translate: tr }, dataset: {} as Record<string, string | undefined> });
  const tab = mk(), title = mk(), own = mk('5px 0');   // `own`: a child that already carried a translate of its own before any glide
  const inner = { children: [tab, title, own], style: { transform: '' } };
  shiftWords(inner, 155);
  assert.equal(inner.style.transform, '', 'the inner is never given a transform (it would become the name tab\'s containing block)');
  assert.equal(tab.style.translate, '0 155px'); assert.equal(title.style.translate, '0 155px');
  shiftWords(inner, 0);
  assert.equal(tab.style.translate, ''); assert.equal(title.style.translate, '');
  shiftWords(null, 3); shiftWords(null, 0);
});
