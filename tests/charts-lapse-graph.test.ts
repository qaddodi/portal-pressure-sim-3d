// The time-lapse graph (2D lapse-graph.js + slide-instrument.js, PC-6: the graph is the slide's instrument card): every time-lapse slide that names no instrument and has two plottable tiles gets the
// flow-time chart, the deck's model steps ask the engine for that chart's trail (one point a day), and a procedure slide gets its event graph and its `before` state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pinned2D } from './two-d-pin.ts';
import { createCore } from '../src/engine/host/worker-core.js';
import { loadAgDeck, AG_IDS } from '../src/decks/ag/index.ts';
import { loadHpDeck, HP_IDS } from '../src/decks/hp/index.ts';
import { RW_IDS } from '../src/decks/rw/copied/index.ts';
import { DECKS as RW } from '../src/decks/rw/copied/all.ts';
import { chainOf, sequencer, stepOf } from '../src/decks/hp/numbers.ts';
import { instrumentOf } from '../src/ui/talk/slide-instrument.generated.js';
import { graphLines, lapseGraphOf } from '../src/ui/charts/flowtime/lapse-graph.generated.js';
import { flowTimeSeries } from '../src/ui/charts/flowtime/model.ts';
import type { CopiedDeck, CopiedSlide } from '../src/decks/hp/types.ts';

const decks = async (): Promise<CopiedDeck[]> => [
  ...(await Promise.all(AG_IDS.map((id) => loadAgDeck(id)))), ...(await Promise.all(HP_IDS.filter((id) => id !== 'hvpg').map((id) => loadHpDeck(id)))), ...RW_IDS.map((id) => RW[id]!),
] as unknown as CopiedDeck[];

test('a time-lapse slide with two plottable tiles and no instrument gets the flow-time chart; a slide that names an instrument or graph: false keeps it as it is', () => {
  assert.deepEqual(instrumentOf({ id: 'a', lapse: { seconds: 5 }, days: 30, tiles: ['pv', 'pvFlow'] } as never).tool, { kind: 'flowtime', clock: 'days', lines: ['pv', 'pvFlow'] });
  assert.equal(instrumentOf({ id: 'a', lapse: {}, tiles: ['pv', 'pvFlow'], graph: false } as never).tool, undefined);
  const own = { id: 'a', lapse: {}, tiles: ['pv', 'pvFlow'], tool: { kind: 'doppler' } };
  assert.equal(instrumentOf(own as never), own);
  assert.equal(instrumentOf({ id: 'a', lapse: {}, tiles: ['pv'] } as never).tool, undefined, 'one reading: no graph');
  assert.deepEqual(lapseGraphOf({ lapse: {}, ramp: { meal: [0, 1] }, graph: ['map', 'co'] }), { clock: 'meal', lines: ['map', 'co'] });
  assert.equal(graphLines({ days: 3, tiles: ['pv', 'asc'] }), null, 'no lapse, no graph');
});

test('the deck steps of a flow-time slide ask the engine for its lines (one point a day), a procedure slide for its before state', async () => {
  const all = await decks();
  // (the copied decks name this chart as the slide's tool already, as the 2D decks do; what was missing is the steps' ask for its trail)
  const got = all.flatMap((d) => d.slides.map((s, i) => ({ d, s, i })).filter((x) => x.i > 0 && x.s.lapse && (x.s.tool as { kind?: string } | undefined)?.kind === 'flowtime'));
  assert.ok(got.length > 30, `${got.length} time-lapse slides carry the chart`);
  const pick = got.find((x) => (x.s.days as number) <= 60 && !x.s.preset) ?? got[0]!;
  const d = pick.d;
  assert.ok(stepOf(d.slides[pick.i]!).trail, 'the step asks for the trail');
  const seq = sequencer(1);
  const core = createCore((m: never) => seq.message(m));
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps: chainOf(d.slides.slice(0, pick.i + 1)), reqId: 1 });
  core.dispose();
  const tr = seq.results[pick.i + 1]!.trail as number[][];
  assert.ok(Array.isArray(tr) && tr.length === (pick.s.days as number) + 1, `${pick.d.id}/${pick.s.id}: a point a day`);
  const t = d.slides[pick.i]!.tool as { clock?: 'meal' | 'days'; lines?: string[] };
  assert.ok(flowTimeSeries(tr, t.clock ?? 'meal', t.lines), 'the chart can draw it');
  // a procedure's `before`
  const tips = (await decks()).flatMap((x) => x.slides).find((s) => s.procedure === 'tips' || (s.procedure as { kind?: string } | undefined)?.kind === 'tips');
  assert.ok(tips && (stepOf(tips) as { before?: unknown }).before, 'a TIPS slide opens on its state before the stent');
});

const two = pinned2D('src/ui/lapse-graph.js');
test('the copied lapse-graph.js and slide-instrument.js are what the 2D app has at the pin (when its checkout is here)', { skip: two.skip }, () => {
  execFileSync('node', ['scripts/copy-chart-lapse.mjs', '--from', two.repo, '--check'], { stdio: 'pipe' });
});
