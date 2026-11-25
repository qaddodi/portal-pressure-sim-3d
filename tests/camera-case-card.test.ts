// A case card (Mohammad, 25 Nov, "Do it"): while it is up the camera stands back on the whole figure, fitted to the patient coming in, the chase camera off; swipe or Next is one move on to
// where the slide looks. Every deck, every case card: the rule is camera-ask.ts's, which the talk (scene-link.ts) and the every-slide flight (camera-every-slide*.test.ts) both use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { stopsOf, viewAt, cathPlace, next } from '../src/ui/deck/presenter-machine.ts';
import { cameraAsk } from '../src/ui/deck/camera-ask.ts';

test('every case card in every deck stands back on the whole figure with the chase off, and its Next is the slide\'s own ask', async () => {
  let cards = 0, onward = 0;
  for (const { id } of UI.decks as readonly { id: string }[]) {
    const stops = stopsOf((await loadBuiltin(id))!);
    stops.forEach((st, i) => {
      if (st.kind !== 'slide') return;
      for (let b = 0; b < st.beats; b++) {
        const p = { stop: i, beat: b }, v = viewAt(stops, p);
        if (v.words !== 'case') continue;
        cards++;
        const a = cameraAsk(v, cathPlace(stops, p));
        assert.deepEqual(a, { view: 'body', shot: 'play', chase: false, own: true }, `${id} ${i}.${b}`);
        const n = next(stops, p), w = viewAt(stops, n), after = cameraAsk(w, cathPlace(stops, n));
        assert.notEqual(w.words, 'case', `${id} ${i}.${b}: one card, then the slide`);
        if (after.shot !== 'play' || after.view !== 'body') onward++;
      }
    });
  }
  assert.ok(cards >= 5, `the decks' case cards were found (${cards})`);
  assert.ok(onward > 0, 'the slides after their cards look somewhere of their own');
});
