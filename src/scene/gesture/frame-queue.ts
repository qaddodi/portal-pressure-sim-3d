// The gestures' glides (the spring-back, the flick, the wheel glide, the turn's momentum) run on the one clock. They ask for "the next frame" the way a
// requestAnimationFrame callback would; this queue holds the asks, asks the clock for exactly one frame, and runs them in the clock's tween phase. Nothing is
// scheduled when nothing asked, and nothing here calls requestAnimationFrame.
export function createFrameQueue(invalidate: () => void) {
  let nextId = 1;
  let queue = new Map<number, (now: number) => void>();
  return {
    ask(cb: (now: number) => void): number {
      const id = nextId++;
      queue.set(id, cb);
      invalidate();
      return id;
    },
    cancel(id: number): void { queue.delete(id); },
    /** Runs every ask made before this frame (asks made while it runs wait for the next one). */
    run(now: number): void {
      if (!queue.size) return;
      const due = queue;
      queue = new Map();
      for (const cb of due.values()) cb(now);
    },
    get pending(): number { return queue.size; },
  };
}
