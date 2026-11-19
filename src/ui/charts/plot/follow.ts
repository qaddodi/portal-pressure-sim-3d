// A chart head that glides after its goal (2D: display-state.js headStep): 1 - exp(-dt / tau) of the way each frame, the same curve at 15, 60 or 120 Hz.
export const HEAD_TAU = 0.1;
/** The first step of a run after rest has no frame before it to measure from: it is taken as one frame of a 60 Hz screen. */
export const HEAD_DT0 = 1 / 60;
export const headStep = (shown: number, goal: number, dt: number, tau = HEAD_TAU) => shown + (goal - shown) * (1 - Math.exp(-Math.min(0.1, Math.max(0, dt)) / tau));
