// Site labels follow one rule for colour and for the set a view names (capture 36b7deac, 25 Nov 2026, Sites and causes):
//  - a KEY READING is never the dimmest label on the screen: Budd-Chiari's RHV 25.0 mmHg, the number the slide is about, stood at the dim alpha beside the right atrium the line named.
//    Root cause: `figurePlan` lit only the stations the slide's words point at and dimmed every other label; a key reading's station was not one of them. Now it is lit too.
//  - the lobule slides that place a lesion name the same three stations (portal venule, sinusoids, central vein), whatever words the line uses, unless the slide's own `reads` says which.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RW_LOADERS } from '../src/decks/rw/copied/index.ts';
import { AG_IDS, loadAgDeck } from '../src/decks/ag/index.ts';
import { HP_IDS, loadHpDeck } from '../src/decks/hp/index.ts';
import type { CopiedSlide } from '../src/decks/hp/types.ts';
import { figurePlan } from '../src/ui/deck/figure-plan.ts';
import { TARGETS_FIG } from '../src/scene/labels/figure2d.copied.ts';
import { STATIONS } from '../src/scene/labels/stations.ts';

const decks: { id: string; slides: CopiedSlide[] }[] = (await Promise.all([
  ...Object.values(RW_LOADERS).map((l) => l()), ...AG_IDS.map((id) => loadAgDeck(id)), ...HP_IDS.map((id) => loadHpDeck(id)),
])) as never;
const slides = decks.flatMap((d) => d.slides.map((s, i) => ({ s, at: `${d.id}#${i + 1}` })));
const STATION_IDS = new Set(STATIONS.map((x) => x.id));

test('every slide that lights stations lights each of its key readings that stands at a station, in the station colour', () => {
  let checked = 0;
  for (const { s, at } of slides) {
    if (!s.key) continue;
    const own = figurePlan({ ...s, key: [] } as never);
    if (!Object.keys(own.tones).length) continue;
    const p = figurePlan(s);
    for (const k of s.key as string[]) {
      const node = TARGETS_FIG[k]?.node;
      if (!node || !STATION_IDS.has(node)) continue;
      checked++;
      assert.ok(p.tones[node], `${at}: key reading "${k}" (${node}) stands unlit among lit stations`);
      assert.equal(p.tones[node], own.tones[node] ?? TARGETS_FIG[k]!.tone, `${at}: ${node} takes its own colour`);
    }
  }
  assert.ok(checked > 5, `walked ${checked} key readings`);
});

test('Budd-Chiari: the right hepatic vein (the FHVP, the slide\'s key reading) is lit beside the right atrium the line names', () => {
  const post = decks.find((d) => d.id === 'sites')!.slides.find((s) => s.id === 'post')!;
  const p = figurePlan(post);
  assert.equal(p.tones.RHV, 'hv');
  assert.ok(p.tones.RA);
  assert.ok(p.labels.includes('RHV'));
});

test('a slide that lights nothing lights nothing more (nothing is dimmed there, so nothing needs lighting)', () => {
  for (const { s, at } of slides) {
    const own = figurePlan({ ...s, key: [] } as never), p = figurePlan(s);
    if (!Object.keys(own.tones).length) assert.deepEqual(p.tones, own.tones, `${at}`);
  }
});

test('the sites deck\'s lobule slides name one set of stations: the portal venule, the sinusoids and the central vein', () => {
  const lobule = decks.find((d) => d.id === 'sites')!.slides.filter((s) => s.callout);
  assert.ok(lobule.length >= 3, 'the three lobule slides');
  for (const s of lobule) assert.deepEqual(figurePlan(s).callout?.reads, ['triad', 'sin', 'cv'], s.id);
});
