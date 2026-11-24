// The engine starts the moment the app's code begins to run, before the rest of its modules are evaluated (main.tsx imports this second, right after boot/started.ts).
// Root cause of the long splash and its freeze (24 Nov, "the splash takes long to load, and a few seconds in it snags"): the simulation's boot was called at the END of main.tsx's start(), and by then every module had been
// evaluated, which builds the whole 3D scene (the figure's tubes, skins and the Lobule's network: about 1 s of the main thread on a laptop, three to five on a phone) in ONE task. The worker, a thread of its own, sat unstarted
// through all of it, then did its work while the main thread had nothing left to do but wait for it, and the cover's bar stood at "Starting Hales Engine" the whole time without the engine having started. Started here, the
// worker computes the first patient while the main thread builds the scene: the two overlap, and the splash is the longer of them, not their sum. tests/boot-engine-early.test.ts holds the order.
import { bootEngine } from '../engine/boot.ts';

/** The engine's first patient, started now. Never rejects: a failure is left in the engine store (status 'crashed' and its reason), which main.tsx's start() reads and shows with Reload. */
export const engineBooted: Promise<unknown> = bootEngine().catch((err) => { console.error(err); });
