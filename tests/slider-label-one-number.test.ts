// Mohammad, 28 Nov (Cardiac 6, the tricuspid regurgitation slider): the card said "right atrium is 19.7 mmHg" (header and words) and the figure's label said RA 19.8. One number, one source (project rule 11).
// Root cause: the label reads the slide's settled pressures only while the live model has come to rest within a hair of them (scene/labels/settled.ts atRest); a slider eases the live model in without
// settling (controls-run.ts dragWhatIf), so for seconds, and for good where it never lands inside the band, the label read the live digit while the words, tiles and charts printed the pressed state's.
// Now a slide with a pressed control (`useVariant` on the slide) holds the label on the state the words print (setShownFp hold). Held here at every value of every what-if slider of every deck, against a
// live frame a few tenths off on every node: every station that takes a reading from the slide's state prints that state's digit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copiedDecks } from './helpers-deck-chain.ts';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { chainOf, sequencer } from '../src/decks/hp/numbers.ts';
import { patchOf } from '../src/decks/controls.ts';
import { settledFrame, setShownFp } from '../src/scene/labels/settled.ts';
import { stationP } from '../src/ui/action/read.ts';
import { fmtPressure } from '../src/ui/text/line.ts';
import type { CopiedSlide } from '../src/decks/hp/types.ts';

const KEY: Record<string, string> = { CONF: 'pv', SIN_R: 'whvp', RHV: 'fhvp', IVCS: 'ivc', RA: 'ra' };

test('a pressed what-if slider: every station label prints the digit the slide\'s words print, at the slider\'s two ends, on every slider of every deck', async () => {
  let checked = 0, unheldDiffered = 0;
  for (const d of await copiedDecks()) {
    const slides = d.slides as CopiedSlide[];
    const sl = slides.map((s, i) => ({ s, i })).filter((x) => (x.s as unknown as { whatIf?: { param?: unknown } }).whatIf?.param);
    if (!sl.length) continue;
    const upto = Math.max(...sl.map((x) => x.i));
    const seq = sequencer(1), core = createCore((m: never) => seq.message(m));
    core.handle({ type: 'run', running: false });
    await core.handle({ type: 'sequence', steps: chainOf(slides.slice(0, upto + 1) as never), reqId: 1 });
    core.dispose();
    for (const { s, i } of sl) {
      const w = (s as unknown as { whatIf: { param: string | string[]; min: number; max: number } }).whatIf, paths = Array.isArray(w.param) ? w.param : [w.param];
      const own = seq.results[i + 1] as unknown as { base: unknown };
      for (const x of [w.min, w.max]) {
        const got: { fp?: Record<string, unknown> }[] = [];
        const c = createCore((m: { type: string; i?: number }) => { if (m.type === 'seqStep') got[m.i!] = m as never; });
        c.handle({ type: 'run', running: false });
        await c.handle({ type: 'sequence', steps: [{ params: patchOf(paths, x) }], base: own.base, reqId: 1 });
        c.dispose();
        const fp = got[0]?.fp as { at: { P: ArrayLike<number>; Q: ArrayLike<number> } } & Record<string, unknown>;
        assert.ok(fp?.at?.P, `${d.id}/${s.id} at ${x}: a state`);
        // (a live frame still easing to the state: every node and flow a few tenths off, the bottom bar's readings with it)
        const live = {
          P: Float32Array.from(Array.from(fp.at.P), (v) => v + 0.45), Pf: Float32Array.from(Array.from(fp.at.P), (v) => v + 0.45),
          Q: Float32Array.from(Array.from(fp.at.Q), (v) => v * 1.1), Qf: Float32Array.from(Array.from(fp.at.Q), (v) => v * 1.1),
          metrics: { ra: Number(fp.ra) + 0.1, vitals: { ra: Number(fp.ra) + 0.1 }, pv: Number(fp.pv) + 0.4, whvp: Number(fp.whvp) + 0.4, fhvp: Number(fp.fhvp) + 0.4, ivc: Number(fp.ivc) + 0.4 },
        };
        const label = (id: string, held: boolean) => { setShownFp(fp as never, held); const v = settledFrame(live as never, fp as never) as unknown as typeof live; return fmtPressure(stationP(v as never, id, v.Pf)); };
        for (const [id, key] of Object.entries(KEY)) {
          const want = fmtPressure(Number(fp[key]));
          if (!Number.isFinite(Number(fp[key]))) continue;
          assert.equal(label(id, true), want, `${d.id}/${s.id} at ${x}: the ${id} label prints ${key} as the words do`);
          if (label(id, false) !== want) unheldDiffered++;
          checked++;
        }
      }
    }
  }
  setShownFp(null);
  assert.ok(checked >= 40, `${checked} readings checked`);
  assert.ok(unheldDiffered > 0, 'and without the hold a live frame this far off does print another digit (the test can fail)');
});
