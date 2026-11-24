// Where the shell mounts the talk's UI (the chunk itself: ui/shell/deck-ui-load.ts).
import { createElement, useEffect, useState } from 'react';
import { deckUi, loadDeckUi } from './deck-ui-load.ts';

/** The talk's UI where the shell mounts it: at once when it is in, else once it is (a talk started any other way than `startTalk`, a test or the debug page, still gets it). */
export function DeckUiSlot() {
  const [Ready, set] = useState(deckUi);
  useEffect(() => { if (!Ready) void loadDeckUi().then((ok) => { if (ok) set(() => deckUi()); }); }, [Ready]);
  return Ready ? createElement(Ready) : null;
}
