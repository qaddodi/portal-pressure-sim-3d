// What the menu can open in the 3D app: the talks and patients that exist here, with the 2D app's titles, topics and summaries (strings.generated.ts).
// A talk is listed as soon as its deck is registered here (src/decks/*.ts); the batch that ports a deck adds one line.
import { UI } from '../strings.generated.ts';
import { HVPG_DECK } from '../../decks/hvpg.ts';

export interface DeckMeta { id: string; title: string; short: string | null; summary: string | null; topic: string | null; level: string | null; minutes: number | null; slides: number }
const meta = (id: string): DeckMeta => UI.decks.find((d) => d.id === id) as unknown as DeckMeta;

/** The talks the 3D app can play: id → how many slides it has here. */
export const PLAYABLE: Record<string, number> = { [HVPG_DECK.id]: HVPG_DECK.slides.length };
export const isPlayable = (id: string) => id in PLAYABLE;

/** Topic sections of the menu's Present list, in the 2D order, holding only the talks that play here. */
export function presentTopics(): { topic: string; label: string; decks: DeckMeta[] }[] {
  return UI.topics.map((t) => ({ topic: t.topic, label: t.label, decks: t.decks.filter((d) => isPlayable(d.id)).map((d) => meta(d.id)) })).filter((t) => t.decks.length);
}

/** Patients, grouped as the 2D menu groups them. */
export function patientGroups(): { group: string; patients: { id: string; label: string }[] }[] {
  const out: { group: string; patients: { id: string; label: string }[] }[] = [];
  for (const p of UI.presets) {
    let g = out.find((x) => x.group === p.group);
    if (!g) out.push(g = { group: p.group, patients: [] });
    g.patients.push({ id: p.id, label: p.label });
  }
  return out;
}
export const patientLabel = (id: string) => UI.presets.find((p) => p.id === id)?.label ?? '';
