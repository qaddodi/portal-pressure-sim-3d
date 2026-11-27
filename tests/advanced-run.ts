// The Advanced physiology panel's engine run, in one place for the test (tests/advanced.test.ts) and the generator of its departures (scripts/gen-advanced-numbers-3d.mjs): one engine, the
// patient loaded once; each edit is the patient's settings with one control moved, settled, read. The same sequence scripts/gen-advanced.mjs ran on the 2D engine to write advanced-2d.json.
import { createCore } from '../src/engine/hales/host/worker-core.js';

export async function runAdvanced(preset: string, keys: readonly string[], edits: ((p: unknown) => void)[]): Promise<Record<string, number>[]> {
  const got: { type: string; reqId?: number; params?: unknown; result?: Record<string, number> }[] = [];
  const core = createCore((m: never) => got.push(m));
  await core.handle({ type: 'init' });
  await core.handle({ type: 'run', running: false });
  await core.handle({ type: 'preset', id: preset, reqId: 1 });
  const base = got.find((m) => m.type === 'presetLoaded')!.params;
  const out: Record<string, number>[] = [];
  for (const [i, edit] of edits.entries()) {
    const params = structuredClone(base);
    edit(params);
    await core.handle({ type: 'setParams', params, settle: true });
    await core.handle({ type: 'metrics', reqId: 10 + i });
    const r = got.find((m) => m.type === 'metrics' && m.reqId === 10 + i)!.result!;
    out.push(Object.fromEntries(keys.map((k) => [k, Math.round(r[k]! * 1000) / 1000])));
  }
  core.dispose();
  return out;
}
