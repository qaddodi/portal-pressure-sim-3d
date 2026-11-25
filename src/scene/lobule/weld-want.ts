// Who asks the Lobule for its baked weld plan when the page is quiet. The plan (1.7 MB) is no part of the first download: the quiet ladder (boot/warm.ts, rung `welds`)
// reads the file in once the cover is up and the link is not saving
// data, then calls `wantWelds`, which the scene has pointed at itself (`setWeldWanter`, scene.ts) so the ladder never imports the scene. A dive asks for it by itself,
// sooner (scene.ts buildMicroIdle).
let wanter: (() => void) | null = null;
/** The scene takes the ladder's call (null: it lets go). */
export function setWeldWanter(fn: (() => void) | null): void { wanter = fn; }
/** The plan is wanted now: the Lobule starts to lay it in (the file is already read in, or is read now). */
export function wantWelds(): void { wanter?.(); }
