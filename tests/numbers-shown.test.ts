// Words that cite a number no instrument shows (external review of capture 3531bdfa, F-D14; owner W14). The rule, held on every slide of every deck: a reading the slide's title or line
// prints from the slide's own state (`{key}`) is on screen with it, as a tile or header reading of the slide's data card, a key reading, or a number its instrument prints large.
// The scan is crude about instruments (a chart, a path or a profile prints its own numbers that the table below does not know), so the slides it cannot clear are a ratchet:
// tests/numbers-shown-exceptions.json lists them, may only shrink (a slide that now shows its number must leave the list, a slide not on it must show every number it cites).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tokensOf } from '../src/ui/text/tokens.ts';
import { tileKeys, shownBy } from '../src/ui/deck/from2d/card-tiles.js';
import { copiedDecks } from './helpers-deck-chain.ts';
import { AT_FP } from '../src/ui/charts/profile/layout.generated.js';

/** The readings an instrument prints as numbers of its own, by the instrument's kind (those the review's reading of the pictures confirms; every other kind is judged by its tiles alone). */
const PRINTS: Record<string, readonly string[]> = {
  hvpg: ['hvpg', 'whvp', 'fhvp'], trace: ['pv', 'whvp', 'fhvp', 'hvpg'],
  // (the pressure ladder prints every station's reading, the wedged one at the sinusoid, and its brackets: the HVPG, the PPG and the EUS-PPG; charts/profile/layout.generated.js AT_FP)
  profile: [...Object.values(AT_FP as Record<string, string>), 'hvpg', 'ppg', 'eus'],
};
const shownOf = (s: Record<string, unknown>): Set<string> => new Set([
  ...(tileKeys(s, false) as string[]), ...(tileKeys(s, true) as string[]), ...((s.key as string[] | undefined) ?? []), ...(shownBy(s) as string[]),
  ...PRINTS[(s.tool as { kind?: string } | undefined)?.kind ?? ''] ?? [],
]);

test('every reading a slide\'s title or line cites from its own state is shown with it, but for the listed slides', async () => {
  const listed: string[] = JSON.parse(readFileSync(new URL('./numbers-shown-exceptions.json', import.meta.url), 'utf8'));
  const found: string[] = [];
  (await copiedDecks()).forEach((d, k) => d.slides.forEach((slide, i) => {
    const s = slide as unknown as Record<string, unknown>, shown = shownOf(s);
    for (const { token } of tokensOf([s.title, s.line].filter((t) => typeof t === 'string').join(' '))) {
      if (token.kind !== 'value' || token.at) continue;
      if (!shown.has(token.key)) found.push(`${k + 1}.${i + 2} ${d.id}/${s.id}: ${token.key}`);
    }
  }));
  const uniq = [...new Set(found)];
  assert.deepEqual(uniq.filter((e) => !listed.includes(e)), [], 'these slides cite a number nothing on them shows: add the reading to the slide\'s tiles (a patch in scripts/source-edits.mjs), do not list them');
  assert.deepEqual(listed.filter((e) => !uniq.includes(e)), [], 'these slides now show what they cite: take them off tests/numbers-shown-exceptions.json (the list only shrinks)');
});

test('the five slides of the review (03.10, 05.9.2, 06.3, 06.4, 07.2.2) show every number they cite', async () => {
  const ds = await copiedDecks();
  for (const [deck, id] of [['prehepatic', 'liver'], ['outflow', 'web'], ['pregnancy', 'weeks'], ['pregnancy', 'inflow'], ['next-bleed', 'after']] as const) {
    const s = ds.find((d) => d.id === deck)!.slides.find((x) => x.id === id) as unknown as Record<string, unknown>, shown = shownOf(s);
    for (const { token } of tokensOf(String(s.line))) if (token.kind === 'value' && !token.at) assert.ok(shown.has(token.key), `${deck}/${id} cites {${token.key}}`);
  }
});
