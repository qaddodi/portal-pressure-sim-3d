// Renderer instruments (code review 21 Nov, #4 #5 #6): what the frame cost the GPU side (draw calls, triangles, programs, geometries, textures from three's `gl.info`), the live
// geometry and texture counts the audit watches for a leak, and "bound by": was a slow frame waiting on the scripts or on the GPU / compositor. Measures only; nothing here changes a pixel.
// Pure apart from the one `latest` snapshot Stage.tsx fills once a frame, so a Node test drives it with a stand-in `info`.
export interface RenderStats { calls: number; triangles: number; lines: number; points: number; programs: number; geometries: number; textures: number }
/** The part of three's `WebGLRenderer.info` this reads (a test hands in a stand-in). */
export interface InfoLike {
  render: { calls: number; triangles: number; lines: number; points: number };
  memory: { geometries: number; textures: number };
  programs?: readonly unknown[] | null;
  autoReset?: boolean;
  reset(): void;
}

export const readStats = (info: InfoLike): RenderStats => ({
  calls: info.render.calls, triangles: info.render.triangles, lines: info.render.lines, points: info.render.points,
  programs: info.programs?.length ?? 0, geometries: info.memory.geometries, textures: info.memory.textures,
});

let latest: RenderStats | null = null;
/** Start of the frame: three resets `info.render` on every `render()` call by default, and the scene draws several times a frame (the figure, the glow, the resolve), so the count is taken by hand over the whole frame instead. */
export function frameBegin(info: InfoLike): void { info.autoReset = false; info.reset(); }
/** End of the frame: keep what the whole frame drew. */
export function frameEnd(info: InfoLike): void { latest = readStats(info); }
/** The last frame's numbers (null before the first frame). */
export const renderStats = (): RenderStats | null => latest;
export const resetRenderStats = (): void => { latest = null; };

/** A frame whose gap is over this while its own work is under CPU_MS is waiting on the GPU or the compositor, not on the scripts. */
export const WAIT_GAP_MS = 20, CPU_MS = 8;
export type Bound = 'cpu' | 'gpu/compositor';
/** What a slow frame was waiting on: its work took long (cpu), or the gap was long though the work was short (gpu/compositor); null when neither stood out. */
export function boundBy(ms: number, gap: number): Bound | null {
  if (ms >= CPU_MS) return ms > WAIT_GAP_MS || gap > WAIT_GAP_MS ? 'cpu' : null;
  return gap > WAIT_GAP_MS ? 'gpu/compositor' : null;
}

/** A leak: geometries or textures still held at the end of a run well past what the app held once every view had been built. `rows` are the per-step counts, in order. */
export const LEAK_GEOMETRIES = 30, LEAK_TEXTURES = 10, LEAK_BASELINE_STEPS = 4;
export interface MemoryClimb { geometries: number; textures: number; from: number; to: number }
export function memoryClimb(rows: readonly (Pick<RenderStats, 'geometries' | 'textures'> | null | undefined)[]): MemoryClimb | null {
  const have = rows.map((r, i) => ({ r, i })).filter((x): x is { r: Pick<RenderStats, 'geometries' | 'textures'>; i: number } => !!x.r);
  if (have.length <= LEAK_BASELINE_STEPS) return null;
  // (the baseline is the count three fifths of the way through, never before the fourth step: the lobule, the circuit, the scope and each patient's vessels are built the first time they are shown and kept, so
  //  a count taken after four steps called every one of them a leak; a real one keeps climbing in the last two fifths too)
  const base = have[Math.max(LEAK_BASELINE_STEPS - 1, Math.floor((have.length - 1) * 0.6))]!, last = have[have.length - 1]!;
  const g = last.r.geometries - base.r.geometries, t = last.r.textures - base.r.textures;
  return g > LEAK_GEOMETRIES || t > LEAK_TEXTURES ? { geometries: g, textures: t, from: base.i, to: last.i } : null;
}
