// What a threshold event says to a clinician. The engine names an event in its own voice for its own readers ("Lymph formation exceeds lymphatic drainage capacity", "wall stress ...
// (index = ΔP·r / w)"); History, a case's stop card and the Over time list are read by physicians, so the line is said here once, by the event's id, wherever an event becomes an entry
// (a live patient's timeline/model.ts, a model patient's baked history histories/entries.ts). An event with no line here is already in clinical words and passes through. The engine copy is not
// edited (AGENTS.md): tests/event-words.test.ts reads its events and fails when one speaks in engine words and has no line here.

/** The sentence for an event's id, from the engine's own (its numbers, a cut-off or a share, are kept). */
const SAY: readonly [match: (id: string) => boolean, say: (raw: string) => string][] = [
  [(id) => id === 'RED_WALE', () => 'The wall of the varix is under high tension and close to tearing.'],
  [(id) => id === 'ASCITES_FORMING', () => 'Fluid is forming in the abdomen faster than the lymphatics can drain it.'],
  [(id) => id === 'LIVER_HYPOPERFUSION', (raw) => raw.replace(/^Total sinusoidal flow is /, 'Blood flow through the liver is ')],
  [(id) => id === 'INTRAHEPATIC_REVERSAL', () => 'Hepatic arterial blood flows backward out of the liver through the portal branches (typical after a TIPS).'],
  [(id) => id.startsWith('COLL_'), (raw) => raw.replace(/^(\d+)% of splanchnic inflow now takes this route\.$/, 'About $1% of the splanchnic inflow now runs through this collateral.')],
];

/** The words in the engine's voice that a physician should not meet (the test reads the engine's events for them). */
export const ENGINE_VOICE = /modeled|\bindex\b|ΔP|exceeds|sinusoidal flow|lymph formation|splanchnic inflow now takes/i;

/** An event's detail for the page: the line above when the event has one, else the engine's own. */
export function eventDetail(evId: string | undefined, raw: string | undefined): string | undefined {
  if (!evId || !raw) return raw;
  for (const [match, say] of SAY) if (match(evId)) return say(raw);
  return raw;
}
/** Whether an event's id has a line here. */
export const hasEventWords = (evId: string): boolean => SAY.some(([match]) => match(evId));
