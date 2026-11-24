// B13c: a slide's numbers come from the engine. The fixture (tests/fixtures/rw-numbers.json, scripts/gen-rw-numbers.mjs) holds what the 2D app's own model reads on every slide;
// these tests hold the 3D engine copy to it (the smallest deck live every run, all sixteen with RW_FULL=1: about two minutes, for the Mac) and read every {token} of every line from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stepsOf, shownSlides, deckFingerprints, parseWords, valueTokens, valueText, changes, MODEL_FIELDS } from '../src/decks/rw/numbers.ts';
import { runStepsNode } from '../src/decks/rw/numbers-node.ts';
import { TILE } from '../src/ui/charts/tiles.generated.ts';
import { RW_IDS, DECKS } from './decks-rw-helpers.ts';

type Rows = { decks: Record<string, Record<string, number>[]> };
const read = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8')) as Rows;
// the 2D app's numbers, except for the decks where this app's engine has deliberately moved on (rw-numbers-3d.json, scripts/gen-rw-numbers-3d.mjs: two-lesions from its slide 4, varices with four slides of its own)
const fixture: Rows = { decks: { ...read('rw-numbers.json').decks, ...read('rw-numbers-3d.json').decks } };
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

test('the chain is the 2D presenter\'s: the outline takes the first slide\'s model fields, which the first slide then keeps (unless it is a time-lapse or opens with a case)', () => {
  const d = DECKS['two-lesions']!;
  const shown = shownSlides(d);
  assert.equal(shown.length, d.slides.length + 1);
  assert.equal(shown[0]!.id, 'outline');
  assert.equal(shown[0]!.preset, d.slides[0]!.preset);
  assert.ok(d.slides[0]!.vignette, 'two-lesions opens with a case: its first slide loads the patient afresh behind the case card');
  assert.equal(shown[1]!.preset, d.slides[0]!.preset);
  const plain = Object.values(DECKS).find((x) => !x.slides[0]!.vignette && !x.slides[0]!.lapse && !x.slides[0]!.ramp && changes(x.slides[0]!))!;
  const s2 = shownSlides(plain);
  for (const k of MODEL_FIELDS) assert.equal(s2[1]![k], undefined, `${plain.id}: the first slide keeps the outline's ${k}, it does not repeat it`);
  assert.equal(stepsOf(d).length, shown.length);
  assert.ok(stepsOf(d).every((s) => typeof s === 'object'));
});

for (const id of RW_IDS) {
  test(`${id}: the fixture has a state for the outline, every slide and the quick check`, () => {
    assert.equal(fixture.decks[id]!.length, DECKS[id]!.slides.length + 2);
  });
  test(`${id}: every {value} of every line and check reads a number the model has (never a dash, never "…")`, () => {
    const d = DECKS[id]!, fp = fixture.decks[id]!;
    const ids = d.slides.map((s) => s.id);
    const needs = (text: unknown, i: number, where: string) => {
      if (typeof text !== 'string') return;
      for (const p of valueTokens(parseWords(text))) {
        assert.ok(TILE[p.key], `${where}: ${p.key} is no tile`);
        const at = p.at ? ids.indexOf(p.at) + 1 : i;
        assert.ok(p.at ? at > 0 : true, `${where}: @${p.at} is no slide`);
        // the dock tile of a reading the patient does not have prints a dash in 2D too; a line must never be built on one
        assert.ok(Number.isFinite(fp[at]![p.key]), `${where}: {${p.key}${p.at ? '@' + p.at : ''}} has no number on that slide`);
        assert.notEqual(valueText(p.key, fp[at]!), '…');
      }
    };
    d.slides.forEach((s, i) => { for (const f of ['line', 'caveat', 'vignette', 'caseQ']) needs(s[f], i + 1, `${id}/${s.id}.${f}`); });
    d.checks.forEach(([q, a]) => { needs(q, fp.length - 1, `${id} check`); needs(a, fp.length - 1, `${id} check`); });
  });
}

const live = process.env.RW_FULL ? RW_IDS : ['two-lesions'];
for (const id of live) {
  test(`${id}: the 3D engine copy reads the 2D app's numbers on every slide (live run)`, { timeout: 120000 }, async () => {
    const fps = await deckFingerprints(DECKS[id]!, runStepsNode);
    const want = fixture.decks[id]!;
    assert.equal(fps.length, want.length);
    const off: string[] = [];
    fps.forEach((fp, i) => { for (const [k, v] of Object.entries(want[i]!)) { const got = fp[k]; if (typeof got !== 'number' || Math.abs(r4(got) - v) > 1.5e-4) off.push(`slide ${i} ${k}: ${got} vs ${v}`); } });
    assert.deepEqual(off, []);
  });
}
