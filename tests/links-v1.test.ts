// Old links keep working (production review 21 Nov, P1-8): testers and lecture slides hold links from the beta. tests/fixtures/links-v1.json froze every talk (id and slide count) and one share
// link per patient on 21 Nov 2026. A later build must open the same talk (by the id or by an alias in deck-of.ts), have at least as many slides, and read each patient's link back to that patient.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { builtinDecks, lazyDecks } from '../src/decks/registry.ts';
import { knownTalk, talkId } from '../src/ui/deck/deck-of.ts';
import { parseDeepLink } from '../src/ui/shell/deep-link.ts';
import { readShare } from '../src/ui/shell/share.ts';
import { UI } from '../src/ui/strings.generated.ts';

const fx = JSON.parse(readFileSync(new URL('./fixtures/links-v1.json', import.meta.url), 'utf8')) as { talks: { id: string; slides: number }[]; presets: { id: string; code: string }[] };
const slidesNow = (id: string): number => { const d = [...builtinDecks()].find((x) => x.id === id); if (d) return (d as { stops?: unknown[]; slides?: unknown[] }).stops?.length ?? (d as { slides?: unknown[] }).slides?.length ?? 0; return lazyDecks().find((x) => x.id === id)?.slides ?? 0; };

test('every talk of the beta still opens by its id, with at least its slides', () => {
  assert.ok(fx.talks.length >= 40);
  for (const t of fx.talks) {
    assert.ok(knownTalk(t.id), `the talk "${t.id}" no longer opens: rename it only with an alias in src/ui/deck/deck-of.ts DECK_ALIAS`);
    const now = slidesNow(talkId(t.id));
    assert.ok(now >= t.slides, `"${t.id}" had ${t.slides} slides in the beta, now ${now}: a link to its last slide would open elsewhere`);
  }
});

test('a talk link names the talk and the slide as it always did', () => {
  for (const t of fx.talks) {
    assert.deepEqual(parseDeepLink(`?script=${t.id}&slide=1`).script, { id: t.id, slide: 0 });
    assert.deepEqual(parseDeepLink(`?script=${t.id}&slide=${t.slides}`).script, { id: t.id, slide: t.slides - 1 });
  }
});

test('every patient link of the beta still reads back to that patient', () => {
  const ids: string[] = UI.presets.map((p) => p.id);
  assert.equal(fx.presets.length, 20);
  for (const p of fx.presets) {
    assert.ok(ids.includes(p.id), `the patient "${p.id}" was renamed or removed: its old links would open the healthy patient`);
    const s = readShare(`#s=${p.code}`, ids);
    assert.ok(s, `the link of "${p.id}" can no longer be read`);
    assert.equal(s.preset, p.id);
    assert.equal(s.missing, undefined);
    assert.equal(s.view, 'anatomic');
  }
});
