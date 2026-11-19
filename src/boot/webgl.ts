// The 3D app draws with WebGL 2. Where the browser has none, the page says so (a short line and a link to the 2D simulator) instead of a blank screen.
export function hasWebGL2(make: () => { getContext(id: string): unknown } = () => document.createElement('canvas')): boolean {
  try {
    const gl = make().getContext('webgl2') as { getExtension?(n: string): { loseContext(): void } | null } | null;
    gl?.getExtension?.('WEBGL_lose_context')?.loseContext();   // (a probe: its context is given back at once, so it never counts against the page's two)
    return !!gl;
  } catch { return false; }
}
