// A procedure's graph ends where the procedure leaves the patient (src/ui/deck/proc-after.ts). Capture 3531bdfa, Shunts 7 (31.7.6): the line fell to a PPG of 10 and climbed back to the
// pre-TIPS 19.1 because the graph glided toward the slide's own fingerprint, and a slide that plays its procedure with no parameters of its own stands on the state BEFORE it.
// The general rule, for every slide of every deck that plays a procedure on a graph (evgraph): the state the graph ends in is the one with the procedure done, and for a TIPS (any kind)
// its PPG is below the PPG the slide opened on. The engine host in node, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { chainOf, sequencer, type StepResult } from '../src/decks/hp/numbers.ts';
import { loadSource } from '../src/decks/source.ts';
import { afterProcedureFp } from '../src/ui/deck/proc-after.ts';
import { eventGraphOf, evSample } from '../src/ui/charts/evgraph/model.ts';
import { specOf, procKindOf } from '../src/scene/procedures/copied/proc-anim.js';
import type { Seq } from '../src/ui/talk/variant-state.ts';
import type { CopiedSlide } from '../src/decks/hp/types.ts';

const nodeSeq: Seq = async (steps, base) => {
  const got: { fp?: unknown; snap?: unknown; params?: unknown }[] = [];
  const core = createCore((m: { type: string; i?: number; fp?: unknown }) => { if (m.type === 'seqStep') got[m.i!] = m; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps, base, reqId: 1 });
  core.dispose();
  return got;
};

// (the decks that play a TIPS on a graph; the rest of the graphs' procedures have their result in the slide's own parameters, and the sequence for them is the slow part)
const DECKS = ['shunts', 'tips-complete'];
test('every procedure graph ends in the state with the procedure done: a TIPS ends below where it began', { timeout: 300_000 }, async () => {
  const seen: string[] = [];
  for (const id of DECKS) {
    const d = await loadSource(id), slides = d.slides as CopiedSlide[];
    const at = slides.map((s, i) => (eventGraphOf(s as never) ? i : -1)).filter((i) => i >= 0);
    if (!at.length) continue;
    const seq = sequencer(1), core = createCore((m: never) => seq.message(m));
    core.handle({ type: 'run', running: false });
    await core.handle({ type: 'sequence', steps: chainOf(slides.slice(0, Math.max(...at) + 1)), reqId: 1 });
    core.dispose();
    const res = (seq.results as StepResult[]).slice(1);
    for (const i of at) {
      const s = slides[i]!, spec = eventGraphOf(s as never)!, sp = specOf(procKindOf(s.procedure as never) ?? '') as { had(p: unknown): boolean; apply(p: unknown): unknown };
      const own = res[i]!, fp = await afterProcedureFp(sp, own, nodeSeq) as Record<string, number> | null;
      assert.ok(fp, `${id}/${s.id}: the state after the procedure is worked out`);
      const [a] = spec.lines, o = own.fp as Record<string, number>;
      seen.push(`${id}/${s.id} ${spec.kind} ${a} ${o[a]?.toFixed(1)} → ${fp[a]?.toFixed(1)}`);
      if (spec.kind === 'tips' || spec.kind === 'tipscoil' || spec.kind === 'tipscoilin') {
        const had = sp.had(own.params);
        if (!had) assert.ok(fp.ppg! < o.ppg! - 3, `${id}/${s.id}: after the TIPS the PPG (${fp.ppg}) is well below the opening ${o.ppg}`);
        // the graph's last point is the settled state's: handed the state after, the line ends there, not back up on the one before
        const [end] = evSample(spec, 60, o, fp);
        assert.ok(Math.abs(end - fp[a]!) < 1e-6 && Math.abs(end - o[a]!) > 3, `${id}/${s.id}: the line ends on ${fp[a]}, not on ${o[a]}`);
      }
    }
  }
  assert.ok(seen.some((x) => x.startsWith('shunts/play')), `Shunts 7 is judged: ${seen.join('; ')}`);
});
