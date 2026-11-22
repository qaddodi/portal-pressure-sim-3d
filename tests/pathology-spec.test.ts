// Plan 40: docs/pathology-spec.md is the gate. Its JSON block says, per preset, what the figure must show; this reads each preset's real engine state (node, no worker, no browser) and the scene's own rules
// (bodyTargets, lobuleModel and growGoal, collateralOpen, cavGrowth, caudateShownFor) and fails by preset name where they disagree. A new preset fails until it has a row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { PRESETS } from '../src/engine/hales/portal/scenario.js';
import { ACUTE_CLOT_RECRUITMENT } from '../src/engine/hales/portal/topology.js';
import { bodyTargets, type DiseaseFrame, type DiseaseParams } from '../src/scene/disease/targets.ts';
import { lobuleModel, type HealthyRef } from '../src/scene/lobule/model.ts';
import { growGoal } from '../src/scene/lobule/growth.ts';
import { CAV } from '../src/scene/vessels/cav.ts';
import { cavGrowth } from '../src/scene/vessels/cav.ts';
import { collateralOpen, feederLive, recruitFrac, type PresenceFrame } from '../src/scene/vessels/network.ts';
import { caudateShownFor } from '../src/scene/vessels/caudate-veins.ts';

interface Row {
  thrombus: string[]; stenosis?: string[]; lead: 'none' | 'septa' | 'tract' | 'cv'; open?: string[]; closed?: string[]; congestionMin?: number; spleenMin?: number; ascitesMin?: number;
  cavernomaChannelsMax?: number; cavernomaChannelsMin?: number; caudateShown?: boolean; varix?: Partial<Record<'VAR' | 'GV', [number, number]>>;
}
const md = readFileSync('docs/pathology-spec.md', 'utf8');
const spec = JSON.parse(/```json pathology-spec\n([\s\S]*?)```/.exec(md)![1]!) as { clotAnchor: Record<string, string>; presets: Record<string, Row> };

type Out = { type: string } & Record<string, unknown>;
async function load(id: string) {
  const out: Out[] = [];
  const core = createCore((m: never) => out.push(m));
  await core.handle({ type: 'init' });
  await core.handle({ type: 'run', running: false });
  await core.handle({ type: 'preset', id, reqId: 1 });
  await core.handle({ type: 'healthyProfile', reqId: 2 });
  core.dispose();
  const frame = out.filter((m) => m.type === 'frame').at(-1) as unknown as DiseaseFrame & PresenceFrame & { Q: Float32Array; metrics: unknown };
  const params = (out.find((m) => m.type === 'presetLoaded') as unknown as { params: DiseaseParams }).params;
  const h = out.find((m) => m.type === 'healthy') as unknown as { P: Float32Array; Q: Float32Array; metrics: { ascites: { hepLymph: number } } };
  return { frame, params, h, healthy: { P: h.P, Q: h.Q, hepLymph: h.metrics.ascites.hepLymph } as HealthyRef };
}
const ids = (PRESETS as { id: string }[]).map((p) => p.id);

test('every preset has a row, and no row is for a preset that is gone', () => {
  assert.deepEqual(ids.filter((i) => !spec.presets[i]), [], 'presets with no row in docs/pathology-spec.md');
  assert.deepEqual(Object.keys(spec.presets).filter((i) => !ids.includes(i)), [], 'rows for presets that do not exist');
});

test('every vein a preset clots has a clotAnchor', () => {
  const keys = new Set(Object.values(spec.presets).flatMap((r) => r.thrombus));
  for (const k of keys) assert.ok(spec.clotAnchor[k], `${k} is clotted by a preset and has no clotAnchor`);
});

