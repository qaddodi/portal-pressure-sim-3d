// The real states of the figure's vessel widths, for the network mesh's keys (src/scene/vessels/net/keys.ts): for each engine preset, every skeleton edge's swell (widthSwell of the engine's diameter for the vessel the edge is part of; 1 for an id the network does not know,
// a fixed width or no diameter). Node only (it runs the engine core, as scripts/gen-engine-fixture.mjs does).
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { indexOf } from '../src/engine/vessel-data.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { widthSwell } from '../src/scene/vessels/live-width.ts';

export async function presetSwells(skel) {
  const out = [], core = createCore((m) => out.push(m));
  await core.handle({ type: 'init' }); await core.handle({ type: 'run', running: false });
  await core.handle({ type: 'presets', reqId: 0 });
  const msg = out.find((m) => m.type === 'presets'), ids = (msg?.list ?? msg?.presets ?? []).map((p) => p.id ?? p);
  const states = []; let rid = 1;
  for (const id of ids) {
    out.length = 0;
    await core.handle({ type: 'preset', id, reqId: rid++ });
    const f = out.filter((m) => m.type === 'frame').pop();
    if (!f) continue;
    states.push(skel.edges.map((e) => { const v = NETWORK_BY_ID.get(e.id.split('#')[0]); return v ? widthSwell(v.widthKind, v.baseD, f.D?.[indexOf(v.lensId)]) : 1; }));
  }
  core.dispose();
  return states;
}
