// ?perf's text: pure, so a test can read it. The same text is what Copy puts on the clipboard (paste it into a thread).
import type { SlowFrame } from '../../clock/frame.ts';
import { SLOW_MS } from '../../clock/frame.ts';

export interface PerfStats { framesDrawn: number; windowFrames: number; p50: number; p95: number; max: number; slow: SlowFrame[]; awake: boolean; holds: string[] }

const f1 = (n: number) => n.toFixed(1);

export function perfReport(s: PerfStats, ctx: { ua: string; dpr: number; size: string; look: string; hash: string; shaders?: string }): string {
  const lines = [
    `Portal Pressure 3D ?perf · ${ctx.hash}`,
    ...(ctx.shaders ? [`!! ${ctx.shaders} (the device's driver refused a program; those parts are drawn plain; open ?gl for the log)`] : []),
    `${ctx.size} @${ctx.dpr}x · look ${ctx.look}`,
    ctx.ua,
    `frames drawn ${s.framesDrawn} · last ${s.windowFrames}: median ${f1(s.p50)} ms, p95 ${f1(s.p95)} ms, worst ${f1(s.max)} ms · ${s.awake ? 'drawing' : 'idle (nothing drawn)'}`,
    s.holds.length ? `asking for frames: ${s.holds.join(', ')}` : 'asking for frames: nobody',
    `frames over ${SLOW_MS} ms or after a gap over 50 ms: ${s.slow.length ? '' : 'none'}`,
  ];
  for (const f of s.slow.slice(0, 12)) {
    const worst = (Object.entries(f.phases) as [string, number][]).sort((a, b) => b[1] - a[1])[0]!;
    lines.push(`  #${f.frame}  work ${f1(f.ms)} ms · gap ${f1(f.gap)} ms · most in ${worst[0]} (${f1(worst[1])} ms) · asked by ${f.tags.join(', ') || '–'}`);
  }
  return lines.join('\n');
}
