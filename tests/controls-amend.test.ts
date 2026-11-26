// The controls' changes the owner chose after the audit (decks/overlay/controls.ts, 26 Nov): the response buttons stand for HVPG falls of about 5%, 15% and 25% on each slide's own
// patient (re-solved here on the engine host in node, so an engine change that moves them fails), each responder button speaks, partial embolization is shown at 4 weeks, and
// "Fenestrae open" is gone. A re-copy that moves what an amendment anchors on fails here too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { chainOf, sequencer, type StepResult } from '../src/decks/hp/numbers.ts';
import { loadSource } from '../src/decks/source.ts';
import { AG_LOADERS } from '../src/decks/ag/raw.ts';
import { HP_LOADERS } from '../src/decks/hp/raw.ts';
import { controlsOf } from '../src/decks/controls.ts';
import { variantStateOf, type Seq } from '../src/ui/talk/variant-state.ts';
import { RESPONSE, RESPONSE_FALLS, BUTTON_DAYS, NO_COMPARE } from '../src/decks/overlay/controls.ts';
import type { CopiedDeck, CopiedSlide } from '../src/decks/hp/types.ts';

const RAW: Record<string, () => Promise<unknown>> = { ...AG_LOADERS, ...HP_LOADERS };
const copyOf = async (id: string) => (await RAW[id]!()) as CopiedDeck;
const nodeSeq: Seq = async (steps, base) => {
  const got: { fp?: unknown; snap?: unknown; params?: unknown }[] = [];
  const core = createCore((m: { type: string; i?: number; fp?: unknown; snap?: unknown; params?: unknown }) => { if (m.type === 'seqStep') got[m.i!] = m; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps, base, reqId: 1 });
  core.dispose();
  return got;
};

for (const key of Object.keys(RESPONSE)) {
  test(`${key}: None, Usual and Strong give HVPG falls of about ${RESPONSE_FALLS.join(', ')}%, the slide's own is Usual, and None and Strong bring their lines`, { timeout: 300_000 }, async () => {
    const [deckId, slideId] = key.split('/') as [string, string];
    const d = await loadSource(deckId), slides = d.slides as CopiedSlide[], i = slides.findIndex((s) => s.id === slideId), s = slides[i]!;
    const seq = sequencer(1), core = createCore((m: never) => seq.message(m));
    core.handle({ type: 'run', running: false });
    await core.handle({ type: 'sequence', steps: chainOf(slides.slice(0, i + 1)), reqId: 1 });
    core.dispose();
    const res = (seq.results as StepResult[]).slice(1);
    const base = res[slides.findIndex((x) => x.id === s.hvpgResp)]!.fp.hvpg as number;
    const fall = (h: number) => (100 * (base - h)) / base;
    const opts = controlsOf(s)!.compare!.opts;
    assert.deepEqual(opts.map((o) => !!o.own), [false, true, false], 'the slide\'s own state is the usual responder\'s');
    assert.deepEqual(opts.map((o) => !!o.line), [true, false, true], 'None and Strong speak; Usual keeps the slide\'s line');
    for (const [k, o] of opts.entries()) {
      const got = o.own ? { state: { fp: res[i]!.fp } } : await variantStateOf(nodeSeq, new Map(), { slideKey: key }, o, res[i], undefined);
      const f = fall(got!.state!.fp.hvpg as number);
      assert.ok(Math.abs(f - RESPONSE_FALLS[k]!) <= 1.5, `${o.label}: the HVPG falls ${f.toFixed(1)}%, not about ${RESPONSE_FALLS[k]}%`);
    }
  });
}

test('the other amendments find what they anchor on in the copy, and land', async () => {
  for (const [k, b] of Object.entries(BUTTON_DAYS)) {
    const [deckId, slideId, label] = k.split('/') as [string, string, string];
    const copy = (await copyOf(deckId)).slides.find((s) => s.id === slideId) as { compare?: { label: string }[] } | undefined;
    assert.ok(copy?.compare?.some((o) => o.label === label), `${k}: the copy has the button`);
    const o = controlsOf((await loadSource(deckId)).slides.find((s) => s.id === slideId)!)!.compare!.opts.find((x) => x.label === b.label)!;
    assert.equal(o.days, b.days, `${k}: lives ${b.days} days`);
  }
  for (const k of NO_COMPARE) {
    const [deckId, slideId] = k.split('/') as [string, string];
    assert.ok((await copyOf(deckId)).slides.find((s) => s.id === slideId)?.compare, `${k}: the copy has the row`);
    assert.equal(controlsOf((await loadSource(deckId)).slides.find((s) => s.id === slideId)!)?.compare, undefined, `${k}: the row is gone`);
  }
  const start = (await loadSource('carvedilol')).slides.find((s) => s.id === 'start')!;
  assert.match(String(start.notes), /about 5%, with a usual responder about 15% and with a strong responder about 25%/, 'the notes say what the buttons give');
});
