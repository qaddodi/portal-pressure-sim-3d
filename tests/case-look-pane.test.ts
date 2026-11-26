// Look closer opens the card in the state its label names (case/look-pane.ts, types.ts LookPane). Root of the bug (capture 0bc14020): `CaseLook` was { tool, label } and openLook only showed the pane,
// so "Pressures across the stent" opened the IR card on Measure, a stent's "Doppler" sampled whatever vessel the probe stood on last (the portal vein), "Pressure over time" opened the 10 s
// range on a pregnancy's days, and an HVPG look opened an empty tracing. The rule pinned here, for every course and every stop: a look that names a site or a mode opens in it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HISTORIES } from '../src/ui/histories/index.generated.ts';
import { COURSES } from '../src/ui/histories/courses.ts';
import { PROBES } from '../src/ui/tests/doppler/copied/doppler-tables.copied.js';
import { RANGES } from '../src/ui/tests/trace/model.ts';
import { applyLookPane, openLook } from '../src/ui/case/look-pane.ts';
import { useTests } from '../src/ui/tests/store.ts';
import { useTrace } from '../src/ui/tests/trace/store.ts';
import { useIr } from '../src/ui/tests/ir/store.ts';
import type { CaseLook } from '../src/ui/case/types.ts';

const probes = PROBES as { id: string; kind: string }[];
const kindOf = (id: string | undefined) => probes.find((p) => p.id === id)?.kind;
/** every look a course names (the baked ones: what the case really opens), with where it is */
const looks = (): { at: string; l: CaseLook }[] =>
  HISTORIES.flatMap((h) => (h.play?.stops ?? []).flatMap((o) => (o.look ?? []).map((l) => ({ at: `${h.id} Day ${o.day}`, l: l as CaseLook }))));

test('a look that names a site or a mode opens in it: the stent, the vessel, the range, the measurement', () => {
  const all = looks();
  assert.ok(all.length > 30, 'the courses have their looks');
  for (const { at, l } of all) {
    const w = `${at} "${l.label}"`;
    if (l.tool === 'doppler') {
      // (never the vessel the probe stood on last: every Doppler look names its own, and the label says which)
      assert.ok(l.pane?.probe && kindOf(l.pane.probe), `${w}: names a vessel the Doppler has`);
      if (/stent/i.test(l.label)) assert.equal(kindOf(l.pane.probe), 'tips', `${w}: a stent's Doppler samples the stent`);
      if (/hepatic vein/i.test(l.label)) assert.equal(kindOf(l.pane.probe), 'hepatic', `${w}: a hepatic vein's Doppler samples a hepatic vein`);
      if (/portal vein/i.test(l.label)) assert.equal(kindOf(l.pane.probe), 'portal', `${w}: a portal vein's Doppler samples a portal vein`);
    }
    if (l.tool === 'hvpg') {
      if (/stent/i.test(l.label)) assert.ok(l.pane?.stent, `${w}: the stent's pressures open on the TIPS tab`);
      else assert.equal(l.pane?.measure, true, `${w}: the HVPG opens measuring, not an empty tracing`);
    }
    if (l.tool === 'scope') assert.ok(RANGES.some(([id]) => id === l.pane?.range), `${w}: Over time opens on a range`);
    if (l.pane?.stent) assert.equal(l.tool, 'hvpg', `${w}: a stent tab is the IR card's`);
  }
  assert.ok(all.some(({ l }) => l.pane?.range === 'days'), 'pregnancy\'s pressure over time opens on the days');
  assert.ok(all.some(({ l }) => l.pane?.probe === 'TIPS') && all.some(({ l }) => l.pane?.probe === 'RHV_IVC'), 'the stent\'s and Budd-Chiari\'s Doppler each sample their own vessel');
});

test('the course table and the baked stops agree on every look\'s state', () => {
  const baked = new Map(looks().map(({ at, l }) => [`${at}|${l.label}`, JSON.stringify(l.pane ?? null)]));
  assert.ok(baked.size > 0);
  for (const c of COURSES) for (const o of c.play?.stops ?? []) for (const l of o.look ?? []) {
    const hit = [...baked].find(([k]) => k.startsWith(`${c.id} `) && k.endsWith(`|${l.label}`));
    assert.ok(hit, `${c.id}: "${l.label}" is baked`);
    assert.equal(hit[1], JSON.stringify(l.pane ?? null), `${c.id}: "${l.label}" is baked with its state (node scripts/gen-histories.mjs)`);
  }
});

test('opening a look sets the state it names through each pane\'s own store', async () => {
  const none = { tool: 'doppler', label: 'Doppler' } as CaseLook;
  await applyLookPane(none.pane);   // (a look with no state touches nothing)
  const scope = { tool: 'scope', label: 'Pressure over time', pane: { range: 'days' } } as CaseLook;
  useTrace.getState().setRange('beats');
  openLook(scope);
  await new Promise((r) => setImmediate(r));
  assert.equal(useTests.getState().pane, 'scope');
  assert.equal(useTrace.getState().range, 'days');
  // an HVPG look asks the IR pane for the measurement (the pane starts it once it is up); the TIPS look is on the TIPS tab, not Measure
  useIr.setState({ view: 'tips', measureAsk: 0, measureServed: 0 });
  await applyLookPane({ measure: true });
  assert.equal(useIr.getState().view, 'measure', 'the measurement is on the Measure tab');
  assert.equal(useIr.getState().takeMeasure(), true, 'one ask is waiting for the pane');
  assert.equal(useIr.getState().takeMeasure(), false, 'and is taken once: a pane mounted again does not measure again');
});
