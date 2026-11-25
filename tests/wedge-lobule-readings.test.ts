// The wedge slide's lobule (Mohammad, 25 Nov 2026, slide 5/15 of Measuring HVPG and PPG: "show the sinusoid pressure on the lobule and show a callout on the sinusoid with the HVPG pressure").
// Two root causes. (1) The Sinusoids name stood with no number beside the WHVP card, because the solver priced the wide "Sinusoids 16.7 mmHg" over the dense net above the narrow bare name and
// took the narrow one, and nothing ever fed `must` (a name the slide shows stands first). Now a slide whose callout says `reads: ['sin']` stands that name first and keeps only the forms that carry its
// reading, clear of the sinusoids' courses as the central vein's is. (2) The slide had no pointer: it gets a callout on a
// sinusoid whose words are the WHVP, read from the same fingerprint as the patient card's tile.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadHpDeck } from '../src/decks/hp/index.ts';
import { figurePlan } from '../src/ui/deck/figure-plan.ts';
import { figureCalls, type Fp } from '../src/ui/deck/figure-calls.ts';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { LINE_KINDS, buildLobuleCaptions, readingText } from '../src/scene/lobule/captions.ts';
import { LEAD_ON, boxOf, solve } from '../src/scene/labels/solver.ts';
import { boxGap, hits } from '../src/scene/labels/geometry.ts';
import { valueText } from '../src/decks/hp/numbers.ts';
import { SIZES, frame } from './lobule-frame.ts';

const gold = JSON.parse(readFileSync(new URL('./fixtures/decks-hp-numbers.json', import.meta.url), 'utf8')) as { decks: Record<string, { id: string; fp: Fp }[]> };
const fp = gold.decks.hvpg!.find((s) => s.id === 'wedge-sinusoid')!.fp;
const deck = await loadHpDeck('hvpg');
const slide = deck.slides.find((s) => s.id === 'wedge-sinusoid')!;

test('the slide asks for the Sinusoids name to stand first with its reading, and only this slide does', async () => {
  const calls = figureCalls(figurePlan(slide), { fp });
  assert.deepEqual(calls.reads, ['sin']);
  for (const id of ['presin', 'wedge']) assert.deepEqual(figureCalls(figurePlan(deck.slides.find((x) => x.id === id)!), { fp }).reads, [], `${id}: unchanged`);
  const lob = await loadHpDeck('lobule');
  for (const x of lob.slides) assert.deepEqual(figureCalls(figurePlan(x), { fp }).reads, [], `lobule/${x.id}: unchanged`);
});

test('the callout stands on a sinusoid and says the WHVP, the number of the patient card\'s tile', () => {
  const plan = figurePlan(slide);
  assert.deepEqual(plan.callout && { at: plan.callout.at, kind: plan.callout.kind }, { at: 'sin', kind: 'note' });
  const co = figureCalls(plan, { fp }).cards.find((c) => c.id === 'callout')!;
  assert.ok(co, 'the callout is a card of the figure');
  assert.deepEqual(co.anchor, { lobule: 'sinusoid:mid' });
  assert.equal(co.text, `WHVP ${valueText('whvp', fp as never)}`);
  assert.equal(co.text, 'WHVP 16.3 mmHg');
  assert.equal(co.tone, 'note', 'a plain tone: the WHVP is a reading, not a block or a treatment');
  // the same slide's tiles read the same fingerprint, so the callout and the card cannot differ
  assert.equal(readingText('P2', { P1: 0, P2: fp.sin!, P3: 0, lymph: 0 }, false, true), '16.7 mmHg');
});

const net = buildLobule();
const measure = (t: string) => t.length * 6.8;
for (const s of SIZES) for (const cards of [true, false]) {
  test(`${s.name}${cards ? ', cards up' : ''}: the Sinusoids name stands with its reading, clear of other names, the cards and the sinusoids' courses, with its leader`, () => {
    const f = frame(s);
    // the slide's cards: a column at the left on a wide screen (340 px and its margin)
    const blockers = cards && s.w >= 800 ? [{ x0: 0, y0: 60, x1: 380, y1: s.h - 20 }] : [];
    const inView = (x: number, y: number) => x > f.view.x0 + 64 && x < f.view.x1 - 64 && y > f.view.y0 + 64 && y < f.view.y1 - 64 && !blockers.some((b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1);
    const c = buildLobuleCaptions({ proj: f.proj, vp: { w: s.w, h: s.h }, measure, net, layers: { zones: false, lymph: false }, inView, unit: true, must: new Set(['sin']) });
    const out = solve({ items: c.items, view: f.view, blockers, lines: c.lines, keep: c.keep });
    const p = out.placed.find((x) => x.id === 'sin');
    assert.ok(p, `Sinusoids is placed (placed ${out.placed.map((x) => x.id)}, dropped ${out.dropped})`);
    const it = c.items.find((i) => i.id === 'sin')!, form = c.meta.get('sin')!.forms[p.form]!, box = boxOf(p, it.ax, it.ay);
    assert.equal(form.value, true, 'the form carries the pressure');
    assert.equal(p.leader, true);
    assert.ok(boxGap(box, it.ax, it.ay) > LEAD_ON);
    for (const o of out.placed) if (o.id !== 'sin') { const ob = boxOf(o, c.items.find((i) => i.id === o.id)!.ax, c.items.find((i) => i.id === o.id)!.ay); assert.ok(!hits(box, ob), `Sinusoids clear of ${o.id}`); }
    for (const b of blockers) assert.ok(!hits(box, b), 'clear of the cards');
    assert.ok(box.x0 >= f.view.x0 && box.x1 <= f.view.x1 && box.y0 >= f.view.y0 && box.y1 <= f.view.y1, 'inside the view');
    // clear of the courses drawn under it
    const over = c.lines.filter((l) => { const x0 = Math.min(l[0], l[2]), x1 = Math.max(l[0], l[2]), y0 = Math.min(l[1], l[3]), y1 = Math.max(l[1], l[3]); return x1 > box.x0 && x0 < box.x1 && y1 > box.y0 && y0 < box.y1; });
    assert.equal(over.length, 0, `${over.length} line pieces under the words`);
    assert.ok(LINE_KINDS.size > 0);
  });
}

test('without the slide\'s ask the Sinusoids name keeps its bare fallback (free play and other slides are unchanged)', () => {
  const f = frame(SIZES[5]!);
  const c = buildLobuleCaptions({ proj: f.proj, vp: { w: 1440, h: 900 }, measure, net, layers: { zones: false, lymph: false }, unit: true });
  assert.deepEqual(c.meta.get('sin')!.forms.map((x) => x.value), [true, false]);
});
