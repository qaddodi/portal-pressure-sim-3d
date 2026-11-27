// One name per lens on a screen (review F-D11, owner W19, 27 Nov). A slide's own buttons ("Pressure | Pressure drop") and the lens key under the figure ("Pressure drop  Low to High") never carry the same
// lens name at once: where a button names the key's lens the key keeps its unit and scale and leaves the name out. Held on every slide of every deck, in node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stopsOf } from '../src/ui/deck/presenter-machine.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { UI } from '../src/ui/strings.generated.ts';
import { labelsAt, controlNamesOf } from '../src/scene/labels/deck-link.ts';
import { keyModel, keyNameShown } from '../src/scene/labels/key.ts';

test('keyNameShown: a key names its lens unless a button of the slide already does', () => {
  assert.equal(keyNameShown('Pressure drop', []), true);
  assert.equal(keyNameShown('Pressure drop', ['pressure', 'pressure drop']), false);
  assert.equal(keyNameShown('Pressure', ['pressure drop']), true, 'a longer name is another name');
});

test('on every slide of every deck a lens name is on the screen once at most: the buttons say it, or the key does', async () => {
  let keyed = 0, hidden = 0;
  const dupes: string[] = [];
  for (const d of UI.decks as readonly { id: string }[]) {
    const stops = stopsOf((await loadBuiltin(d.id))!);
    stops.forEach((s, i) => {
      if (s.kind !== 'slide') return;
      for (const beat of s.slide.vignette || s.slide.question ? [0, 1] : [0]) {
        const at = labelsAt(stops, { stop: i, beat }, d.id), m = at.key ? keyModel(at.key, 'light') : null;
        if (!m) continue;
        keyed++;
        const buttons = (at.controls ?? []).filter((n) => n === m.name.trim().toLowerCase()).length, shown = keyNameShown(m.name, at.controls ?? []);
        if (!shown) hidden++;
        if (buttons + (shown ? 1 : 0) > 1) dupes.push(`${d.id}#${i}: "${m.name}" on a button and on the key`);
        assert.deepEqual(at.controls ?? [], controlNamesOf(s.slide), `${d.id}#${i}: the labels carry the slide's own button names`);
      }
    });
  }
  assert.ok(keyed > 300, `${keyed} keyed slides judged`);
  assert.ok(hidden >= 2, `${hidden} keys left their name to a button (02.3 and 03.12.2 at least)`);
  assert.deepEqual(dupes, []);
});
