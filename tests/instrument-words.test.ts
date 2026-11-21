import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECK as KIDNEY } from '../src/decks/hp/data/kidney.copied.ts';
import { ASCITES } from '../src/decks/ag/ascites.copied.ts';
import { parseToken, valueText } from '../src/ui/text/tokens.ts';
import { LINE } from '../src/ui/charts/flowtime/model.ts';
import { csphFingerprint } from '../scripts/gen-engine-fixture.mjs';

// The review round's R3 (22 Nov 2026): the IAP is a reading a slide can name. The fingerprint carries it (hales-engine), the tile table has it, and the four slides that teach
// APP = MAP − IAP print it. The words are edits of scripts/instrument-edits.mjs, run by every deck generator, so a re-copy from 2D keeps them.
type Slide = { id: string; line?: string; tool?: { kind?: string; lines?: string[]; title?: string } };
const slide = (deck: { slides?: Slide[]; sections?: unknown }, id: string): Slide => {
  const all: Slide[] = (deck as { slides: Slide[] }).slides ?? [];
  const s = all.find((x) => x.id === id);
  assert.ok(s, `slide ${id}`);
  return s!;
};

test('{iap} is a reading the words can print, as the abdomen card\'s dial prints it (whole mmHg)', () => {
  assert.deepEqual(parseToken('iap'), { kind: 'value', key: 'iap', whole: false, at: null });
  assert.deepEqual(parseToken('iap@pressure'), { kind: 'value', key: 'iap', whole: false, at: 'pressure' });
  assert.equal(valueText('iap', { iap: 14.6 }), '15 mmHg');
  assert.equal(valueText('iap', { iap: 5 }), '5 mmHg');
  assert.equal(valueText('iap', {}), valueText('nothing-here', {}), 'no reading yet: the same placeholder as every other reading');
});

test('the engine\'s fingerprint carries the IAP the dial reads', async () => {
  for (const id of ['healthy', 'cirr-decomp']) {
    const fp = await csphFingerprint(id) as Record<string, number>;
    assert.ok(Number.isFinite(fp.iap) && fp.iap >= 4.99, `${id}: iap ${fp.iap}`);
  }
  const a = await csphFingerprint('healthy') as Record<string, number>, b = await csphFingerprint('cirr-decomp') as Record<string, number>;
  assert.ok(b.iap >= a.iap, 'ascites raises it');
});

test('the four slides that teach APP = MAP − IAP name the IAP, and kidney/tense charts it', () => {
  const lines: [string, string | undefined][] = [
    ['kidney/pressure', slide(KIDNEY as never, 'pressure').line], ['kidney/tense', slide(KIDNEY as never, 'tense').line], ['kidney/tap', slide(KIDNEY as never, 'tap').line],
    ['ascites/tense', slide(ASCITES as never, 'tense').line],
  ];
  for (const [id, line] of lines) {
    assert.match(line!, /\{iap(@[\w-]+)?\}/, `${id} prints the IAP`);
    assert.match(line!, /\{rpp(@[\w-]+)?\}/, `${id} still prints the APP`);
  }
  assert.match(lines[1]![1]!, /\{iap@pressure\} to \{iap\}/, 'kidney/tense: from the IAP it started at to the one it reaches');
  const t = slide(KIDNEY as never, 'tense').tool!;
  assert.deepEqual(t.lines, ['rpp', 'iap'], 'the flow-time chart plots the APP and the IAP');
  assert.equal(t.title, 'APP and IAP over four months');
  assert.ok(LINE.iap && LINE.rpp, 'the chart knows both lines');
  assert.notEqual(LINE.iap![3], LINE.rpp![3], 'two lines on one chart never share a colour');
  assert.equal(LINE.iap![1], LINE.rpp![1], 'both mmHg: one scale');
});
