// The scene's frame as a list of systems (R6). Each system has an id and a `step` that says whether it still moves; `runSystems` runs ALL of them in order
// (never `a() || b()`: a system that follows a moving one must still run), ORs the answers and adds each one's cost to `totals[id]`, which is what ?perf and the
// audit read to name the system that makes a frame slow. A new system is one entry in the list, and its name in ?perf is its id.
export interface FrameSystem<C> { readonly id: string; step(ctx: C): boolean }

/** What the scene's systems hand each other within one frame (the time, and what an earlier system worked out that a later one needs). */
export interface FrameCtx {
  /** page time of this frame, ms */
  now: number;
  /** ms since the last scene update (at most 100) */
  dt: number;
  /**
   * the ids of systems whose "still moving" this frame is AMBIENT only (the flow marks going round, nothing eased):
   * a frame asked only by those runs at the ambient rate (clock/frame.ts)
   */
  ambient: Set<string>;
}

/**
 * Runs every system once, in order. Returns whether any still moves; `movers` (when given) is filled with the ids of the ones that do
 * (?perf names them: a figure that never rests is found by name).
 */
export function runSystems<C>(systems: readonly FrameSystem<C>[], ctx: C, totals: Record<string, number>, now: () => number, movers?: string[]): boolean {
  let moving = false;
  if (movers) movers.length = 0;
  for (const s of systems) {
    const t0 = now();
    if (s.step(ctx)) { moving = true; movers?.push(s.id); }
    totals[s.id] = (totals[s.id] ?? 0) + (now() - t0);
  }
  return moving;
}
