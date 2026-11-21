// When a micro scene may be remeshed again. A patient glide moves the sinusoid's lumen, pinch and collagen through up to 64 quantised steps (sinusoid3d shapeKey); every step rebuilt the whole
// scene (some 800 000 triangles) in the frame it was met, the 0.4 to 0.7 s frames of the iPhone audit's Ascites 9 ("Heart failure gives high-SAAG"). A change of shape is taken at most once per REMESH_MS of
// the page's clock; the newest key is built as soon as that has passed, so the picture follows the glide in a few steps and always ends on the exact one (the scene reports itself moving until it has).
export const REMESH_MS = 220;
/** Whether a scene whose shapes were last built at `builtAt` (page ms; null: never) may be rebuilt now for a key that differs from the one it holds. */
export const remeshDue = (now: number, builtAt: number | null): boolean => builtAt === null || now - builtAt >= REMESH_MS || now < builtAt;
