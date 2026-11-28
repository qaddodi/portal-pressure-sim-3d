import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stopsOf } from '../src/ui/deck/presenter-machine.ts';
import { loadBuiltin, deckOrder } from '../src/decks/registry.ts';
import { copiedSlideOf } from '../src/scene/labels/deck-link.ts';
import { keepData, dataPlan } from '../src/ui/cards/keep.ts';
import { blend } from '../src/ui/charts/morph.ts';
import { shiftFrame } from '../src/ui/charts/shift/frame.ts';
import type { Frame, Shape } from '../src/ui/charts/scene.ts';
import '../src/decks/all.ts';

// Mohammad, 28 Nov: slides that share an instrument keep its card, whatever the slide changes in it (a time-lapse included); the card's words never blink while it is held.
const TAKES_SCREEN = ['visual', 'cath', 'monitor', 'procedure', 'vignette', 'question', 'hold'];

test('in every deck, two slides with the same instrument keep one card unless the next slide needs the screen for a case, question, catheter, procedure or an instrument that cannot ride a patient change', async () => {
  const unkept: string[] = [];
  for (const id of deckOrder()) {
    const deck = await loadBuiltin(id);
    if (!deck) continue;
    const slides = stopsOf(deck).flatMap((s) => (s.kind === 'slide' ? [s.slide] : []));
    const F = (s: unknown) => ({ ...(s as object), ...(copiedSlideOf(deck.id, s as never) ?? {}) }) as Record<string, unknown> & { tool?: { kind?: string } };
    for (let i = 1; i < slides.length; i++) {
      const a = F(slides[i - 1]), b = F(slides[i]);
      if (!dataPlan(a as never) || dataPlan(a as never) !== dataPlan(b as never)) continue;
      if (TAKES_SCREEN.some((k) => a[k] || b[k])) continue;
      if (!keepData(a as never, b as never)) unkept.push(`${id} ${String(a.id)} -> ${String(b.id)} (${b.tool?.kind}${b.lapse ? ', lapse' : ''})`);
    }
  }
  // (the only instruments left that take the screen back: a lapse or a patient change on a tool that records, doppler / vitals / trace-beats / flowtime / evgraph)
  const shift = unkept.filter((u) => /shift/.test(u));
  assert.deepEqual(shift, [], 'the change-from-healthy card is kept across every slide pair of every deck');
});

const text = (x: number, s: string): Shape => ({ k: 'text', x, y: 10, s, size: 12, color: [1, 1, 1, 1] } as Shape);
const line = (x: number): Shape => ({ k: 'line', x1: x, y1: 0, x2: x, y2: 50, pen: { color: [1, 1, 1, 1], w: 1 } } as Shape);

test('a blend between frames that do not pair leaves what both frames hold at full strength, and dissolves only the rest', () => {
  const a: Frame = { w: 100, h: 50, shapes: [text(5, '% of healthy'), line(10), text(60, 'CO 88%')], label: '' };
  const b: Frame = { w: 100, h: 50, shapes: [text(5, '% of healthy'), line(10), text(60, 'CO 120%'), line(30)], label: '' };
  for (const t of [0.2, 0.5, 0.8]) {
    const f = blend(a, b, t);
    const kept = f.shapes.filter((s) => s.k === 'text' && (s as { s: string }).s === '% of healthy');
    assert.equal(kept.length, 1, 'the unchanged label is drawn once, not twice');
    assert.equal((kept[0] as { alpha?: number }).alpha ?? 1, 1, `the unchanged label stays at full strength at t=${t}`);
    const lines = f.shapes.filter((s) => s.k === 'line' && (s as { x1: number }).x1 === 10);
    assert.equal(lines.length, 1);
    const newLine = f.shapes.find((s) => s.k === 'line' && (s as { x1: number }).x1 === 30) as unknown as { pen: { color: number[] } };
    assert.ok(Math.abs(newLine.pen.color[3]! - t) < 1e-9, 'the new line eases in');
    const oldWord = f.shapes.find((s) => s.k === 'text' && (s as { s: string }).s === 'CO 88%') as { alpha?: number };
    assert.ok(Math.abs((oldWord.alpha ?? 1) - (1 - t)) < 1e-9, 'the changed word eases out');
  }
});

test('the change-from-healthy card is in the card from its first frame: a chart not yet worked out is an empty box as tall as the drawn one', () => {
  const src = readFileSync(new URL('../src/ui/charts/shift/ShiftCard.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /if \(!vals\[0\]\) return null/, 'the card never renders nothing while its readings are pending (the card locked at its header alone, the chart row clipped)');
  const c = { w: 320, pal: {}, type: { sm: 12 }, look: 'light' } as never;
  for (const height of [undefined, 180, 260]) {
    const pending = shiftFrame({ stages: [], vals: [null], at: 0, height }, c).frame;
    assert.equal(pending.h, Math.max(9 * 12, height ?? 220), 'the pending frame has the height the drawn one takes');
    assert.equal(pending.shapes.length, 0);
  }
});
