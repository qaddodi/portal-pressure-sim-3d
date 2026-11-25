// The capture's jump to a picked slide (Random 5, 10, 25, ticked slides, ?promotion): straight to the slide, never through the slides before it,
// and for the audit's pictures to the slide's END STATE, the one a person is left on after the last Next within it
// (its last beat, its last page, its procedure done, its readings taken). Tool-only: the app's own shape changes always ease;
// this is the audit's hand, not the app's. Pure apart from the three calls the walker makes; tests/capture-jump.test.ts.

/** What the jump may do to the talk, and wait for. */
export interface JumpWalker {
  /** The stop the talk is on now. */
  stop(): number;
  /** Next or Back as a person presses it; false when it did nothing (the end of the talk). */
  move(m: 'next' | 'back'): boolean;
  /** Waits until the page is still after a press (the camera, the cards, the fades), as the picture's own wait does. */
  still(): Promise<void>;
}

/** The slides asked for in one talk, as stops, in talk order (a pick is `deck:stop` names). */
export function wantedStops(pick: ReadonlySet<string> | null | undefined, deck: string): number[] {
  return [...(pick ?? [])].map((x) => x.split(':')).filter((x) => x[0] === deck).map((x) => Number(x[1])).filter((k) => Number.isFinite(k)).sort((a, b) => a - b);
}

/** True when the first stop to land on has to be reached by a jump BACK: a jump forward meets the slide's case card, a jump back lands on the slide itself (presenter-machine `goto`). */
export const needsBackJump = (at: number, k: number, stops: number): boolean => k < stops - 1 && at <= k;

/**
 * From the slide's start to its end state: Next while the press stays within the stop, each press waited for.
 * The press that would leave the stop is the end: it is let land, and Back brings the talk to the slide it left,
 * which is what a person's Back does (a procedure slide stands done, a split card on its last page, a slide with beats on its last view).
 * 'lost' says the Back did not return (the caller jumps again and says so); 'stuck' says the stop never ended within `max` presses.
 */
export async function stepToEnd(w: JumpWalker, k: number, max = 40): Promise<'end' | 'lost' | 'stuck'> {
  for (let i = 0; i < max; i++) {
    if (!w.move('next')) return 'end';   // (the end of the talk: nothing to leave)
    await w.still();
    if (w.stop() !== k) {
      w.move('back');
      await w.still();
      return w.stop() === k ? 'end' : 'lost';
    }
  }
  return 'stuck';
}
