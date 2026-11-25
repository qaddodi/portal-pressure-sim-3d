// ?perf's text: pure, so a test can read it. The same text is what Copy puts on the clipboard (paste it into a thread).
import type { SlowFrame } from '../../clock/frame.ts';
import { SLOW_MS } from '../../clock/frame.ts';
import type { RenderStats } from '../../clock/render-stats.ts';
import type { Span } from '../../boot/spans.ts';
import { bootLines, type BootDigest } from '../../boot/boot-lines.ts';

export interface PerfStats { framesDrawn: number; windowFrames: number; p50: number; p95: number; max: number; slow: SlowFrame[]; awake: boolean; holds: string[]; boundCpu?: number; boundGpu?: number; ambientFps?: number; deferred?: number }

/** Which scene system still asks for frames (a figure that never rests is found by name: the review's D1 was the `disease` system, then the bleed jet inside it). */
const sceneLine = (sc: { moving: readonly string[]; ambientOnly: boolean }, awake: boolean): string => {
  if (sc.moving.length) return `scene still moving: ${sc.moving.join(', ')}${sc.ambientOnly ? ' (ambient only: the flow marks going round)' : ''}`;
  return `scene still moving: nothing${awake ? ' (the frames now are a hold or a one-off ask)' : ''}`;
};
const f1 = (n: number) => n.toFixed(1);
const glLine = (g: unknown): string => { const r = g as RenderStats | null | undefined; return r && typeof r.calls === 'number' ? ` · ${r.calls} calls, ${r.triangles} tris` : ''; };

export function perfReport(s: PerfStats, ctx: { ua: string; dpr: number; size: string; look: string; hash: string; shaders?: string; gl?: RenderStats | null; skin?: { rebuilds: number; worstMs: number } | null; scene?: { moving: readonly string[]; ambientOnly: boolean };
  organMap?: { drawn: number; kept: number; unkeyed: number }; spans?: readonly Span[]; boot?: BootDigest }): string {
  const lines = [
    `Portal Pressure 3D ?perf · ${ctx.hash}`,
    ...(ctx.shaders ? [`!! ${ctx.shaders} (the device's driver refused a program; those parts are drawn plain; open ?gl for the log)`] : []),
    `${ctx.size} @${ctx.dpr}x · look ${ctx.look}`,
    ctx.ua,
    `frames drawn ${s.framesDrawn} · last ${s.windowFrames}: median ${f1(s.p50)} ms, p95 ${f1(s.p95)} ms, worst ${f1(s.max)} ms · ${s.awake ? 'drawing' : 'idle (nothing drawn)'}`,
    s.holds.length ? `asking for frames: ${s.holds.join(', ')}` : 'asking for frames: nobody',
    ...(ctx.scene ? [sceneLine(ctx.scene, s.awake)] : []),
    ...(ctx.organMap ? [`organ map: drawn ${ctx.organMap.drawn} times, kept for ${ctx.organMap.kept} frames, not keyable ${ctx.organMap.unkeyed}`] : []),
    ...(s.ambientFps ? [`ambient frames (flow marks, cells, ripple only) run at ${Math.round(s.ambientFps)} a second; ${s.deferred ?? 0} display ticks waited for it since Reset`] : []),
    ...(ctx.gl ? [`renderer, last frame: ${ctx.gl.calls} draw calls · ${ctx.gl.triangles} triangles · ${ctx.gl.lines} lines · ${ctx.gl.programs} programs · ${ctx.gl.geometries} geometries · ${ctx.gl.textures} textures`] : []),
    ...(ctx.skin ? [`junction skins: ${ctx.skin.rebuilds} rebuilds so far, worst ${f1(ctx.skin.worstMs)} ms`] : []),
    ...(s.boundCpu || s.boundGpu ? [`slow frames waited on: scripts ${s.boundCpu ?? 0}, GPU or compositor ${s.boundGpu ?? 0} (a long gap after short work is the GPU or the glass blur, not the scripts)`] : []),
    `frames over ${SLOW_MS} ms or after a gap over 50 ms: ${s.slow.length ? '' : 'none'}`,
  ];
  for (const f of s.slow.slice(0, 12)) {
    const worst = (Object.entries(f.phases) as [string, number][]).sort((a, b) => b[1] - a[1])[0]!;
    lines.push(`  #${f.frame}  work ${f1(f.ms)} ms · gap ${f1(f.gap)} ms · most in ${worst[0]} (${f1(worst[1])} ms) · asked by ${f.tags.join(', ') || '–'}${f.bound ? ` · waited on ${f.bound}` : ''}${glLine(f.gl)}`);
  }
  if (ctx.boot) lines.push(...bootLines(ctx.boot));
  if (ctx.spans?.length) { lines.push('startup spans (ms, at ms since the page began):'); for (const p of ctx.spans.slice(0, 40)) lines.push(`  ${p.name} ${f1(p.ms)} @${p.at}`); }
  return lines.join('\n');
}

/** The one line the compact strip shows while timings are collected: the frame times (the slow-frame list stays in the Detail view). */
export const perfStrip = (full: string): string => full.split('\n').find((l) => l.startsWith('frames drawn')) ?? full.split('\n', 1)[0] ?? '';
