// The Doppler spectrum on the shared chart drawer's context, with 2D's own shaders (the grain included).
//
// 2D draws each new spectral line into a scrolling ring texture with doppler-synth.js's shader (the band's power, the wall filter, the log compression of the
// grain, the colour maps) and then shows the ring with doppler-gl.js's display pass (the noise floor, the wall filter's dark band). The grain (the speckle) is the
// exponential statistics of those two shaders and nothing else makes it. Here the same two shaders run as ONE pass, under the chart's shapes (the drawer's `under`
// hook, as the FibroScan's map does; no second WebGL context): each pixel of the trace reads its own line's numbers from two one-row float textures (a line is one
// device pixel wide, as in 2D), works out the band's power and the grain exactly as doppler-synth.js does, and then adds the noise floor and darkens the baseline as
// doppler-gl.js does. There is no ring: a line's grain is a hash of its number, so it scrolls with the trace and holds still between frames, as the ring made it.
//
// The shader text is 2D's, copied (copied/doppler-gl.copied.js, ../copied/doppler-synth.copied.js); only the join is ours: the line shader's main() becomes a function of
// (column, row) and the display pass's read of the ring becomes a call to it.
import type { Under } from '../../charts/gl.ts';
import { SYNTH_FS } from '../copied/doppler-synth.copied.js';
import { DISPLAY_FS } from './copied/doppler-gl.copied.js';
import { MAP } from './copied/doppler-colours.copied.js';

import { clock } from '../../../clock/frame.ts';
/** The vertex stage: one quad over the trace's rectangle. */
export const SPECTRUM_VS = `#version 300 es
in vec2 q;
void main() { gl_Position = vec4(q, 0.0, 1.0); }`;

const MAIN_LINE = /void main\(\) \{\s*int x = int\(gl_FragCoord\.x\), ry = int\(gl_FragCoord\.y\);[^\n]*/;
const RING_READ = 'vec3 r = texelFetch(ring, ivec2(c, ly), 0).rgb;';
const synthPart = SYNTH_FS.replace(MAIN_LINE, 'void synthMain(int x, int ry) {');
// (the display pass without its header and its own `o`: the line shader's `precision` lines and `out vec4 o` stay)
const displayPart = DISPLAY_FS.replace(/^#version 300 es\s*precision highp float;\s*precision highp int;\s*/, '').replace('out vec4 o;', '').replace(RING_READ, 'synthMain(lx, ly); vec3 r = o.rgb;');
/** The one fragment program: the line shader's pixel, then the noise floor and the wall filter. */
export const SPECTRUM_FS = `${synthPart}\n${displayPart}`;
/** True when both splices found what they look for (a changed 2D shader makes the join fail loudly, in tests/b11-doppler.test.ts, not as a blank trace). */
export const SPECTRUM_JOINED = synthPart !== SYNTH_FS && displayPart.includes('synthMain(lx, ly)') && !displayPart.includes('texelFetch(ring') && !displayPart.includes('out vec4 o;');

/** What one frame of the trace is drawn from (device px; the model works it out with the frame, spectrum-model.ts / model.ts `frameFor`). */
export interface SpectrumDraw {
  /** the trace's top left in the canvas, and its size */
  dx: number; dy: number; RW: number; RH: number;
  rBase: number; rPxPerV: number; fade: number; wfV: number; spkPx: number; spkMix: number; span: number; uK: number;
  /** 0 grey spectrum, 1 colour velocity, 2 colour variance */
  mode: number;
  noiseA: number; wallBase: number; wallHalf: number; nBin: number; nRun: number;
  /** each line's numbers by screen column: A (P, L, sigHi, sigLo), B (gain, variance, flags, line number), four floats a column */
  colA: Float32Array; colB: Float32Array;
}

const UNIS = ['colA', 'colB', 'rBase', 'rPxPerV', 'fade', 'wfV', 'spkPx', 'spkMix', 'span', 'uK', 'mode', 'seed', 'cToward', 'cAway', 'cVarT0', 'cVarT1', 'cVarA0', 'cVarA1', 'cWhite',
  'size', 'org', 'nOff', 'nBin', 'nRun', 'noiseA', 'wall'] as const;
const SEED = 0x9e3779b9;

interface Built { gl: WebGL2RenderingContext; gen: number; prog: WebGLProgram; U: Record<string, WebGLUniformLocation | null>; vao: WebGLVertexArrayObject; quad: WebGLBuffer; tA: WebGLTexture; tB: WebGLTexture; cw: number }

function build(gl: WebGL2RenderingContext, gen: number): Built {
  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`doppler spectrum shader: ${gl.getShaderInfoLog(s)}`); return s; };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, SPECTRUM_VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, SPECTRUM_FS));
  gl.bindAttribLocation(prog, 0, 'q');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`doppler spectrum program: ${gl.getProgramInfoLog(prog)}`);
  const U: Record<string, WebGLUniformLocation | null> = {};
  for (const n of UNIS) U[n] = gl.getUniformLocation(prog, n);
  const quad = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const tex = () => { const t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t); for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]] as const) gl.texParameteri(gl.TEXTURE_2D, p, v); return t; };
  return { gl, gen, prog, U, vao, quad, tA: tex(), tB: tex(), cw: 0 };
}

