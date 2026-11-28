// Adds to tests/fixtures/actions-2d.json, for each of the six patients, the engine's own frame in TODAY's node and edge order (`fresh`), taken the way scripts/gen-actions.mjs takes the recorded one.
// The recorded frames are the 2D app's, in the engine's order before the junction table (27 Nov); the table added nodes and pieces between the old ones. tests/frame-by-id.ts lays the recorded frame
// out again by id and takes only what the recorded frame cannot have (a new junction node, the piece of a split vein) from `fresh`. Run after a pin move that adds nodes or edges.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCore } from '../src/engine/hales/host/worker-core.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(root, 'tests/fixtures/actions-2d.json');
const fx = JSON.parse(readFileSync(file, 'utf8'));
const frames = [];
const core = createCore((m) => frames.push(m));
await core.handle({ type: 'init' }); await core.handle({ type: 'run', running: false });
for (const id of fx.presets) {
  frames.length = 0;
  await core.handle({ type: 'preset', id, reqId: 1 });
  await core.handle({ type: 'healthyProfile', reqId: 2 });
  const h = frames.find((m) => m.type === 'healthy'), f = frames.filter((m) => m.type === 'frame').pop();
  fx.patients[id].fresh = { P: Array.from(f.P), Pf: Array.from(f.Pf), Q: Array.from(f.Q), Qf: Array.from(f.Qf), D: Array.from(f.D), hP: Array.from(h.P), hQ: Array.from(h.Q) };
}
core.dispose();
writeFileSync(file, JSON.stringify(fx) + '\n');
console.log(`fresh frames for ${fx.presets.length} patients`);
