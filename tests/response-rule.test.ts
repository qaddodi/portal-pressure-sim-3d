// C2 (owner, 27 Nov 2026): the HVPG response is a fall of >=10% in primary prophylaxis (and the acute IV propranolol test) and >=20% (or an HVPG of 12 mmHg or less) after a bleed.
// Every slide with a response tile says which use it is, so the tile, the slide's words and its chart are one rule. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSource } from '../src/decks/source.ts';
import { RESPONSE_RULE } from '../src/decks/overlay/controls.ts';
import { RESPONSE_CUT } from '../src/ui/cards/ratings.ts';
import { AG_IDS } from '../src/decks/ag/index.ts';
import { HP_IDS } from '../src/decks/hp/index.ts';
import { RW_IDS } from '../src/decks/rw/copied/index.ts';

type Slide = { id: string; line: string; hvpgResp?: unknown; hvpgRule?: keyof typeof RESPONSE_CUT; tool?: { zone?: { fall?: number } } };
const slideOf = async (key: string): Promise<Slide> => {
  const [d, s] = key.split('/');
  const slides = (await loadSource(d!)).slides as unknown as Slide[], at = slides.findIndex((x) => x.id === s);
  // (a slide cut into several, decks/overlay.ts, says its words across them: its line is all of theirs)
  let end = at + 1;
  while (slides[end]?.id === `${s}-${end - at + 1}`) end++;
  return { ...slides[at]!, line: slides.slice(at, end).map((x) => x.line).join(' ') };
};

test('every slide with a response tile is ruled, and its rule is the one in RESPONSE_RULE', async () => {
  const seen: string[] = [];
  for (const id of [...AG_IDS, ...HP_IDS, ...RW_IDS]) {
    for (const s of (await loadSource(id)).slides as unknown as Slide[]) if (s.hvpgResp) {
      // (the parts of a slide cut into several carry its tile and its rule: they are ruled by the first one's key)
      const base = s.id.replace(/-\d+$/, ''), key = `${id}/${RESPONSE_RULE[`${id}/${s.id}`] ? s.id : base}`;
      if (key.endsWith(`/${s.id}`)) seen.push(key);
      assert.equal(s.hvpgRule, RESPONSE_RULE[key], `${id}/${s.id}`);
    }
  }
  assert.deepEqual(seen.sort(), Object.keys(RESPONSE_RULE).sort());
});

test('a slide names the cut its tile applies: "20%" and "12 mmHg" after a bleed or in a decompensated patient, "10%" in primary prophylaxis', async () => {
  for (const [key, rule] of Object.entries(RESPONSE_RULE)) {
    const { line } = await slideOf(key);
    const cut = RESPONSE_CUT[rule];
    assert.match(line, new RegExp(`≥${cut}%`), `${key} (${rule}) names ≥${cut}%`);
    if (rule === 'secondary') assert.match(line, /≤12 mmHg|<=12 mmHg/, `${key} names the 12 mmHg alternative`);
    if (rule === 'primary') assert.match(line, /primary prophylaxis|before any bleed/, `${key} says it is the primary rule`);
    if (rule === 'acute') assert.match(line, /IV propranolol/, `${key} says it is the IV test`);
  }
});

test('a secondary-prophylaxis slide never says that a fall of ≥10% is the response without saying which use that is', async () => {
  for (const [key, rule] of Object.entries(RESPONSE_RULE)) {
    if (rule !== 'secondary') continue;
    const { line } = await slideOf(key);
    for (const m of line.matchAll(/≥10%/g)) assert.match(line.slice(Math.max(0, m.index! - 80), m.index! + 60), /primary/, `${key}: ≥10% beside "primary"`);
  }
});

test('the treatment talk\'s chart draws the same zone as its tile (a fall of 10%, primary prophylaxis: owner, 28 Nov), so a 13% fall is inside it (30.11)', async () => {
  const s = await slideOf('treatment/relation');
  assert.equal(s.tool?.zone?.fall, RESPONSE_CUT.primary);
  assert.doesNotMatch(s.line, /both within the response zone/);
  assert.match(s.line, /≥10%/);
});
