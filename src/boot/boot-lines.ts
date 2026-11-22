// The text of the boot digest (loading plan L2), pure so a test reads it and both ?perf's Copy and the audit's report print the same lines.
import type { LateRow } from './late-programs.ts';
import type { LongTask } from './longtasks.ts';
import type { SlotStat } from '../clock/idle.ts';
import { timelineLine, type Stage } from './timeline.ts';

export interface BootDigest {
  stamps: Partial<Record<Stage, number>>; firstByte?: number;
  late: { total: number; rows: LateRow[] };
  longTasks: { measured: boolean; by?: 'observer' | 'timer'; total: number; rows: LongTask[] };
  slots: SlotStat[];
  /** the device's driver has KHR_parallel_shader_compile (without it a compile is a stall); undefined when not known */
  parallelCompile?: boolean;
}
const f1 = (n: number) => n.toFixed(1);
/** A background step longer than a frame (60 Hz): the stall risk the slot itself can see. */
export const SLOW_STEP_MS = 16;

export function bootLines(d: BootDigest): string[] {
  const L: string[] = [timelineLine(d.stamps, d.firstByte)];
  if (d.parallelCompile !== undefined) L.push(`shader compile: ${d.parallelCompile ? 'parallel (KHR_parallel_shader_compile)' : 'NOT parallel on this device: every program built late is a frame stall'}`);
  L.push(`late programs (built after the splash lifted; zero is the goal): ${d.late.total}`);
  for (const r of d.late.rows.slice(-8)) L.push(`  frame +${r.frame} after the lift · ${r.view} · ${r.count} new: ${r.names.join(', ')} · the draw took ${f1(r.ms)} ms`);
  L.push(d.longTasks.measured ? `long tasks (over 50 ms) after the lift: ${d.longTasks.total}${d.longTasks.by === 'timer' ? ' (a 4 ms timer was late: this browser has no long-task observer; the marks say what ran)' : ''}` : 'long tasks after the lift: not measured (this browser has no long-task observer)');
  for (const t of [...d.longTasks.rows].sort((a, b) => b.ms - a.ms).slice(0, 8)) L.push(`  ${t.ms} ms at ${t.at} ms · during ${t.what}`);
  // the slot times its own steps (clock/idle.ts), so this signal exists on every browser: Safari (the Mac, iPad and iPhone) has no long-task observer
  const slow = d.slots.filter((s) => s.worstStepMs > SLOW_STEP_MS).sort((a, b) => b.worstStepMs - a.worstStepMs);
  L.push(`slow background steps (a step over ${SLOW_STEP_MS} ms, measured by the slot itself; zero is the goal): ${slow.length}`);
  for (const s of slow.slice(0, 8)) L.push(`  slot:${s.tag} · worst step ${f1(s.worstStepMs)} ms over ${s.steps} steps`);
  if (d.slots.length) {
    L.push('background slots (clock/idle.ts; a step over 16 ms is a stall risk):');
    for (const s of d.slots) L.push(`  slot:${s.tag} · ${s.slices} slices, ${s.steps} steps, ${f1(s.totalMs)} ms in all, worst step ${f1(s.worstStepMs)} ms${s.done ? '' : ' · not finished'}`);
  }
  return L;
}
