// Starts the engine for the app: the worker, the first patient, the clock hand-over.
import { EngineClient, type WorkerLike } from './client.ts';
import { adoptFrame, patient, setParams, useEngine } from './store.ts';
import { clock } from '../clock/frame.ts';
import type { FromWorker } from './protocol.ts';

export const SLICE_PRESET = 'csph';   // the slice's patient: cirrhosis with clinically significant portal hypertension

let client: EngineClient | null = null;
export const engine = (): EngineClient => { if (!client) throw new Error('engine not started'); return client; };

/** Start the engine. `worker` is injectable for tests; the app passes nothing and gets the real worker. */
export async function bootEngine(worker: WorkerLike = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike, preset = SLICE_PRESET): Promise<EngineClient> {
  let loaded = false;   // (frames of the default patient, posted before the first patient is loaded, are never adopted)
  client = new EngineClient(worker, {
    onFrame: (f) => { if (!loaded) return; adoptFrame(f); clock.invalidate('engine-frame'); },
    onCrash: (message) => useEngine.setState({ status: 'crashed', crash: message }),
  });
  client.send({ type: 'init' });
  const [loadedPreset, healthy] = await Promise.all([
    client.request<Extract<FromWorker, { type: 'presetLoaded' }>>({ type: 'preset', id: preset }),
    client.request<{ type: 'healthy'; reqId: number; P: number[]; Q: number[]; metrics: { ascites?: { hepLymph?: number }; hepLymph?: number } }>({ type: 'healthyProfile' }),
  ]);
  setParams(loadedPreset.params);
  patient.reference = { P: healthy.P, Q: healthy.Q, hepLymph: healthy.metrics.ascites?.hepLymph ?? healthy.metrics.hepLymph };
  loaded = true;
  useEngine.setState({ presetId: preset });
  return client;
}
