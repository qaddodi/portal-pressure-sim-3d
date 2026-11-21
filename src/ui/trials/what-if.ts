// The Model line's question to the engine: this patient settled as they are and settled with a trial's treatment (the host's `whatIfOf`, 2D trials-pane.js paintModel). It runs on the second engine (the one the
// deck's states use, one worker of its own), from the live patient's snapshot, so the live clock, the Doppler and the traces keep going while the card computes (bible ENG-7). One question per patient and treatment.
import { engine } from '../../engine/index.ts';
import type { ToWorker } from '../../engine/index.ts';
import { enginePool } from '../../engine/pool.ts';
import type { WhatIf } from './trials-model.ts';

const second = enginePool.whatIf;   // (the third engine, its start, its crash and its stall rule: engine/pool.ts)
const waiting = new Map<number, (r: WhatIf | null) => void>();
let nextReq = 1;

// (the engine answers 'whatIf'; a crash or a stall settles every question waiting with no answer, and the next one starts a fresh engine)
second.subscribe((m) => {
  if (m.type === 'crash') { for (const [id, r] of waiting) { r(null); waiting.delete(id); } return; }   // (the engine is gone: nothing waits for it)
  if ((m.type === 'whatIf' || m.type === 'error') && m.reqId != null) { waiting.get(m.reqId)?.(m.type === 'whatIf' ? (m.result as WhatIf | undefined) ?? null : null); waiting.delete(m.reqId); if (!waiting.size) second.idle(); }
});

const answers = new Map<string, Promise<WhatIf | null>>();
/** The answers that are in, so a card drawn again reads them at once. */
export const settledFor = new Map<string, WhatIf>();
/** The answer for this patient and treatment (asked once): null when the engine gave none. `key` names the patient and the treatment together. */
export function whatIf(key: string, patch: unknown): Promise<WhatIf | null> {
  let p = answers.get(key);
  if (!p) {
    p = (async () => {
      const snap = ((await engine().request({ type: 'snapshot' } as ToWorker)) as unknown as { snap?: unknown }).snap;
      if (!snap) return null;
      return new Promise<WhatIf | null>((resolve) => { const reqId = nextReq++; waiting.set(reqId, resolve); second.post({ type: 'whatIfOf', snap, patch, reqId }); });
    })().catch(() => null);
    answers.set(key, p);
    void p.then((r) => { if (!r) answers.delete(key); else settledFor.set(key, r); });   // (an answer that failed is asked again the next time)
  }
  return p;
}
