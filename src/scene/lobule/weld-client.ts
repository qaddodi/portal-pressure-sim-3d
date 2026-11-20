// Planning the Lobule's welds takes a few seconds of CPU (about 170 skins, each a remesh), so it runs in a worker started at boot, never on the page's own thread. The scene lays the plan in when it
// arrives, while the Lobule is out of sight. With no worker (a test, an old browser) the plan is made where it is asked for, only when the caller says so (`inline`).
import { planWelds, type WeldCourse, type WeldPlan } from './welds.ts';

export interface WeldRequest { courses: WeldCourse[]; avoid: { x: number; y: number; r: number }[] }

/** The plan for a network, or null when there is no worker to make it in (the Lobule then keeps its round-ended tubes). */
export function requestWelds(req: WeldRequest, inline = false): Promise<WeldPlan | null> {
  if (inline) return Promise.resolve().then(() => planWelds(req.courses, { avoid: req.avoid }));
  if (typeof Worker === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let w: Worker | null = null;
    try { w = new Worker(new URL('./weld-worker.ts', import.meta.url), { type: 'module' }); } catch { resolve(null); return; }
    w.onmessage = (e: MessageEvent<WeldPlan>) => { resolve(e.data); w?.terminate(); };
    w.onerror = () => { resolve(null); w?.terminate(); };
    w.postMessage(req);
  });
}
