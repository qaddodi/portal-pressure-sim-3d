#!/usr/bin/env node
// The node-side scene audit (code review 21 Nov, #7): drives the real CelScene with real engine frames, no browser, no GPU, and judges what the CPU side can judge:
//   • rebuild storms and stalls: junction-skin rebuilds and the slowest update() of each step (a step fails past the budgets below);
//   • pops: an eased value (a vessel's presence, the circuit's change, the cava's share) that moves more than POP in one 16 ms frame;
//   • stuck eases: a goal that has not reached its target after the step (the short-circuit `||` bug class: a skipped step leaves the cava at 0 while its goal is 1);
//   • the cost of the scene itself (construct ms, whether the baked skins were laid in).
// Run `node scripts/scene-audit.mjs [--presets healthy,csph,...] [--steps presets,collaterals,bands,pick,views,play] [--seconds 2.5] [--json] [--strict]`.
// Needs the baked skins (`node scripts/bake-skins.mjs` once; `npm test` does it): without them the scene remeshes live, ~35 s. Exits 1 under --strict when any step fails.
// Node CPU only: multiply update times by 2 to 4 for a phone; nothing here sees the GPU or the compositor (docs/code review 2.4).
import { createCore } from '../src/engine/host/worker-core.js';
import { adoptFrame } from '../src/engine/store.ts';
import { forgeFrame } from '../src/engine/force-all.ts';
import { CelScene } from '../src/scene/scene.ts';
import { bakedSkins } from '../src/scene/vessels/skin/baked.ts';
import { NETWORK } from '../src/scene/vessels/network.ts';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const json = process.argv.includes('--json'), strict = process.argv.includes('--strict');
const SECONDS = Number(arg('seconds', 2.5)), DT = 16;
/** The budgets a step is judged by (node CPU; a phone is 2 to 4 times slower). */
export const BUDGET = { updateMs: 50, rebuilds: 3, pop: 0.5, settle: 1e-3 };
const STEPS = (arg('steps', 'presets,collaterals,bands,pick,views,play')).split(',');

const out = []; const core = createCore((m) => out.push(m));
await core.handle({ type: 'init' }); await core.handle({ type: 'run', running: false });
await core.handle({ type: 'presets', reqId: 0 });
const list = (out.find((m) => m.type === 'presets')?.list ?? out.find((m) => m.type === 'presets')?.presets ?? []).map((p) => p.id ?? p);
const presets = arg('presets', 'healthy,csph,cirr-decomp').split(',').filter((p) => !list.length || list.includes(p));
const frames = new Map();
let rid = 1;
for (const id of presets) {
  out.length = 0;
  await core.handle({ type: 'preset', id, reqId: rid++ });
  const f = out.filter((m) => m.type === 'frame').pop();
  if (f) frames.set(id, f);
}
await core.handle({ type: 'healthyProfile', reqId: rid++ });
core.dispose();

const t0 = Date.now();
const scene = new CelScene();
const construct = { ms: Date.now() - t0, baked: !!bakedSkins() };

/** The eased values that must never jump: [name, read]. Private fields are read on purpose; a renamed one reads undefined and is reported by `missing`. */
const probes = new Map();
// (what is DRAWN: the shader's reveal, which a driven vessel's own clock eases; `presence.amountOf` is only the state of those)
for (const v of NETWORK) { const o = scene.vesselObject(v.id); if (o?.toon?.uniforms?.reveal) probes.set(`reveal:${v.id}`, () => (o.group.visible ? o.toon.uniforms.reveal.value : 0)); }
probes.set('circuit.t', () => scene.circuit.t);
probes.set('cavaWhole', () => scene.cavaWhole);
probes.set('fadeNow', () => scene.fadeNow);
const missing = ['circuit.t', 'cavaWhole', 'fadeNow'].filter((k) => typeof probes.get(k)() !== 'number');

