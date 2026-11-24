// A case slide's card comes first: the camera stays put while the card shows and the patient blends in, and the slide's own pan or zoom starts at Next on the card (24 Nov 2026, Mohammad).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/ui/deck/scene-link.ts', 'utf8');
test('on the case beat the scene link frames nothing once a shot is up: no showShot, no frameRoom, no refit', () => {
  const at = src.indexOf("v.words === 'case' && shot !== null");
  assert.ok(at > 0, 'the case beat holds the camera');
  assert.ok(at < src.indexOf('sceneApi.showShot('), 'the hold is before the slide\'s move');
  assert.ok(at < src.indexOf('frameRoom(room, undefined, undefined, stepped)'), 'and before the room refit');
  assert.match(src.slice(at, at + 160), /owed = owed \|\| stepped; return;/, 'the step on to the slide is still owed, so Next on the card makes the move');
});
test('the case beat is the first beat of a case slide, so Next on the card is the move to the slide\'s own framing', async () => {
  const { viewAt, stopsOf } = await import('../src/ui/deck/presenter-machine.ts');
  const { loadBuiltin } = await import('../src/decks/registry.ts');
  const { UI } = await import('../src/ui/strings.generated.ts');
  let seen = 0;
  for (const d of UI.decks as readonly { id: string }[]) {
    const deck = (await loadBuiltin(d.id))!, stops = stopsOf(deck);
    stops.forEach((s, i) => { if (s.kind === 'slide' && s.beats > 1 && viewAt(stops, { stop: i, beat: 0 }).words === 'case') { seen++; assert.notEqual(viewAt(stops, { stop: i, beat: 1 }).words, 'case'); } });
  }
  assert.ok(seen > 0, 'some deck has a case slide');
});
