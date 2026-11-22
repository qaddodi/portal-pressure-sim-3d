// The scope's picture, shaded per pixel by the 2D app's own shader (copied/endo-shader.copied.js) on the shared chart drawer's context, under the chart's shapes (the drawer's `under` hook, as the
// FibroScan's map and the Doppler's spectrum do: no second WebGL context). The field is a square inside the chart's buffer: the lumen's circle (R = half the box less 4 px for the bezel's outer edge); the
// balloon, the bleed and the bezel are shapes over it (frame.ts). Everything the shader needs is the field state (grow, vis, red, def[4], kn[16]) and the columns' constants (endo-columns.copied.js).
import type { Under } from '../../charts/gl.ts';
import { parseColour } from '../../charts/colour.ts';
import { columnConsts } from '../copied/endo-columns.copied.js';
import { ENDO_VS, endoFS } from '../copied/endo-shader.copied.js';
import { SCOPE_TOKENS } from '../copied/scope-tokens.copied.js';
import type { FieldState } from './field.ts';
import { ENDO_PROGRAM, takeWarm } from '../../../boot/warm-programs.ts';

const rgb = (name: string): [number, number, number] => {
  const t = (SCOPE_TOKENS as Record<string, string>)[name.replace(/^--/, '')];
  if (!t) throw new Error(`endo shader: no token ${name}`);
  const c = parseColour(t);
  return [c[0] * 255, c[1] * 255, c[2] * 255];
};
/** The shader's text with its colours written in (2D's `G` and `G01`). */
export const endoShaderSource = (): string => endoFS((n: string) => rgb(n).map((v) => v.toFixed(1)).join(', '), (n: string) => rgb(n).map((v) => (v / 255).toFixed(4)).join(', '));

const UNIS = ['uSize', 'uOrigin', 'uGrow', 'uVis', 'uRed', 'uC0', 'uC1', 'uDef', 'uKn'] as const;
interface Built { gl: WebGL2RenderingContext; gen: number; prog: WebGLProgram; U: Record<string, WebGLUniformLocation | null>; vao: WebGLVertexArrayObject; buf: WebGLBuffer }

function build(gl: WebGL2RenderingContext, gen: number): Built {
  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`endo shader: ${gl.getShaderInfoLog(s)}`); return s; };
  // (the preload ladder compiled this program beside the page, on this same context: src/boot/warm-programs.ts)
  let prog = takeWarm(ENDO_PROGRAM, gl, gen);
  if (!prog) {
    prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, ENDO_VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, endoShaderSource()));
    gl.bindAttribLocation(prog, 0, 'p');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`endo program: ${gl.getProgramInfoLog(prog)}`);
  }
  const U: Record<string, WebGLUniformLocation | null> = {};
  for (const n of UNIS) U[n] = gl.getUniformLocation(prog, n);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const { c0, c1 } = columnConsts() as { c0: number[]; c1: number[] };
  gl.useProgram(prog);
  gl.uniform4fv(U.uC0!, new Float32Array(c0)); gl.uniform4fv(U.uC1!, new Float32Array(c1));
  return { gl, gen, prog, U, vao, buf };
}

/** What the picture is drawn from: the field's state and the chart's box in CSS px (the lumen is the circle inside it, 4 px in from its edge). */
export interface EndoDraw { st: FieldState; size: number }

/** The field as the picture under the chart's shapes; `read` gives the state of this draw (null draws nothing), `onFail` is called once if the program cannot be made. */
export function endoUnder(read: () => EndoDraw | null, onFail: () => void = () => undefined): Under {
  let b: Built | null = null, failed = false;
  const def = new Float32Array(4), kn = new Float32Array(16);
  return (gl, pw, ph, gen) => {
    const d = read();
    if (!d || failed) return;
    try {
      const g = gl as WebGL2RenderingContext;
      if (!b || b.gl !== g || b.gen !== gen) b = build(g, gen);
      const k = pw / Math.max(1, d.size), side = Math.max(2, 2 * Math.round((pw - 8 * k) / 2)), o = Math.round(4 * k);   // (an EVEN side: with an odd one a row of pixels sits exactly on the field's centre line, y = 0, where the shader's atan/sign axis is, and that row drew a hairline across the lumen)
      g.useProgram(b.prog);
      g.disable(g.BLEND);
      g.viewport(o, ph - o - side, side, side);   // (the box is square: the same margin each side; GL counts rows from the bottom)
      g.uniform1f(b.U.uSize!, side); g.uniform2f(b.U.uOrigin!, o, ph - o - side);
      g.uniform1f(b.U.uGrow!, d.st.grow); g.uniform1f(b.U.uVis!, d.st.vis); g.uniform1f(b.U.uRed!, +d.st.red || 0);
      for (let i = 0; i < 4; i++) def[i] = d.st.def[i] ?? 0;
      for (let i = 0; i < 16; i++) kn[i] = d.st.kn[i] ?? 0;
      g.uniform1fv(b.U.uDef!, def); g.uniform1fv(b.U.uKn!, kn);
      g.bindVertexArray(b.vao);
      g.drawArrays(g.TRIANGLES, 0, 3);
      g.bindVertexArray(null);
      g.useProgram(null);
      g.viewport(0, 0, pw, ph);
    } catch { failed = true; onFail(); }
  };
}
