// The rule behind the 3D overlay (src/decks/overlay.ts): everything the 3D app adds to a slide is data on the slide, merged at load by ONE function for EVERY deck, so nothing downstream
// looks a deck or a slide up by name and a deck you author yourself gets the same behaviour. This pins the general rule, not each entry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { UI } from '../src/ui/strings.generated.ts';
import { OVERLAY, OVERLAY_FIELDS, withOverlay } from '../src/decks/overlay.ts';
import { SOURCE_IDS, loadSource } from '../src/decks/source.ts';
import { AG_LOADERS } from '../src/decks/ag/raw.ts';
import { HP_LOADERS } from '../src/decks/hp/raw.ts';
import { RW_LOADERS } from '../src/decks/rw/copied/index.ts';
import { FIELD_HOME } from '../src/decks/hp/fields.ts';
import { planSlide } from '../src/decks/hp/plan.ts';
import { toDeck } from '../src/decks/hp/deck.ts';
import type { CopiedDeck } from '../src/decks/hp/types.ts';

const ids: string[] = UI.decks.map((d) => d.id);

test('every built-in deck is read through one loader, and there are as many as the 2D menu lists', () => {
  assert.deepEqual([...SOURCE_IDS].sort(), [...ids].sort());
});

test('every overlay entry names a slide that exists, and carries only fields the overlay owns and the field table knows', async () => {
  const slides = new Map<string, true>();
  for (const id of SOURCE_IDS) for (const s of (await loadSource(id)).slides) slides.set(`${id}/${s.id}`, true);
  assert.ok(Object.keys(OVERLAY).length > 20, 'the overlay has its entries');
  for (const [key, o] of Object.entries(OVERLAY)) {
    assert.ok(slides.has(key), `${key} is in the overlay and no deck has that slide`);
    for (const f of Object.keys(o)) { assert.ok((OVERLAY_FIELDS as readonly string[]).includes(f), `${key}: ${f} is not an overlay field`); assert.ok(f in FIELD_HOME, `${key}: ${f} has no home in hp/fields.ts`); }
  }
});

test('the copies carry no overlay field (a re-copy cannot touch what the 3D app adds), and the overlay lands on the loaded deck', async () => {
  for (const [id, load] of Object.entries({ ...AG_LOADERS, ...HP_LOADERS, ...RW_LOADERS })) {
    for (const s of ((await load()) as CopiedDeck).slides) for (const f of OVERLAY_FIELDS) assert.ok(!(f in s), `${id}/${s.id}: the copy has the 3D field ${f}`);
  }
  const [key, o] = Object.entries(OVERLAY).find(([, x]) => x.frame)!;
  const [deck, slide] = key.split('/') as [string, string];
  const got = (await loadSource(deck)).slides.find((s) => s.id === slide)!;
  assert.deepEqual(got.frame, o.frame);
});

test('laying the overlay on twice changes nothing, for every deck', async () => {
  for (const id of SOURCE_IDS) { const once = await loadSource(id); assert.deepEqual(withOverlay(once), once, id); }
});

test('an overlay field does its job from the slide alone: a frame moves the camera, a `scores` and an `also` reach the Slide', async () => {
  const [fk] = Object.entries(OVERLAY).find(([, x]) => x.frame && x.frame.cam !== 'route-stations')!;
  const [d, sid] = fk.split('/') as [string, string];
  const deck = await loadSource(d);
  const i = deck.slides.findIndex((s) => s.id === sid), s = deck.slides[i]!;
  const bare = { ...s } as Record<string, unknown>; delete bare.frame;
  assert.notDeepEqual(planSlide(d, s, i).cam, planSlide(d, bare as never, i).cam, `${fk}: its frame changes its camera`);
  const played = toDeck(deck);
  for (const [key, o] of Object.entries(OVERLAY)) {
    const [dk, sk] = key.split('/') as [string, string];
    if (dk !== d && !(o.scores || o.also)) continue;
    const p = dk === d ? played : toDeck(await loadSource(dk));
    const slide = p.slides.find((x) => x.id === sk)!;
    if (o.scores) assert.deepEqual(slide.scores, o.scores, key);
    if (o.also) assert.equal(slide.also, o.also, key);
  }
});

// ---- the rule in the source: no table keyed by deck/slide outside the overlay, and no reader of a deck's copy but the one loader ----
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : []; });
const SRC = walk('src').filter((f) => !/\.copied\.ts$|\.generated\.ts$|[\\/]rw[\\/]copied[\\/]/.test(f));

test('no table in the app is keyed by "deck/slide" except the overlay (a slide\'s 3D data goes on the slide, not in a lookup)', () => {
  const key = new RegExp(`^\\s*['"](${ids.join('|')})/[a-z0-9-]+['"]\\s*:`, 'm');
  const bad = SRC.filter((f) => !f.includes(join('src', 'decks', 'overlay')) && key.test(readFileSync(f, 'utf8'))).map((f) => relative('.', f));
  assert.deepEqual(bad, [], 'move these entries into src/decks/overlay.ts (or src/decks/overlay/) as slide fields');
});

test('only source.ts reads a deck\'s lazy loaders (every other reader goes through loadSource and so gets the overlay)', () => {
  const bad = SRC.filter((f) => !/[\\/]decks[\\/]source\.ts$/.test(f) && /\b(AG_LOADERS|HP_LOADERS|RW_LOADERS)\b/.test(readFileSync(f, 'utf8')) && !/[\\/]decks[\\/](ag|hp)[\\/](raw|index)\.ts$/.test(f)).map((f) => relative('.', f));
  assert.deepEqual(bad, []);
});
