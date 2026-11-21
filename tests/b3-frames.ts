// Real engine frames for the B3 tests: the pinned engine, run in node (no worker, no browser), the way tests/engine-numbers.test.ts does it.
import { createCore } from '../src/engine/hales/host/worker-core.js';
import type { EngineFrame } from '../src/engine/hales/host/protocol.d.ts';

export interface Healthy { P: number[]; Q: number[]; D: number[] }

export async function frameFor(preset: string): Promise<{ frame: EngineFrame; healthy: Healthy }> {
  const out: Array<{ type: string } & Record<string, unknown>> = [];
  const core = createCore((m: never) => out.push(m));
  await core.handle({ type: 'init' });
  await core.handle({ type: 'run', running: false });
  await core.handle({ type: 'preset', id: preset, reqId: 1 });
  await core.handle({ type: 'healthyProfile', reqId: 2 });
  core.dispose();
  const frames = out.filter((m) => m.type === 'frame');
  const h = out.find((m) => m.type === 'healthy') as unknown as Healthy & { type: string };
  if (!frames.length || !h) throw new Error(`no frame for ${preset}`);
  return { frame: frames[frames.length - 1] as unknown as EngineFrame, healthy: { P: h.P, Q: h.Q, D: h.D } };
}
