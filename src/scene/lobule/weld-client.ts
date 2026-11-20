// Planning the Lobule's welds takes about ten seconds of CPU (about 210 skins, each a remesh), far too long for a phone, so the plan is made once at BUILD time (scripts/bake-welds.mjs writes
// `lobule/welds.bin` into the site, weld-codec.ts) and the page only fetches and unpacks it: no planning on the phone. A file made for other numbers than this page's own (its digest) is never laid
// in. With no baked file (`npm run dev`, a build whose bake failed) the plan is made in a worker, never on the page's own thread. With no worker either (a test, an old browser) it is made where it
// is asked for, only when the caller says so (`inline`). The scene lays the plan in while the Lobule is out of sight, so nothing pops.
import { planWelds, type WeldCourse, type WeldPlan } from './welds.ts';
import { decodePlan, weldDigest } from './weld-codec.ts';

export interface WeldRequest { courses: WeldCourse[]; avoid: { x: number; y: number; r: number }[] }

/** Where the baked plan is, next to the page (the same folder in a preview and on the live site). */
export const BAKED_WELDS = 'lobule/welds.bin';

async function baked(req: WeldRequest): Promise<WeldPlan | null> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return null;
  try {
    const env = (import.meta as { env?: { BASE_URL?: string } }).env;
    const r = await fetch(`${env?.BASE_URL ?? '/'}${BAKED_WELDS}`);
    if (!r.ok) return null;
    // (a gzip file; no DecompressionStream, no baked plan: the worker plans it)
    if (typeof DecompressionStream === 'undefined' || !r.body) return null;
    return decodePlan(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(), weldDigest(req));
  } catch { return null; }
}

/** The plan for a network, or null when there is no baked plan and no worker to make it in (the Lobule then keeps its round-ended tubes). */
export async function requestWelds(req: WeldRequest, inline = false): Promise<WeldPlan | null> {
  if (inline) return planWelds(req.courses, { avoid: req.avoid });
  const b = await baked(req);
  if (b) return b;
  if (typeof Worker === 'undefined') return null;
  return new Promise((resolve) => {
    let w: Worker | null = null;
    try { w = new Worker(new URL('./weld-worker.ts', import.meta.url), { type: 'module' }); } catch { resolve(null); return; }
    w.onmessage = (e: MessageEvent<WeldPlan>) => { resolve(e.data); w?.terminate(); };
    w.onerror = () => { resolve(null); w?.terminate(); };
    w.postMessage(req);
  });
}
