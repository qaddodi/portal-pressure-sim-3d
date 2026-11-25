// The talk builds the lobule and the sinusoid ahead of the slide that dives into them (Mohammad, 25 Nov, 4 to 5: "zooms out, glitches, stops, then zooms
// into the lobule"; his rule: from wherever the camera is, ease straight in, no pause). The parts were built only while the page stood still, which a slide
// with the catheter moving never does, so the dive waited on Next for a build of a second or more (the headless recording of HVPG 4 to 5: held all 9 s after
// Next, never built in the 8 s on slide 4). scene-link.ts asks for them from the talk's start while a dive is still to come (presenter-machine.ts microAhead).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { stopsOf, viewAt, next, microAhead, type Pos } from '../src/ui/deck/presenter-machine.ts';

const micro = (v: string | undefined) => v === 'lobule' || v === 'sinusoid';

test('every dive into the lobule or the sinusoid, in every deck, is seen coming from the talk\'s start, two steps ahead on request, and nothing else is', async () => {
  let dives = 0;
  for (const { id } of UI.decks as readonly { id: string }[]) {
    const stops = stopsOf((await loadBuiltin(id))!);
    for (let p: Pos = { stop: 0, beat: 0 }; ; ) {
      const n1 = next(stops, p), n2 = next(stops, n1), end = n1.stop === p.stop && n1.beat === p.beat;
      const coming = !end && (micro(viewAt(stops, n1).scene?.view) || (!(n2.stop === n1.stop && n2.beat === n1.beat) && micro(viewAt(stops, n2).scene?.view)));
      assert.equal(microAhead(stops, p, 2), coming, `${id} ${p.stop}.${p.beat}`);
      if (coming) assert.ok(microAhead(stops, { stop: 0, beat: 0 }), `${id}: seen from the title`);
      if (!end && micro(viewAt(stops, n1).scene?.view) && !micro(viewAt(stops, p).scene?.view)) {
        dives++;
        assert.ok(microAhead(stops, p), `${id}: the parts are asked for on the slide before the dive (${p.stop}.${p.beat})`);
      }
      if (end) break;
      p = n1;
    }
  }
  assert.ok(dives >= 10, `the decks' dives were found (${dives})`);
});
