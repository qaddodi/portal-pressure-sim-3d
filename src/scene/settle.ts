/**
 * A bounded settling loop that SAYS when it ran out (J8, 28 Nov review). Three loops of the figure's layout (the node spacing of a host in placed-network.ts,
 * the merge passes and the joins of skin/cuts.ts) used to stop after a fixed number of rounds whether or not they had settled, so a layout that did not settle
 * looked exactly like one that did. This runs `step` (true: it changed something) for at most `max` rounds and returns whether a round changed nothing.
 */
export function settleRounds(max: number, step: (round: number) => boolean): boolean {
  for (let round = 0; round < max; round++) if (!step(round)) return true;
  return false;
}
