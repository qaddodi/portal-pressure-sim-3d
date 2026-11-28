// What exists, read from the app: the talks with their slide counts, the cases, the lenses, the looks and the sizes. The `World` a request is resolved against (resolve.ts). The node runner
// (scripts/audit/world.mjs), ?stress and the capture all read it here, so a request names the same things in every runner. A talk's slide count is read without loading the talk.
import { deckOrder, builtinDeck, lazyDecks } from '../../../decks/registry.ts';
import { UI } from '../../strings.generated.ts';
import { HISTORIES } from '../../histories/index.generated.ts';
import { LOOK_IDS } from '../../../looks/looks.ts';
import { DEVICES } from '../devices.ts';
import type { World } from './resolve.ts';

export function appWorld(): World {
  const lazy = new Map(lazyDecks().map((d) => [d.id, d.slides]));
  return {
    decks: deckOrder().map((id) => ({ id, slides: builtinDeck(id)?.slides.length ?? lazy.get(id) ?? 0 })),
    cases: HISTORIES.map((h) => h.id),
    lenses: UI.lenses.map((l) => l.id),
    looks: [...LOOK_IDS],
    sizes: DEVICES.map((d) => d.id),
  };
}