for (const id of ids) {
  test(`${id}: the figure shows what the spec says`, async () => {
    const row = spec.presets[id];
    if (!row) return assert.fail(`${id}: no row in docs/pathology-spec.md`);
    const { frame, params, h, healthy } = await load(id);
    const bt = bodyTargets(frame, params, h.P);
    const why = (m: string) => `${id}: ${m}`;
    // thrombus and stenosis keys
    assert.deepEqual(Object.keys(params.thrombus ?? {}).filter((k) => (params.thrombus![k] ?? 0) > 0).sort(), [...row.thrombus].sort(), why('thrombus veins'));
    assert.deepEqual(Object.keys(params.stenosis ?? {}).filter((k) => (params.stenosis![k] ?? 0) > 0).sort(), [...(row.stenosis ?? [])].sort(), why('stenosis veins'));
    // which fibrosis channel leads
    const m = lobuleModel({ P: frame.P, Q: frame.Q, metrics: frame.metrics } as never, healthy, params);
    const [sep, tract, cv] = growGoal(m);
    const note = `septa ${sep.toFixed(2)}, tract ${tract.toFixed(2)}, CV ${cv.toFixed(2)}`;
    if (row.lead === 'septa') assert.ok(sep > Math.max(tract, cv) + 0.1, why(`septa lead: ${note}`));
    else if (row.lead === 'tract') assert.ok(tract > Math.max(sep, cv) && sep === 0, why(`tract leads: ${note}`));
    else if (row.lead === 'cv') assert.ok(cv > Math.max(sep, tract), why(`CV leads: ${note}`));
    else assert.ok(Math.max(sep, tract, cv) < 0.05, why(`no fibrosis: ${note}`));
    // collaterals open and closed (the figure's own rule)
    for (const c of row.open ?? []) assert.ok(collateralOpen(c, frame), why(`${c} drawn open`));
    for (const c of row.closed ?? []) assert.ok(!collateralOpen(c, frame), why(`${c} drawn closed`));
    // the cavernoma's extra channels (growth over 0.05)
    const channels = CAV.filter((_, i) => cavGrowth(i, recruitFrac('C8', frame)) > 0.05).length;
    if (row.cavernomaChannelsMax != null) assert.ok(channels <= row.cavernomaChannelsMax, why(`${channels} cavernoma channels, at most ${row.cavernomaChannelsMax}`));
    if (row.cavernomaChannelsMin != null) assert.ok(channels >= row.cavernomaChannelsMin, why(`${channels} cavernoma channels, at least ${row.cavernomaChannelsMin}`));
    // the caudate lobe: shown only where the spec says (no slide pin here)
    const live = feederLive({ host: 'CAUD', when: 'caudate' }, frame, h.Q);
    assert.equal(caudateShownFor(live, params, { lobe: false, veins: false }).lobe, !!row.caudateShown, why('caudate lobe shown'));
    // congestion, spleen, ascites, varices
    if (row.congestionMin != null) assert.ok(bt.congestion >= row.congestionMin, why(`congestion ${bt.congestion.toFixed(2)} >= ${row.congestionMin}`));
    if (row.spleenMin != null) assert.ok(bt.spleenScale >= row.spleenMin, why(`spleen ${bt.spleenScale.toFixed(2)} >= ${row.spleenMin}`));
    if (row.ascitesMin != null) assert.ok(bt.ascites >= row.ascitesMin, why(`ascites ${bt.ascites.toFixed(0)} mL >= ${row.ascitesMin}`));
    for (const [site, [lo, hi]] of Object.entries(row.varix ?? {}) as ['VAR' | 'GV', [number, number]][]) assert.ok(bt.varix[site] >= lo && bt.varix[site] <= hi, why(`${site} varix ${bt.varix[site].toFixed(2)} in [${lo}, ${hi}]`));
  });
}

test('the acute floor is the engine\'s own: C8 at the acute preset is open ACUTE_CLOT_RECRUITMENT, and there it grows no channel', async () => {
  const { frame } = await load('pvt-acute');
  assert.ok(Math.abs(recruitFrac('C8', frame) - ACUTE_CLOT_RECRUITMENT) < 0.01, `acute recruitment ${recruitFrac('C8', frame).toFixed(3)} against ${ACUTE_CLOT_RECRUITMENT}`);
  assert.deepEqual(CAV.map((_, i) => cavGrowth(i, ACUTE_CLOT_RECRUITMENT)), CAV.map(() => 0));
});
