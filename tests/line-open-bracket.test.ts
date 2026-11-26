// An open bracket never wraps away from its reading (capture 3531bdfa E-D4: Stiffness 28.13.2 ended a line "an SSM >55 kPa (" and began the next "59.4 kPa), decides."). The glue held the space before a pill
// and the stop after it, but the "(" before it stayed in the plain words, a separate run a line may end on. gluePieces now takes the bracket out of the words and holds it with its pill (`before`).
// Judged over every line of every deck, plus the case that was seen. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gluePieces, parseLine } from '../src/ui/text/line.ts';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { stopsOf } from '../src/ui/deck/presenter-machine.ts';

const PILLS = new Set(['value', 'cutoff', 'literal', 'step']);

test('"an SSM >55 kPa ({ssm}), decides." holds the bracket with the reading', () => {
  const g = gluePieces(parseLine('an SSM >55 kPa ({ssm}), decides.'));
  const at = g.findIndex((x) => x.p.t === 'value');
  assert.ok(at > 0);
  assert.equal(g[at]!.before, '(');
  assert.equal(g[at]!.stop, ')', 'and the closing bracket');
  const before = g[at - 1]!.p;
  assert.ok(before.t === 'text' && !/[([]$/.test(before.text), 'the words before it no longer end on the bracket');
});

test('in every line of every deck, no plain words end on an opening bracket that stands before a reading, cut-off, number or step', async () => {
  let lines = 0, brackets = 0;
  for (const { id } of UI.decks as readonly { id: string }[]) {
    const stops = stopsOf((await loadBuiltin(id))!);
    for (const s of stops) {
      if (s.kind !== 'slide') continue;
      const all: string[] = [s.slide.line, ...(s.slide.beats ?? []).map((b) => (b as { line?: string }).line)].filter((x): x is string => typeof x === 'string');
      for (const text of all) {
        lines++;
        const g = gluePieces(parseLine(text));
        g.forEach((it, i) => {
          if (it.before) brackets++;
          const next = g[i + 1];
          if (it.p.t === 'text' && next && PILLS.has(next.p.t)) assert.doesNotMatch(it.p.text, /[([]$/, `${id}/${s.slide.id}: "${text.slice(0, 60)}" ends a run on an opening bracket before a pill`);
        });
      }
    }
  }
  assert.ok(lines > 300, `${lines} lines judged`);
  assert.ok(brackets > 0, 'some line has a bracket before a reading');
});
