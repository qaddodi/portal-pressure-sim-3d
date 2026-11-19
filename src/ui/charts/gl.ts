// The charts' GPU drawer: a triangle list in CSS px, antialiased by the canvas (MSAA), clipped by the stencil buffer.
//
// ONE WebGL context draws every chart. A browser keeps about 16 live contexts (a phone fewer) and silently drops the oldest when more are made, so a context per chart
// left the first charts of a page blank while their words, which are DOM, still showed (the ?charts gallery, 19 Nov 2026). Now one OffscreenCanvas context draws
// a chart's mesh, hands the picture over as an ImageBitmap, and the chart's own canvas (a bitmaprenderer, no context of its own) shows it. A browser without
// WebGL2 on an OffscreenCanvas falls back to a context per canvas, as before. The drawer draws only when asked (the clock) and, when the shared context is lost,
// every chart draws its last mesh again once it is back.
import { FLOATS, type Mesh } from './geometry.ts';

const VS = `#version 300 es
in vec2 a_pos; in vec4 a_col; uniform vec2 u_size; out vec4 v_col;
void main() { v_col = a_col; gl_Position = vec4(a_pos.x / u_size.x * 2.0 - 1.0, 1.0 - a_pos.y / u_size.y * 2.0, 0.0, 1.0); }`;
const FS = `#version 300 es
precision mediump float; in vec4 v_col; out vec4 o;
void main() { o = v_col; }`;

/** Pixel ratio cap: charts are small and crisp at 2; a higher ratio only costs memory (docs/look-and-feel.md performance bar). */
export const MAX_DPR = 2;
const ATTRS = { antialias: true, alpha: true, premultipliedAlpha: true, stencil: true, depth: false, preserveDrawingBuffer: false, powerPreference: 'low-power' } as const;

type Surface = HTMLCanvasElement | OffscreenCanvas;

/** One WebGL2 context on a surface, with the chart program: paint(mesh, …) draws a mesh into the surface's buffer. */
class Drawer {
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private buf: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private uSize: WebGLUniformLocation | null = null;
  lost = false;

  readonly surface: Surface;
  private onLost: () => void;
  private onBack: () => void;
  constructor(surface: Surface, onLost: () => void, onBack: () => void) {
    this.surface = surface; this.onLost = onLost; this.onBack = onBack;
    surface.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; this.onLost(); });
    surface.addEventListener('webglcontextrestored', () => { this.lost = false; this.init(); this.onBack(); });
    this.init();
  }
  get ok() { return !!this.gl && !this.lost && !!this.prog; }

  private init() {
    const gl = this.surface.getContext('webgl2', ATTRS) as WebGL2RenderingContext | null;
    this.gl = gl;
    if (!gl) return;
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`chart shader: ${gl.getShaderInfoLog(s)}`); return s; };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`chart program: ${gl.getProgramInfoLog(p)}`);
    this.prog = p;
    this.uSize = gl.getUniformLocation(p, 'u_size');
    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    const a = gl.getAttribLocation(p, 'a_pos'), c = gl.getAttribLocation(p, 'a_col');
    gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, FLOATS * 4, 0);
    gl.enableVertexAttribArray(c); gl.vertexAttribPointer(c, 4, gl.FLOAT, false, FLOATS * 4, 8);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  /** Draw `mesh` (CSS px, a box w × h) into a buffer of pw × ph pixels. */
  paint(mesh: Mesh, w: number, h: number, pw: number, ph: number) {
    const gl = this.gl;
    if (!gl || !this.ok) return false;
    const s = this.surface;
    if (s.width !== pw || s.height !== ph) { s.width = pw; s.height = ph; }
    gl.viewport(0, 0, pw, ph);
    gl.clearColor(0, 0, 0, 0); gl.clearStencil(0);
    gl.disable(gl.STENCIL_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniform2f(this.uSize, w, h);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.verts, gl.DYNAMIC_DRAW);
    for (const o of mesh.ops) {
      if (o.op === 'draw') gl.drawArrays(gl.TRIANGLES, o.first, o.count);
      else if (o.op === 'clip') {
        gl.clear(gl.STENCIL_BUFFER_BIT);
        gl.enable(gl.STENCIL_TEST); gl.stencilFunc(gl.ALWAYS, 1, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
        gl.colorMask(false, false, false, false);
        gl.drawArrays(gl.TRIANGLES, o.first, o.count);
        gl.colorMask(true, true, true, true);
        gl.stencilFunc(gl.EQUAL, 1, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      } else gl.disable(gl.STENCIL_TEST);
    }
    return true;
  }
  dispose() { try { (this.gl?.getExtension('WEBGL_lose_context') as { loseContext(): void } | null)?.loseContext(); } catch { /* already gone */ } this.gl = null; }
}

// ── the shared context ──
const clients = new Set<ChartGL>();
let shared: Drawer | null = null;
let sharedFailed = false;

/** The one drawer every chart uses, or null where a browser cannot make WebGL2 on an OffscreenCanvas. */
function sharedDrawer(): Drawer | null {
  if (shared && (shared.ok || shared.lost)) return shared;
  if (sharedFailed || typeof OffscreenCanvas === 'undefined') return null;
  try {
    const d = new Drawer(new OffscreenCanvas(1, 1), () => undefined, () => { for (const c of clients) c.redraw(); });
    if (!d.ok) { sharedFailed = true; return null; }
    shared = d;
    return d;
  } catch { sharedFailed = true; return null; }
}
/** For tests: forget the shared drawer (a new test world). */
export function resetSharedGL() { shared = null; sharedFailed = false; clients.clear(); }
/** How many charts are drawing through the shared context (tests, ?perf). */
export const sharedClients = () => clients.size;

export class ChartGL {
  readonly canvas: HTMLCanvasElement;
  private own: Drawer | null = null;
  private show: ImageBitmapRenderingContext | null = null;
  private w = 0; private h = 0; private dpr = 1;
  private last: Mesh | null = null;
  /** Called after the context came back and the last picture was drawn again. */
  onRestored: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    if (sharedDrawer()) {
      const r = canvas.getContext('bitmaprenderer');
      if (r) { this.show = r; clients.add(this); return; }
    }
    // no shared drawer here: a context of the chart's own
    this.own = new Drawer(canvas, () => undefined, () => { this.redraw(); this.onRestored?.(); });
  }

  get ok() { return this.show ? !!shared?.ok : !!this.own?.ok; }
  get shared() { return !!this.show; }

  /** The box in CSS px; the canvas takes its pixels from it at the capped ratio when it next draws (a canvas resized now would show blank until then). */
  size(w: number, h: number, dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) {
    this.w = w; this.h = h; this.dpr = Math.min(MAX_DPR, Math.max(1, dpr));
  }

  draw(mesh: Mesh) { this.last = mesh; this.paint(mesh); }
  redraw() { if (this.last) this.paint(this.last); }

  private paint(mesh: Mesh) {
    const pw = Math.max(1, Math.round(this.w * this.dpr)), ph = Math.max(1, Math.round(this.h * this.dpr));
    if (this.show) {
      const d = sharedDrawer();
      if (!d || !d.paint(mesh, this.w, this.h, pw, ph)) return;
      this.show.transferFromImageBitmap((d.surface as OffscreenCanvas).transferToImageBitmap());
    } else this.own?.paint(mesh, this.w, this.h, pw, ph);
  }

  dispose() {
    clients.delete(this);
    this.own?.dispose();
    this.own = null; this.show = null; this.last = null;
  }
}
