// The instruments' own GL programs, compiled beside the page before anyone opens them (the preload ladder, src/boot/warm.ts, rung "programs").
// The charts, the Doppler spectrum and the scope's field draw on ONE shared WebGL context (ui/charts/gl.ts). Their programs used to be made, linked and status-read inside the first frame the instrument drew:
// on a driver without KHR_parallel_shader_compile that is a long stall. Here each is started in a quiet slot, the driver says when it is done (polled on the clock's timer, never a frame), and the linked program is
// kept for the instrument's own build to take (`takeWarm`: same context, same context generation; a restored context has none). The FibroScan's map needs nothing here: its pane already starts its programs in
// parallel and shows the map once they are done (copied/fibro-gl.copied.js), so it never stalls a frame.
import { sharedContext } from '../ui/charts/gl.ts';
import { clock } from '../clock/frame.ts';

/** The names the programs go by: the ?gl list's (src/debug/gl-registry.ts), so one name is one program everywhere. */
export const SPECTRUM_PROGRAM = 'doppler spectrum (chart)';
export const ENDO_PROGRAM = 'endoscopic field';
export const CHARTS_PROGRAM = 'charts';

export interface Prog { name: string; vs: string; fs: string; /** attribute locations bound before linking, as the instrument's own build does */ bind: [string, number][] }

/** The programs an instrument's chunk holds, read when the chunk is (the sources live in the lazy instrument modules: nothing here is imported until the ladder's turn). */
export const PROGRAM_SETS: { name: string; load: () => Promise<Prog[]> }[] = [
  { name: SPECTRUM_PROGRAM, load: async () => { const m = await import('../ui/tests/doppler/spectrum-gl.ts'); return [{ name: SPECTRUM_PROGRAM, vs: m.SPECTRUM_VS, fs: m.SPECTRUM_FS, bind: [['q', 0]] }]; } },
  { name: ENDO_PROGRAM, load: async () => { const [e, c] = await Promise.all([import('../ui/tests/endo/endo-under.ts'), import('../ui/tests/copied/endo-shader.copied.js')]); return [{ name: ENDO_PROGRAM, vs: c.ENDO_VS, fs: e.endoShaderSource(), bind: [['p', 0]] }]; } },
];
/** Programs in ?gl's raw list that the ladder does not compile, and why (tests/warm-ladder.test.ts: anything else not on the ladder fails). */
export const NOT_WARMED: Record<string, string> = {
  'doppler spectrum': 'the 2D synth source alone: only ever compiled joined into the spectrum program',
  'fibroscan map': 'the pane starts it in parallel and shows the map when it is done (never a stalled frame)',
  'fibroscan map (show)': 'as the map',
};

interface Held { gl: WebGL2RenderingContext; gen: number; prog: WebGLProgram }
const ready = new Map<string, Held>();

/** The program the ladder compiled for `name` on this context, once (null: none, or made on a context since lost or made again). */
export function takeWarm(name: string, gl: WebGL2RenderingContext, gen: number): WebGLProgram | null {
  const h = ready.get(name); ready.delete(name);
  return h && h.gl === gl && h.gen === gen && !gl.isContextLost() ? h.prog : null;
}
/** For tests: forget what is held. */
export const clearWarm = (): void => ready.clear();
export const warmHeld = (name: string): boolean => ready.has(name);

type Ctx = { gl: WebGL2RenderingContext; gen: number };
/** Starts `p` on the shared context and resolves when the driver is done with it (true: linked and kept for `takeWarm`). Where the driver cannot say when (no KHR_parallel_shader_compile) the status is read at once, in this one quiet slot. */
export function warmProgram(p: Prog, ctx: Ctx | null = sharedContext(), after: (fn: () => void, ms: number) => unknown = (fn, ms) => clock.after(fn, ms)): Promise<boolean> {
  if (!ctx) return Promise.resolve(false);
  const { gl, gen } = ctx;
  if (gl.isContextLost()) return Promise.resolve(false);
  const ext = gl.getExtension('KHR_parallel_shader_compile');   // (asking for it turns the parallel compile on)
  const prog = gl.createProgram();
  const shaders = ([[gl.VERTEX_SHADER, p.vs], [gl.FRAGMENT_SHADER, p.fs]] as const).map(([type, src]) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); gl.attachShader(prog, s); return s; });
  for (const [name, loc] of p.bind) gl.bindAttribLocation(prog, loc, name);
  gl.linkProgram(prog);
  return new Promise<boolean>((res) => {
    const poll = (): void => {
      if (gl.isContextLost()) { res(false); return; }
      if (ext && !gl.getProgramParameter(prog, ext.COMPLETION_STATUS_KHR)) { after(poll, 8); return; }
      const ok = !!gl.getProgramParameter(prog, gl.LINK_STATUS);
      for (const s of shaders) gl.deleteShader(s);
      if (ok) ready.set(p.name, { gl, gen, prog }); else gl.deleteProgram(prog);
      res(ok);
    };
    poll();
  });
}

/** One rung: every program of one set (the sources are read when the set's chunk is). A failure leaves that program to its first use. */
export async function warmSet(set: (typeof PROGRAM_SETS)[number], ctx: Ctx | null = sharedContext(), progs?: readonly Prog[]): Promise<void> {
  // (every program of the set is started in this one synchronous turn, inside the rung's slot, so a driver that must read the link status at once does it here and one that can say when it is done compiles them side by side; `progs` are the sources the rung read in before its slot)
  const list = progs ?? await set.load();
  await Promise.all(list.map((p) => warmProgram(p, ctx)));
}
