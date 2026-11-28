// The decks of batch B13b in the registry: one lazy line each (its data is a chunk of its own, read when the talk opens). The HVPG deck is the slice's, in hvpg.ts.
import { splitExtra } from '../overlay.ts';
import type { Deck } from '../schema.ts';
import { loadBakedDeck, trustBaked } from '../../ui/charts/baked/store.ts';
import { HP_DECKS, loadHpDeck } from './index.ts';
import { toDeck } from './deck.ts';

export function registerHpDecks(register: (d: { id: string; slides: number; load(): Promise<Deck> }) => void): void {
  for (const d of HP_DECKS) if (d.id !== 'hvpg') register({ id: d.id, slides: d.slides + splitExtra(d.id), load: async () => { const c = (await Promise.all([loadHpDeck(d.id), loadBakedDeck(d.id)]))[0]; trustBaked(c); return toDeck(c); } });
}
