// Batch B13b: the numbers on the slides are the 2D app's. The copied decks' steps are replayed through the 3D app's pinned engine (the same
// 'sequence' the 2D presenter runs) and every reading is compared with what the 2D engine gave for the same slide (tests/fixtures/decks-hp-numbers.json,
// from `node scripts/port-decks-hp.mjs --from <2D> --numbers`), and every {token} of every line must print as the 2D card prints it.
// Fast by default: one whole deck and the first slide of two others (a few seconds). DECKS_HP_FULL=1 replays all 138 slides (about a minute: for the Mac).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCore } from '../src/engine/host/worker-core.js';
import { HP_IDS, loadHpDeck } from '../src/decks/hp/index.ts';
import { chainOf, sequencer, plainText, parseToken, tokensOf, valueText, stepOf, changes, type Fp } from '../src/decks/hp/numbers.ts';
import type { CopiedDeck } from '../src/decks/hp/types.ts';

interface Gold { from: string; decks: Record<string, { id: string; fp: Record<string, number>; tokens: [string, string][] }[]> }
const gold = JSON.parse(readFileSync(new URL('./fixtures/decks-hp-numbers.json', import.meta.url), 'utf8')) as Gold;
const FULL = process.env.DECKS_HP_FULL === '1';
const WHOLE = 'pregnancy';
const FIRST = 1;
/** The default run: one whole deck, and the first slide of two others (other patients, other presets). */
const QUICK = new Set([WHOLE, 'hvpg', 'kidney']);

async function replay(d: CopiedDeck, upTo: number): Promise<Fp[]> {
  const seq = sequencer(1);
  const core = createCore((m: never) => seq.message(m));
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps: chainOf(d.slides.slice(0, upTo)), reqId: 1 });
  core.dispose();
  // 2D's rule: a slide that changes nothing is the state of the last one that did
  const out: Fp[] = [];
  let last = seq.results[1]!.fp;
  for (let i = 0; i < upTo; i++) { if (changes(d.slides[i]!) || i === 0) last = seq.results[i + 1]!.fp; out.push(last); }
  return out;
}

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 + 2e-5 * Math.max(Math.abs(a), Math.abs(b));

for (const id of HP_IDS.filter((x) => FULL || QUICK.has(x))) {
  const upTo = (d: CopiedDeck) => (FULL || id === WHOLE ? d.slides.length : Math.min(FIRST, d.slides.length));
  test(`${id}: the engine's readings on each slide equal the 2D app's, and each {token} prints as 2D prints it`, async () => {
    const d = await loadHpDeck(id), g = gold.decks[id]!, n = upTo(d);
    const fps = await replay(d, n);
    for (let i = 0; i < n; i++) {
      const want = g[i]!;
      assert.equal(want.id, d.slides[i]!.id);
      for (const [k, v] of Object.entries(want.fp)) {
        const got = fps[i]![k];
        assert.ok(typeof got === 'number' && close(got, v), `${id}/${want.id}: ${k} is ${got}, the 2D app has ${v}`);
      }
      // the line's braces, printed from this engine's numbers
      const at = (sid: string): Fp | null => { const j = d.slides.findIndex((s) => s.id === sid); return j >= 0 && j < n ? fps[j]! : null; };
      const text = `${d.slides[i]!.line} ${d.slides[i]!.vignette ?? ''}`;
      const found = tokensOf(text);
      assert.equal(found.length, want.tokens.length, `${id}/${want.id}: the braces`);
      found.forEach(({ raw }, j) => {
        const t = parseToken(raw.slice(1, -1));
        if (t.kind === 'value' && t.at && !at(t.at)) return;   // (a slide later in the deck than this replay went)
        assert.equal(plainText(raw, fps[i]!, at), want.tokens[j]![1], `${id}/${want.id}: ${raw}`);
      });
    }
  });
}

test('a reading prints with its tile\'s unit and decimals; whole on request; a reading not known prints an ellipsis', () => {
  assert.equal(valueText('hvpg', { hvpg: 11.1 }), '11.1 mmHg');
  assert.equal(valueText('hvpg', { hvpg: 11.1 }, true), '11 mmHg');
  assert.equal(valueText('hvpg', {}), '…');
  assert.equal(valueText('plt', { plt: 90.1 }), '90,000/µL');
  assert.equal(plainText('{>=10 mmHg} and {2 to 3 mg/24 h}', null), '≥10 mmHg and 2 to 3 mg/24 h');
});

test('a slide that changes nothing asks the engine for nothing; the first slide keeps its patient through the outline, as in 2D', () => {
  assert.deepEqual(stepOf({ id: 'a', kicker: '', title: '', line: '', notes: '', ask: ['', ''], cam: 'fit' }), {});
  const c = chainOf([{ id: 'a', kicker: '', title: '', line: '', notes: '', ask: ['', ''], preset: 'csph' }, { id: 'b', kicker: '', title: '', line: '', notes: '', ask: ['', ''] }]);
  assert.equal(c.length, 3);
  assert.equal(c[0]!.preset, 'csph');
  assert.deepEqual(c[1], {});
});
