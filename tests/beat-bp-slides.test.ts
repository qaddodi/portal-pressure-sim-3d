// Capture 2a54261a (25 Nov 2026, iPhone): Variceal bleed 11 said "the blood pressure falls to 99/65 (76) mmHg" over a beat monitor with the heart rate alone.
// The rule, for every talk: a beat monitor (tool trace/beats) whose slide's words give the blood pressure ({map} or "blood pressure") prints it beside the heart rate (tool.bp), so the words and the instrument show one set of numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const roots = ['src/decks/ag', 'src/decks/hp/data', 'src/decks/rw/copied'];
const decks = roots.flatMap((r) => readdirSync(r).filter((f) => /\.ts$/.test(f)).map((f) => `${r}/${f}`)).flatMap((file) => {
  const m = /CopiedDeck = (\{[\s\S]*?\n\});\n\nexport const/.exec(readFileSync(file, 'utf8'));
  if (!m) return [];
  try { return [JSON.parse(m[1]) as { id: string; slides: { id: string; line?: string; tool?: { kind?: string; range?: string; bp?: boolean } }[] }]; } catch { return []; }
});

test('a beat monitor whose words give the blood pressure shows it', () => {
  let seen = 0;
  for (const d of decks) for (const s of d.slides) {
    if (s.tool?.kind !== 'trace' || s.tool.range !== 'beats') continue;
    if (!/\{map\}|blood pressure/i.test(s.line ?? '')) continue;
    seen++;
    assert.equal(s.tool.bp, true, `${d.id} / ${s.id}: the words give the blood pressure, the monitor does not print it`);
  }
  assert.ok(seen >= 6, `the rule reached ${seen} slides`);
});
