// The scene's renderer, handed from Stage.tsx to the ?gl page (the app makes two WebGL contexts, ever: tests/webgl-budget.test.ts; the page borrows the scene's, it makes none).
export interface GlHandle { getContext(): WebGLRenderingContext | WebGL2RenderingContext; compileAsync(scene: never, camera: never): Promise<unknown>; properties: { get(o: never): unknown } }
let current: GlHandle | null = null;
const waiting = new Set<(r: GlHandle) => void>();
export function setRenderer(r: GlHandle | null): void { current = r; if (r) for (const w of [...waiting]) { waiting.delete(w); w(r); } }
export const renderer = (): GlHandle | null => current;
/** Calls `fn` with the renderer now, or when Stage mounts it. */
export function whenRenderer(fn: (r: GlHandle) => void): void { if (current) fn(current); else waiting.add(fn); }
