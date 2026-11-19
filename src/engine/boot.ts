// Starts the engine for the app: the worker, the first patient, the clock hand-over.
import { EngineClient, type WorkerLike } from './client.ts';
import { adoptFrame, useEngine } from './store.ts';
import { clock } from '../clock/frame.ts';

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
  await client.request({ type: 'preset', id: preset });
  loaded = true;
  useEngine.setState({ presetId: preset });
  return client;
}
