// The four shader-starting functions the FibroScan map's GPU code (copied/fibro-gl.copied.js, 2D fibroscan-gl.js) takes from the 2D app's gl-compile.js, in the small form this app needs: a program
// is started (compiled and linked, nothing read), published once the driver says it is done (KHR_parallel_shader_compile where it exists; else at once), and its status read then. The 2D file's
// warm-up draw (`exerciseDraw`) is not made: the first real frame of the map builds the pipeline. Polling runs on a timer, never a frame: the one clock owns frames (tests/one-clock.test.ts).
import { highpSamplers } from '../highp-samplers.js';
export function startProgram(gl, vs, fs, bind = []) {
  fs = highpSamplers(fs);   // (the map's fields are R32F: a raw fragment shader reads a sampler2D at LOWP unless it says otherwise, and the byte-copied source does not say it: highp-samplers.js)
  gl.getExtension('KHR_parallel_shader_compile');   // (asking for it turns the parallel compile on)
  const sh = [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].map(([type, src]) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; });
  const p = gl.createProgram();
  for (const s of sh) gl.attachShader(p, s);
  for (const [name, loc] of bind) gl.bindAttribLocation(p, loc, name);
  gl.linkProgram(p);
  return { p, sh };
}

/** The program's status read (it waits when the compile is not done); throws the info log on a failure. */
export function checkProgram(gl, { p, sh }) {
  if (gl.getProgramParameter(p, gl.LINK_STATUS)) return p;
  for (const s of sh) if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  throw new Error(gl.getProgramInfoLog(p));
}

/** Calls `done` once every started program has finished compiling (at once where the driver cannot say). */
export function publishWhenDone(gl, handles, done) {
  const ext = gl.getExtension('KHR_parallel_shader_compile');
  const ready = () => !ext || handles.every((h) => gl.getProgramParameter(h.p, ext.COMPLETION_STATUS_KHR));
  const poll = () => { if (gl.isContextLost() || ready()) done(); else setTimeout(poll, 8); };
  setTimeout(poll, 0);
}

/** (the 2D warm-up draw: not made here) */
export function exerciseDraw() { /* nothing */ }