/**
 * The picture under the chart's shapes: the trace of the frame `read()` gives (null: draws nothing). `onFail` is called once if the program cannot be made
 * (the model then draws the spectrum from shapes again). `now` is the wall clock in ms (the noise floor takes a new view of its texture about ten times a second, as 2D's).
 */
export function spectrumUnder(read: () => SpectrumDraw | null, onFail: () => void, now: () => number = () => clock.now()): Under {
  let st: Built | null = null, failed = false, noiseAt = -Infinity, nx = 0, ny = 0;
  return (gl, pw, ph, gen) => {
    const d = read();
    if (!d || failed) return;
    try {
      if (!st || st.gl !== gl || st.gen !== gen) st = build(gl, gen);
    } catch (e) { failed = true; st = null; console.warn('Doppler spectrum: the shader could not be built; the trace is drawn from shapes.', e); onFail(); return; }
    const b = st;
    if (now() - noiseAt > 100) { noiseAt = now(); nx = (Math.random() * 8192) | 0; ny = (Math.random() * 8192) | 0; }
    const oy = ph - d.dy - d.RH;
    gl.viewport(d.dx, oy, d.RW, d.RH);
    gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST); gl.disable(gl.SCISSOR_TEST);
    gl.useProgram(b.prog);
    // each line's numbers: one float texel a column
    const up = (unit: number, tex: WebGLTexture, arr: Float32Array) => {
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex);
      if (b.cw !== d.RW) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, d.RW, 1, 0, gl.RGBA, gl.FLOAT, arr.subarray(0, d.RW * 4));
      else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, d.RW, 1, gl.RGBA, gl.FLOAT, arr.subarray(0, d.RW * 4));
    };
    up(2, b.tA, d.colA); up(3, b.tB, d.colB); b.cw = d.RW;
    const U = b.U;
    gl.uniform1i(U.colA!, 2); gl.uniform1i(U.colB!, 3);
    gl.uniform1f(U.rBase!, d.rBase); gl.uniform1f(U.rPxPerV!, d.rPxPerV); gl.uniform1f(U.fade!, d.fade); gl.uniform1f(U.wfV!, d.wfV);
    gl.uniform1f(U.spkPx!, d.spkPx); gl.uniform1f(U.spkMix!, d.spkMix); gl.uniform1f(U.span!, d.span); gl.uniform1f(U.uK!, d.uK);
    gl.uniform1i(U.mode!, d.mode); gl.uniform1ui(U.seed!, SEED);
    gl.uniform3fv(U.cToward!, MAP.TOWARD); gl.uniform3fv(U.cAway!, MAP.AWAY);
    gl.uniform3fv(U.cVarT0!, MAP.VAR_TOWARD[0]); gl.uniform3fv(U.cVarT1!, MAP.VAR_TOWARD[1]);
    gl.uniform3fv(U.cVarA0!, MAP.VAR_AWAY[0]); gl.uniform3fv(U.cVarA1!, MAP.VAR_AWAY[1]); gl.uniform3fv(U.cWhite!, MAP.WHITE);
    gl.uniform2i(U.size!, d.RW, d.RH); gl.uniform2i(U.org!, d.dx, oy); gl.uniform2i(U.nOff!, nx, ny);
    gl.uniform1f(U.nBin!, d.nBin); gl.uniform1i(U.nRun!, d.nRun); gl.uniform1f(U.noiseA!, d.noiseA); gl.uniform2f(U.wall!, d.wallBase, d.wallHalf);
    gl.bindVertexArray(b.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  };
}
