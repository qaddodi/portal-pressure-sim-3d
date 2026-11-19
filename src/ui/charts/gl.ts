// The charts' one GPU drawer: a triangle list in CSS px, antialiased by the canvas (MSAA), clipped by the stencil buffer. One small canvas per chart;
// it draws only when asked (the clock), and recovers from a lost context by drawing the last mesh again.
import { FLOATS, type Mesh } from './geometry.ts';

const VS = `#version 300 es
in vec2 a_pos; in vec4 a_col; uniform vec2 u_size; out vec4 v_col;
void main() { v_col = a_col; gl_Position = vec4(a_pos.x / u_size.x * 2.0 - 1.0, 1.0 - a_pos.y / u_size.y * 2.0, 0.0, 1.0); }`;
const FS = `#version 300 es
precision mediump float; in vec4 v_col; out vec4 o;
void main() { o = v_col; }`;

/** Pixel ratio cap: charts are small and crisp at 2; a higher ratio only costs memory (docs/look-and-feel.md performance bar). */
export const MAX_DPR = 2;

export class ChartGL {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private buf: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private uSize: WebGLUniformLocation | null = null;
  private w = 0; private h = 0; private dpr = 1;
  private last: Mesh | null = null;
  private lost = false;
  /** Called after the context came back and the last picture was drawn again. */
  onRestored: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.init(); if (this.last) this.paint(this.last); this.onRestored?.(); });
    this.init();
  }

  get ok() { return !!this.gl && !this.lost; }

  private init() {
    const gl = this.canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, stencil: true, depth: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
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

  /** The box in CSS px; the canvas takes its pixels from it at the capped ratio. */
  size(w: number, h: number, dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) {
    const r = Math.min(MAX_DPR, Math.max(1, dpr));
    const pw = Math.max(1, Math.round(w * r)), ph = Math.max(1, Math.round(h * r));
    if (this.canvas.width !== pw || this.canvas.height !== ph) { this.canvas.width = pw; this.canvas.height = ph; }
    this.w = w; this.h = h; this.dpr = r;
  }

  draw(mesh: Mesh) { this.last = mesh; this.paint(mesh); }

  private paint(mesh: Mesh) {
    const gl = this.gl;
    if (!gl || this.lost || !this.prog) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clearStencil(0);
    gl.disable(gl.STENCIL_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniform2f(this.uSize, this.w, this.h);
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
  }

  dispose() {
    const gl = this.gl;
    if (gl) { try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* already gone */ } }
    this.gl = null; this.last = null;
  }
}
