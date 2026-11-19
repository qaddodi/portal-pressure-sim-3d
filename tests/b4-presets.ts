// Real engine state for the B4 tests: the frame, the patient's parameters and the healthy pressures of a preset, run in node (no worker, no browser).
import { createCore } from '../src/engine/host/worker-core.js';
import type { DiseaseFrame, DiseaseParams } from '../src/scene/disease/targets.ts';

export type PresetFrame = DiseaseFrame & { Q: ArrayLike<number>; Qf?: ArrayLike<number>; D: ArrayLike<number> };
export interface PresetState { id: string; frame: PresetFrame; params: DiseaseParams; healthyP: number[] }
type Msg = { type: string } & Record<string, unknown>;

export async function presetIds(): Promise<string[]> {
  const out: Msg[] = [];
  const core = createCore((m: never) => out.push(m));
  await core.handle({ type: 'init' });
  await core.handle({ type: 'presets', reqId: 1 });
  core.dispose();
  return (out.find((m) => m.type === 'presets')!.presets as { id: string }[]).map((p) => p.id);
}

export async function presetState(id: string): Promise<PresetState> {
  const out: Msg[] = [];
  const core = createCore((m: never) => out.push(m));
  await core.handle({ type: 'init' });
  await core.handle({ type: 'run', running: false });
  await core.handle({ type: 'preset', id, reqId: 1 });
  await core.handle({ type: 'healthyProfile', reqId: 2 });
  core.dispose();
  const frames = out.filter((m) => m.type === 'frame');
  const loaded = out.find((m) => m.type === 'presetLoaded');
  const h = out.find((m) => m.type === 'healthy');
  if (!frames.length || !loaded || !h) throw new Error(`no state for ${id}`);
  return { id, frame: frames[frames.length - 1] as unknown as PresetFrame, params: loaded.params as DiseaseParams, healthyP: h.P as number[] };
}
