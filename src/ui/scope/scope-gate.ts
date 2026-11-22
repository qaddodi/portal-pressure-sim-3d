// When the scope ring stands (2D scope-lens.js vxFrame / goneNow, as a pure step so a test runs it): the slide wants it and the patient has varices (or the slide is one where they
// grow: a time-lapse, a ramp, days passing, so the ring stands from its first frame and the lens shows them as they come). The ring comes on at once when the answer turns yes and goes only
// after the answer has been no for GONE_MS (a patient loading, or a size crossing the 2.5 mm cut-off with the beat, never takes it down), and never under an open lens. A balloon
// tamponade takes it at once: with a tube's balloon up there is no scope to look through (Mohammad, 6 Nov 2026: "remove the scope view button when there is a balloon tamponade").
/** How long the varices must be gone before the ring leaves a slide that shows them, ms. */
export const GONE_MS = 900;

export interface GateIn { want: boolean; grows: boolean; present: boolean; gastric: boolean; open: boolean }
export interface Gate { has: boolean; goneAt: number | null }
export const newGate = (): Gate => ({ has: false, goneAt: null });

/** One look at the model: the new gate, whether the lens must shut (the ring left under it), and how long until the gate wants looking at again (null: no wait pending). */
export function stepGate(g: Gate, i: GateIn, now: number): { gate: Gate; close: boolean; wake: number | null } {
  const seen = i.want && !i.gastric && (i.grows || i.present);
  if (!i.want) return { gate: { has: false, goneAt: null }, close: i.open, wake: null };
  if (seen) return { gate: { has: true, goneAt: null }, close: false, wake: null };
  if (!g.has) return { gate: { has: false, goneAt: null }, close: false, wake: null };
  if (i.gastric) return { gate: { has: false, goneAt: null }, close: i.open, wake: null };
  const at = g.goneAt ?? now, left = at + GONE_MS - now;
  if (left > 0) return { gate: { has: true, goneAt: at }, close: false, wake: left };
  // (an open lens goes on showing the esophagus: the ring goes once it is shut)
  if (i.open) return { gate: { has: true, goneAt: at }, close: false, wake: null };
  return { gate: { has: false, goneAt: null }, close: false, wake: null };
}
