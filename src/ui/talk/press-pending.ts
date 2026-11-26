// A press on a slide's own control (a chip, a toggle, a slider) is carried out in steps that finish later than the click: the engine works the patient out off screen, the charts then read it, the
// figure then eases to it. Anything that must see the slide AFTER the press (the audit's capture, a test) has to know the press is still on its way. Every control that finishes later than its click
// holds a token here for as long as it is unfinished, and `pressWaiting()` says whether any is. One counter for every control, so a new control cannot be forgotten by the capture.
// Root cause of capture 36b7deac, Sites and causes 10/14: the five chips gave one and the same chart, because the capture's "is the page still?" check did not know a chip's answer was
// still being worked out.
let open = 0;
const why = new Map<number, string>();
let next = 1;

/** A press has begun and its result is not yet on the screen. Returns the function that says it is (safe to call twice). */
export function pressBegin(what: string): () => void {
  const id = next++;
  open++; why.set(id, what);
  return () => { if (why.delete(id)) open--; };
}
/** True while any control's press is unfinished. */
export const pressWaiting = (): boolean => open > 0;
/** What is unfinished, in words (for the capture's note). */
export const pressWhat = (): string => [...why.values()].join(', ');
/** Runs a press that finishes later: the token is held until the promise ends, however it ends. */
export async function pressHeld<T>(what: string, run: () => Promise<T>): Promise<T> {
  const done = pressBegin(what);
  try { return await run(); } finally { done(); }
}
