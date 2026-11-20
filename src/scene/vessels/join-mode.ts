// The "Smooth vessel joins" switch as the vessel code sees it (Settings > Figure depth, `useSettings.getState().smoothJoins`). A deliberate step beyond the 2D figure, so every new code
// path in src/scene/vessels reads this and nothing else: off, the figure is exactly the 2D rule's (the node tests that predate the switch run with it off, its default here). The scene
// copies the setting in at start and on every change (scene.ts `useSmoothJoins`), then rebuilds the tubes in place, so a toggle applies live.
let on = false;
/** Whether vessel joins are drawn as one smooth tube (the switch's present value). */
export const smoothJoinsOn = (): boolean => on;
/** The scene sets it from the settings; a test sets it to look at one mode. Returns whether it changed. */
export function setSmoothJoins(v: boolean): boolean { const was = on; on = v; return was !== v; }
