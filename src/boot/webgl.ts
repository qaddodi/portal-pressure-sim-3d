// The 3D app draws with WebGL 2. Where the browser has none, the page says so (a short line and a link to the 2D simulator) instead of a blank screen.
export function hasWebGL2(make: () => { getContext(id: string): unknown } = () => document.createElement('canvas')): boolean {
  try { return !!make().getContext('webgl2'); } catch { return false; }
}
