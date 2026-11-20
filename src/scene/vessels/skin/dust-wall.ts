// THE SKIN'S WALL COORDINATE FOR THE DUST (Mohammad, 21 Nov: black dashes at the outline right at the seam rings, only with Blood streaks on).
// The dust stops short of the ink by the wall rule (blood/dust-glsl.ts dWall: whole to 0.90 of the way to the wall, gone by 0.96). On a TUBE the way to the wall is the pixel's across, the mesh normal's component on the screen's sideways axis: a
// circular section makes that the lateral position over the half width, ink included, so 1 is the outer edge of the line. On a SKIN the same number is only true inside an arm's own cylinder: in a fillet the surface normal turns with the
// blend (a silhouette 30 to 60 degrees off the arm's heading has an arm across of 0.5 to 0.87), so the arms' own gates stood open on the outline itself and a particle, with its ring of ink, was drawn against the line: dashes across the
// wall at the crotch and just inside each seam (on the real network 4 in 10 of the outline's pixels, tests/skin-dust-wall.test.ts).
// So the skin asks the pixel's own distance to the outline, which the shader already has (skinSdPx, device px, negative inside), and turns it into the tube's number: the lateral distance from the axis (the lumen's radius R plus sdPx)
// over the mesh's half width (R plus the line). On a cylinder that IS the tube's across, so the two sides of a seam gate alike; in a fillet it is 1 at the line's outer edge wherever the outline runs.
/** The wall coordinate of a skin pixel: `rPx` the lumen's radius at the axis' depth, `sdPx` the signed distance to the outline (negative inside), `inkPx` the line's width, all in device px. 0 deep inside, R / (R + ink) on the outline, 1 at the line's outer edge. */
export const skinWallJs = (rPx: number, sdPx: number, inkPx: number): number => Math.min(1, Math.max(0, (rPx + sdPx) / Math.max(rPx + inkPx, 1e-3)));
/** The same, as the skin shader writes it (a GLSL function of the three numbers). */
export const SKIN_WALL_GLSL = /* glsl */ `float skinWall(float rPx, float sdPx, float inkPx) { return clamp((rPx + sdPx) / max(rPx + inkPx, 1.0e-3), 0.0, 1.0); }`;
