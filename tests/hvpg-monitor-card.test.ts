// Mohammad, 20 Nov: on the HVPG slides (free, wedge, result) the top card showed the pressures alone; the HVPG monitor tracing (2D tool-hvpg.js) was missing.
// Root cause: the slice's plates (decks/hvpg.ts) were built from the old copied slide, which has no `tool`, and only some fields of the 2D slide were carried over, so the slide never asked
// for the monitor (`tool: { kind: 'hvpg', catheter: true }`) that the 2D deck gives it. Every slide of every deck that has a tool in the 2D deck must have it here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HVPG_DECK } from '../src/decks/hvpg.ts';
import { DECK as HVPG_2D } from '../src/decks/hp/data/hvpg.copied.ts';
import { hasToolChart } from '../src/decks/charts.ts';

test('the HVPG slides that have the catheter ask for the monitor', () => {
  for (const id of ['free', 'wedge', 'hvpg']) {
    const s = HVPG_DECK.slides.find((x) => x.id === id)!;
    assert.deepEqual(s.tool, { kind: 'hvpg' }, id);   // (the card reads the rest of it, `catheter: true`, from the copied slide)
    assert.equal((HVPG_2D.slides.find((x) => x.id === id) as { tool?: { catheter?: boolean } }).tool?.catheter, true, id);
    assert.ok(hasToolChart(s), `${id}: the monitor is a card instrument`);
  }
  assert.equal(HVPG_DECK.slides.find((x) => x.id === 'route')!.tool, undefined, 'the route slide measures nothing yet');
});
test('no slide of the HVPG talk drops an instrument its 2D slide asks for', () => {
  const lost: string[] = [];
  for (const s of HVPG_DECK.slides) {
    const t = (HVPG_2D.slides.find((x) => x.id === s.id) as { tool?: { kind?: string } } | undefined)?.tool;
    if (t && (s as { tool?: { kind?: string } }).tool?.kind !== t.kind) lost.push(`${s.id} (${t.kind})`);
  }
  assert.deepEqual(lost, []);
});
test('the card layer draws the pressures ladder only for a slide with no instrument, so the monitor is the card', () => {
  const src = readFileSync('src/ui/cards/CardLayer.tsx', 'utf8');
  assert.match(src, /sn\.dslide\?\.ladder && !sn\.dslide\.tool \? <LadderCard/);
});

test('the free and the wedge slide are one card, so the tracing runs on across the Next that inflates the balloon (2D card-keep)', async () => {
  const { keepData } = await import('../src/ui/cards/keep.ts');
  const { copiedSlideOf } = await import('../src/scene/labels/deck-link.ts');
  const f = (id: string) => { const s = HVPG_DECK.slides.find((x) => x.id === id)!; return { ...s, ...(copiedSlideOf(HVPG_DECK.id, s) ?? {}) } as never; };
  assert.equal(keepData(f('free'), f('wedge')), true, 'free -> wedge keeps the monitor, live');
  assert.equal(keepData(f('wedge'), f('wedge-sinusoid')), false, 'the sinusoid slide after it has its own card (tiles)');
  assert.equal(HVPG_DECK.slides.some((s) => ['free', 'wedge', 'hvpg'].includes(s.id) && s.ladder), false, 'no 3D-only ladder on the instrument slides');
});

test('the tracing starts where the catheter is: carried on from the last slide, else the figure\'s own script time, never a finished picture of a reading still being taken', async () => {
  const { startAt, STEP_T } = await import('../src/ui/talk/hvpg-plan.ts');
  const to = STEP_T.free;
  assert.equal(startAt({ to, carry: 3000, follow: true, figure: 9000, forward: true }), 3000, 'the next slide of the measurement carries on');
  assert.equal(startAt({ to, carry: null, follow: true, figure: 2000, forward: true }), 2000, 'the figure is mid-way: the trace reads as the catheter parks');
  assert.equal(startAt({ to, carry: null, follow: true, figure: to + 5000, forward: true }), to, 'a figure past the reading (a jump): the finished tracing');
  assert.equal(startAt({ to, carry: null, follow: true, figure: null, forward: false }), to, 'no catheter on the figure: the finished tracing');
});
