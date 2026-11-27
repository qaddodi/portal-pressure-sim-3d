// The HVPG talk's baked chart data (public/baked/charts-<engine>-hvpg.json), laid in before the talk opens: the one step every lazy talk's `load` takes (hp/register.ts, all.ts) and the HVPG talk,
// which is in memory from the start, would otherwise skip. The file is made from the copied deck (src/decks/source.ts, the same slides in the same order) and matched with it by signature.
import { loadBakedDeck, trustBaked } from '../ui/charts/baked/store.ts';
import { loadSource } from './source.ts';

export async function prepareHvpg(): Promise<void> {
  const [source] = await Promise.all([loadSource('hvpg'), loadBakedDeck('hvpg')]);
  trustBaked(source);
}
