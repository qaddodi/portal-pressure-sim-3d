import { isSoftwareRenderer } from '../state/lite.ts';
// The 3D app draws with WebGL 2. Where the browser has none, the page says so (a short line and a link to the 2D simulator) instead of a blank screen.
export function hasWebGL2(make: () => { getContext(id: string): unknown } = () => document.createElement('canvas')): boolean {
  try {
    const gl = make().getContext('webgl2') as { getExtension?(n: string): { loseContext(): void } | null } | null;
    gl?.getExtension?.('WEBGL_lose_context')?.loseContext();   // (a probe: its context is given back at once, so it never counts against the page's two)
    return !!gl;
  } catch { return false; }
}

/** The page's graphics are drawn in software (no GPU behind WebGL): the renderer's own name says so (WEBGL_debug_renderer_info), or a context made with failIfMajorPerformanceCaveat is refused while a plain one is given.
 *  Called after hasWebGL2 says there is WebGL. Each probe context is given back at once, so none counts against the page's two. The name is read here and never stored or sent anywhere. */
export function softwareRenderer(make: () => { getContext(id: string, o?: object): unknown } = () => document.createElement('canvas')): boolean {
  type Gl = { getExtension?(n: string): { loseContext?(): void; UNMASKED_RENDERER_WEBGL?: number } | null; getParameter?(p: number): unknown } | null;
  const give = (gl: Gl) => { try { gl?.getExtension?.('WEBGL_lose_context')?.loseContext?.(); } catch { /* (a probe) */ } };
  try {
    const gl = make().getContext('webgl2', { failIfMajorPerformanceCaveat: true }) as Gl;
    if (!gl) return true;   // (WebGL is there, but only as a slow stand-in)
    let named = false;
    try {
      const info = gl.getExtension?.('WEBGL_debug_renderer_info');
      const name = info && typeof info.UNMASKED_RENDERER_WEBGL === 'number' ? gl.getParameter?.(info.UNMASKED_RENDERER_WEBGL) : null;
      named = isSoftwareRenderer(typeof name === 'string' ? name : null);
    } catch { /* (no name to read: judged by the frames instead) */ }
    give(gl);
    return named;
  } catch { return false; }
}
