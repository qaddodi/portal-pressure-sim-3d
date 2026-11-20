import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useUi } from '../src/ui/ui-store.ts';
import { useLabels } from '../src/scene/labels/store.ts';
import { linkLabelsToDeck } from '../src/scene/labels/deck-link.ts';
import { stopsOf } from '../src/ui/deck/presenter-machine.ts';
import { HVPG_DECK } from '../src/decks/hvpg.ts';

// Mohammad, 20 Nov: "when i go back to figure view, it seems that no labels are there anymore". Leaving a talk keeps the talk's store (stops, position) until the next talk
// opens; the labels followed only a change of position, so the last slide's catheter reading stayed and the figure's names stayed hidden under it (a catheter hides them).
test('leaving a talk clears what it asked of the labels: no catheter, no names asked for', () => {
  const stops = stopsOf(HVPG_DECK);
  const at = stops.findIndex((s) => s.kind === 'slide' && !!s.slide.cath);
  assert.ok(at > 0, 'the deck has a slide with a catheter');
  const ui = useUi.getState();
  ui.openDeck(HVPG_DECK, at); ui.setStops(stops, 0);
  const st = stops[at]!;
  useUi.setState({ pos: { stop: at, beat: st.kind === 'slide' ? st.beats - 1 : 0 } });
  const off = linkLabelsToDeck();
  try {
    assert.ok(useLabels.getState().cath, 'on that slide the catheter is on the labels');
    useUi.getState().openDeck(null);
    assert.equal(useLabels.getState().cath, null, 'leaving the talk takes it off');
    assert.equal(useLabels.getState().named.size, 0);
  } finally { off(); useUi.getState().setStops([]); }
});
