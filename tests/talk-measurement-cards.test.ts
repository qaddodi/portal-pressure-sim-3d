// Mohammad 23 Nov: "EUS PPG slides do not display the PV and HV pressure as callouts". Root cause: a measurement's reading tags (scene/labels/proc-cards.ts `runCards`, drawn as label tags by the layer) were
// started only by the Tests cards (ui/tests/endo/eus-run.ts, ir/run.ts). The talk's own run (ui/deck/procs-link.ts `begin`, `procedure.drive`) never started them, so on every slide that plays the EUS-PPG,
// the HVPG catheter, the IR pressures or the TIPS gradient the figure showed no reading at all. Here: the talk's run starts, feeds and ends them for every kind that has readings, and the readings the
// cards print come in the order the 2D spec says (PV, then HV, then their gradient) from the one place the Tests cards use.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { READS, markAt, specOf } from '../src/scene/procedures/copied/proc-anim.js';
import { cardsOf } from '../src/scene/labels/proc-cards.ts';
import type { ProcCards } from '../src/scene/labels/store.ts';

type Spec = { T: { end: number }; labels?(t: number, rd: unknown, f: unknown, out: unknown[]): unknown[]; capture?(i: number, rd: unknown, f: unknown): void; steps: unknown[] };
const frame = { P: new Float64Array(64).map((_, i) => 4 + i * 0.37), metrics: { fhvp: 6, whvp: 17, hvpg: 11, pv: 21.4, ivc: 5.2, ppg: 16.2 } };
const fresh = (): ProcCards => ({ kinds: [], sig: '', kickers: { f: '', w: '', h: '' }, tones: { f: 'free', w: 'wedge' }, text: { f: '', w: '', h: '', hv: null }, points: () => true });

/** The kinds standing at each moment of a whole run, readings taken at their marks as the talk's run takes them. */
function run(kind: string): { kinds: string; text: ProcCards['text'] }[] {
  const spec = specOf(kind) as Spec, rd = (READS as Record<string, Record<string, number>>)[kind]!;
  for (const k in rd) rd[k] = NaN;
  const into = fresh(), out: unknown[] = [], seen: { kinds: string; text: ProcCards['text'] }[] = [];
  let got = -1;
  for (let t = 0; t <= spec.T.end; t += 100) {
    for (let i = got + 1; i < spec.steps.length; i++) { if (t >= markAt(kind, i)) { spec.capture!(i, rd, frame); got = i; } else break; }
    spec.labels!(t, rd, frame, out);
    const r = cardsOf(out as never, into);
    if (!seen.length || seen[seen.length - 1]!.kinds !== r.kinds.join('')) seen.push({ kinds: r.kinds.join(''), text: { ...into.text } });
  }
  return seen;
}

test('the EUS-PPG shows the PV reading, then the HV reading with it, then the gradient they make, then none', () => {
  const seen = run('eus'), s = seen.map((x) => x.kinds);
  // the 2D spec: nothing, the PV (the portal target's card, key 'w' here), the HV beside it ('f'), the stack of the two with their gradient ('s'), then it goes as the scope does
  assert.deepEqual(s, ['', 'w', 'wf', 's', ''], 'the cards come in this order');
  const res = seen[3]!.text;
  assert.match(res.w, /\d/, 'the PV reads a number');
  assert.match(res.f, /\d/, 'the HV reads a number');
  assert.match(res.h, /\d/, 'the gradient prints a number');
  assert.ok(res.hv != null && Number.isFinite(res.hv), 'and its band has a value');
});

test('every procedure kind that has readings in the 2D spec shows at least one reading on the figure', () => {
  const kinds = Object.keys(READS).filter((k) => (specOf(k) as Spec | null)?.labels);
  for (const k of ['eus', 'hvpgcath', 'irivc', 'irpv', 'tipsgrad']) assert.ok(kinds.includes(k), `${k} has readings`);
  for (const k of kinds) assert.ok(run(k).some((x) => x.kinds.length > 0), `${k}: no reading ever stands`);
});

test('the talk\'s run starts, feeds and ends the reading cards for every kind that has them (the Tests cards were the only ones that did)', () => {
  const src = readFileSync(new URL('../src/ui/deck/procs-link.ts', import.meta.url), 'utf8');
  assert.match(src, /runCards\(kind, \{ capture: true/, 'a run takes its own readings at the marks');
  assert.match(src, /cards\?\.frame\(sceneApi\.procedure\.driven\?\.t \?\? 0, engineFrames\.now\(\)\)/, 'fed every frame from the run\'s time and the model\'s frame');
  const ends = src.match(/endCards\(\)/g) ?? [];
  assert.ok(ends.length >= 4, 'ended on the next run, on the way out, on the run\'s end and when something else takes the figure');
  assert.match(src, /gen\+\+;\s*endCards\(\);/, 'and the first thing leaving a slide does');
});

test('the talk\'s run pins the slide\'s own state for its readings, so the readouts and the card text print one number (24 Nov: 14.8 against 14.9)', () => {
  const src = readFileSync(new URL('../src/ui/deck/procs-link.ts', import.meta.url), 'utf8');
  assert.match(src, /setSlidePin\(fp\)/, 'a run pins the slide\'s fingerprint');
  assert.match(src, /endCards\(\); pinSlide\(\);/, 'before the readings start');
  assert.match(src, /endCards\(\); unpinSlide\(\);/, 'and lets go when the run is stopped');
});
