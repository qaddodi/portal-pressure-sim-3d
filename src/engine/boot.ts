// Starts the engine for the app: the worker, the first patient, the clock hand-over.
import { EngineClient, type WorkerLike } from './client.ts';
import { sanitizeParams } from './hales/portal/scenario.js';
import { adoptFrame, patient, resetParamsRev, setParams, useEngine } from './store.ts';
import { clock } from '../clock/frame.ts';
import { enginePool } from './pool.ts';
import type { FromWorker } from './hales/host/protocol.d.ts';

export const START_PRESET = 'healthy';   // the patient a first run opens on, as the 2D app's store (presetId: 'healthy'); a ?preset= link or a saved share opens another after it

let client: EngineClient | null = null;
export const engine = (): EngineClient => { if (!client) throw new Error('engine not started'); return client; };

/** How long the first patient may take before the boot gives up on a worker that never answers (a blocked or stalled worker file). Long, so a slow first load still gets its worker. */
export const BOOT_WAIT_MS = 30000;
const crashed = (message: string) => useEngine.setState({ status: 'crashed', crash: message });

/** Start the engine. `worker` is injectable for tests; the app passes nothing and gets the real worker. A worker that cannot be made, fails, or never answers within `waitMs`
 *  rejects and leaves the status 'crashed' with the reason: the boot never waits for ever (main.tsx then shows the reason with Reload). */
export async function bootEngine(worker?: WorkerLike, preset = START_PRESET, waitMs = BOOT_WAIT_MS): Promise<EngineClient> {
  if (!worker) {
    try { worker = enginePool.live(); }
    catch (e) { crashed((e as Error).message); throw e; }
  }
  let loaded = false;   // (frames of the default patient, posted before the first patient is loaded, are never adopted)
  client = new EngineClient(worker, {
    onFrame: (f) => { if (!loaded) return; adoptFrame(f); clock.invalidate('engine-frame'); },
    onCrash: crashed,
  });
  const mine = client;
  const late = clock.afterReal(() => mine.crash('The simulation did not answer. Check the connection, then reload.'), waitMs);
  resetParamsRev();   // (a new host counts its setParams from 0)
  client.send({ type: 'init' });
  const [loadedPreset, healthy] = await Promise.all([
    client.request<Extract<FromWorker, { type: 'presetLoaded' }>>({ type: 'preset', id: preset }),
    client.request<{ type: 'healthy'; reqId: number; P: number[]; Q: number[]; metrics: { ascites?: { hepLymph?: number }; hepLymph?: number } }>({ type: 'healthyProfile' }),
  ]).finally(() => clock.cancel(late));
  setParams(sanitizeParams(loadedPreset.params));
  patient.reference = { P: healthy.P, Q: healthy.Q, hepLymph: healthy.metrics.ascites?.hepLymph ?? healthy.metrics.hepLymph };
  loaded = true;
  useEngine.setState({ presetId: preset });
  return client;
}