let clockNow = 0;
const stats = () => ({ rebuilds: 0, worstMs: 0, lastNode: '', ...(scene.skins?.stats ?? {}) });
/** Run `seconds` of frames from the scene's own clock; `each(t)` may feed a frame first. Returns the step's row. */
function run(name, begin, { each = null, goals = null, instant = false } = {}) {
  const before = new Map([...probes].map(([k, f]) => [k, f()])), s0 = stats();
  begin();
  let worst = 0, worstAt = 0, prev = before, over50 = 0; const pops = new Map();
  for (let t = 0; t <= SECONDS * 1000; t += DT) {
    each?.(t); clockNow += DT;
    const a = performance.now(); scene.update(clockNow); const ms = performance.now() - a;
    if (ms > worst) { worst = ms; worstAt = t; }
    if (ms > BUDGET.updateMs) over50++;
    for (const [k, f] of probes) { const v = f(), d = Math.abs(v - prev.get(k)); if (d > BUDGET.pop && !pops.has(k)) pops.set(k, { at: t, from: +prev.get(k).toFixed(3), to: +v.toFixed(3) }); prev.set(k, v); }
  }
  const s1 = stats(), stuck = [];
  for (const [k, goal, now] of goals?.() ?? []) if (Math.abs(goal - now) > BUDGET.settle) stuck.push(`${k}: goal ${goal}, now ${+now.toFixed(3)}`);
  const row = { step: name, updateMaxMs: +worst.toFixed(1), at: worstAt, over50, rebuilds: s1.rebuilds - s0.rebuilds, worstRebuildMs: +s1.worstMs.toFixed(0), lastNode: s1.lastNode, pops: [...pops].map(([k, v]) => ({ k, ...v })), stuck };
  row.fail = [];
  if (row.updateMaxMs > BUDGET.updateMs) row.fail.push(`update ${row.updateMaxMs} ms > ${BUDGET.updateMs}`);
  if (row.rebuilds > BUDGET.rebuilds) row.fail.push(`${row.rebuilds} skin rebuilds > ${BUDGET.rebuilds} (${row.lastNode})`);
  if (instant) row.pops = [];
  if (row.pops.length) row.fail.push(`${row.pops.length} pop candidate(s): ${row.pops.slice(0, 3).map((p) => p.k).join(', ')}`);
  if (row.stuck.length) row.fail.push(`stuck: ${row.stuck.join('; ')}`);
  return row;
}
const adopt = (f) => { adoptFrame(f); scene.dataChanged(); };
const rows = [];
const first = frames.get(presets[0]);
if (first) { adopt(first); rows.push(run('boot', () => {}, { instant: true })); }   // (the first frame settles the figure at once: its reveals jump by design, only the cost is judged)

if (STEPS.includes('presets')) for (let i = 1; i < presets.length; i++) { const f = frames.get(presets[i]); if (f) rows.push(run(`preset ${presets[i - 1]} -> ${presets[i]}`, () => adopt(f))); }
const base = frames.get(presets.at(-1)) ?? first;
if (base && STEPS.includes('collaterals')) {
  rows.push(run('collaterals open', () => { scene.setBlood({ collaterals: true }); adopt(forgeFrame(base, { collaterals: true, shunts: true })); }));
  rows.push(run('collaterals closed', () => { adopt(base); scene.setBlood({ collaterals: false }); }));
}
if (base && STEPS.includes('bands')) {
  rows.push(run('bands 3', () => adopt({ ...base, bands: 3 })));
  rows.push(run('bands 0', () => adopt({ ...base, bands: 0 })));
}
if (STEPS.includes('pick')) {
  rows.push(run('pick the cava', () => scene.pick('IVC_IS') ?? scene.setNamedVessels(['IVC_IS']), { goals: () => [['cavaWhole', scene.cavaGoal, scene.cavaWhole]] }));
  // the same with the model PLAYING (a new frame every 100 ms: the blood streams move every frame): the case a short-circuit `||` hides
  rows.push(run('pick the cava, playing', () => { scene.pick(null); scene.setNamedVessels([]); }, { each: (t) => { if (t % 96 === 0) adopt({ ...base, running: true, gen: (base.gen ?? 0) + 1 + t }); } }));
  rows.push(run('pick the cava, playing (2)', () => scene.setNamedVessels(['IVC_IS']), { each: (t) => { if (t % 96 === 0) adopt({ ...base, running: true, gen: (base.gen ?? 0) + 1000 + t }); }, goals: () => [['cavaWhole (playing)', scene.cavaGoal, scene.cavaWhole]] }));
  scene.setNamedVessels([]); scene.pick(null);
}
if (STEPS.includes('views')) for (const v of ['circuit', 'body', 'lobule', 'sinusoid', 'body']) rows.push(run(`view -> ${v}`, () => scene.setView(v, clockNow)));
if (base && STEPS.includes('play')) rows.push(run('play (steady)', () => {}, { each: (t) => { if (t % 96 === 0) adopt({ ...base, running: true, gen: (base.gen ?? 0) + 5000 + t }); } }));

const failed = rows.filter((r) => r.fail.length);
if (json) console.log(JSON.stringify({ construct, missing, budget: BUDGET, rows }, null, 1));
else {
  console.log(`scene audit (node CPU, no GPU): scene built in ${construct.ms} ms, baked skins ${construct.baked ? 'laid in' : 'NOT in (live remesh; run scripts/bake-skins.mjs)'}${missing.length ? `, probes missing: ${missing.join(', ')}` : ''}`);
  console.log('step'.padEnd(34) + 'maxMs  >50  rebuilds  result');
  for (const r of rows) console.log(r.step.padEnd(34) + String(r.updateMaxMs).padStart(5) + String(r.over50).padStart(5) + String(r.rebuilds).padStart(9) + '  ' + (r.fail.length ? 'FAIL ' + r.fail.join(' | ') : 'ok'));
  console.log(`${rows.length - failed.length}/${rows.length} steps ok${failed.length ? `; ${failed.length} failed` : ''}. Numbers are node CPU; a phone is 2 to 4x slower.`);
}
scene.dispose();
process.exit(strict && (failed.length || missing.length) ? 1 : 0);
