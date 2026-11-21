// The "Smooth vessel joins" switch as the vessel code sees it (always on in the app since 21 Nov 2026: the Settings switch was removed; the scene sets it true before any tube is built). A deliberate step beyond the 2D figure, so every new code
// path in src/scene/vessels reads this and nothing else: off, the figure is exactly the 2D rule's (the node tests that predate the switch run with it off, its default here). Tests still set it to look at the off drawing.
let on = false;
/** Whether vessel joins are drawn as one smooth tube (the switch's present value). */
export const smoothJoinsOn = (): boolean => on;
/** The scene sets it from the settings; a test sets it to look at one mode. Returns whether it changed. */
export function setSmoothJoins(v: boolean): boolean { const was = on; on = v; return was !== v; }
