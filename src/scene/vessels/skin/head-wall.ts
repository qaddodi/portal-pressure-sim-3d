// THE SKIN'S WALL COORDINATE FOR THE FLOW HEADS (the chevrons). A head stops short of the ink: whole to 0.90 of the way to the wall, gone by 0.96. On a TUBE the way to the wall is the pixel's across, the mesh normal's component on the
// screen's sideways axis: a circular section makes that the lateral position over the half width, ink included, so 1 is the outer edge of the line. On a SKIN the same number is only true inside an arm's own cylinder: in a fillet the
// surface normal turns with the blend (a silhouette 30 to 60 degrees off the arm's heading has an arm across of 0.5 to 0.87), so an arm's own gate stood open on the outline itself.
// So the skin asks the pixel's own distance to the outline, which the shader already has (skinSdPx, device px, negative inside), and turns it into the tube's number: the lateral distance from the axis (the lumen's radius R plus sdPx)
// over the mesh's half width (R plus the line). On a cylinder that IS the tube's across, so the two sides of a seam gate alike; in a fillet it is 1 at the line's outer edge wherever the outline runs.
/** The head's wall rule: a mark is whole to HEAD_WALL_FROM of the way to the wall and gone by HEAD_WALL_TO (never on the ink). */
export const HEAD_WALL_FROM = 0.90, HEAD_WALL_TO = 0.96;
/** The wall rule on the wall coordinate `e`: 1 inside, 0 at the ink. */
export const headWall = (e: number): number => { const t = Math.min(1, Math.max(0, (Math.abs(e) - HEAD_WALL_FROM) / (HEAD_WALL_TO - HEAD_WALL_FROM))); return 1 - t * t * (3 - 2 * t); };
/** The same, as the skin shader writes it. */
export const HEAD_WALL_GLSL = /* glsl */ `float headWall(float e) { return 1.0 - smoothstep(${HEAD_WALL_FROM.toFixed(2)}, ${HEAD_WALL_TO.toFixed(2)}, abs(e)); }`;
/** The wall coordinate of a skin pixel: `rPx` the lumen's radius at the axis' depth, `sdPx` the signed distance to the outline (negative inside), `inkPx` the line's width, all in device px. 0 deep inside, R / (R + ink) on the outline, 1 at the line's outer edge. */
export const skinWallJs = (rPx: number, sdPx: number, inkPx: number): number => Math.min(1, Math.max(0, (rPx + sdPx) / Math.max(rPx + inkPx, 1e-3)));
/** The same, as the skin shader writes it (a GLSL function of the three numbers). */
export const SKIN_WALL_GLSL = /* glsl */ `float skinWall(float rPx, float sdPx, float inkPx) { return clamp((rPx + sdPx) / max(rPx + inkPx, 1.0e-3), 0.0, 1.0); }`;
