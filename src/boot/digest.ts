// The page's boot digest: what ?perf's Copy and the audit read (loading plan L2). Collected here, printed by boot-lines.ts.
import { type BootDigest } from './boot-lines.ts';
import { firstByteMs, stamps } from './timeline.ts';
import { lateRows, lateTotal } from './late-programs.ts';
import { longTaskDigest } from './longtasks.ts';
import { slotStats } from '../clock/idle.ts';
import { renderer } from '../debug/gl-ref.ts';

export function bootDigest(): BootDigest {
  const lt = longTaskDigest();
  let parallel: boolean | undefined;
  try { parallel = !!renderer()?.getContext().getExtension('KHR_parallel_shader_compile'); } catch { parallel = undefined; }
  return { stamps: { ...stamps() }, firstByte: firstByteMs(), late: { total: lateTotal(), rows: [...lateRows()] }, longTasks: { measured: lt.measured, total: lt.total, rows: [...lt.rows] }, slots: slotStats(), parallelCompile: parallel };
}
