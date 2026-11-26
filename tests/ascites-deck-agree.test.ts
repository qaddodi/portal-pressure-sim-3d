// The ascites deck agrees with itself (3D amendments to the copied 2D deck, src/decks/ag/ascites-amend.ts): a colour means what it says, a card and its chart measure the same thing, and the
// words say what the model's numbers say. The numbers are the engine's own (a slide's state, run in node: no browser, no picture).
import { merged2d } from './merged-2d.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ASCITES } from '../src/decks/ag/ascites.copied.ts';
import { AMEND, amendAscites } from '../src/decks/ag/ascites-amend.ts';
import { chainOf } from '../src/decks/hp/numbers.ts';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { tableModel, type ResolvedRow } from '../src/ui/talk/table-model.ts';
import { pointsOf, saagLayout } from '../src/ui/charts/saag/model.ts';
import { measure } from '../src/ui/charts/measure.ts';
import { modelLines, LINE } from '../src/ui/charts/flowtime/model.ts';
import type { TableSpec } from '../src/decks/schema.ts';

type S = Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
const raw = ASCITES as unknown as { slides: S[] };
const deck = amendAscites(ASCITES) as unknown as { slides: S[] };
const slide = (d: { slides: S[] }, id: string) => d.slides.find((s) => s.id === id)!;

let fps: Promise<Record<string, any>[]> | null = null;   // eslint-disable-line @typescript-eslint/no-explicit-any
/** [outline, ...slides] fingerprints of the amended deck, as the page's worker computes them. */
const fpsOf = () => (fps ??= (async () => {
  const out: Record<string, any>[] = [];   // eslint-disable-line @typescript-eslint/no-explicit-any
  const core = createCore((m: { type: string; i?: number; fp?: Record<string, unknown> }) => { if (m.type === 'seqStep') out[m.i!] = m.fp!; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps: chainOf(deck.slides as never), reqId: 1 });
  core.dispose();
  return out;
})());
const fpOfId = async (id: string) => (await fpsOf())[deck.slides.findIndex((s) => s.id === id) + 1]!;

test('every amendment anchors on the copied deck (a re-copy that moves its words fails here, not silently)', () => {
  assert.ok(slide(raw, AMEND.tableVs.slide).of.some((r: S) => r.id === AMEND.tableVs.row));
  assert.ok(slide(raw, AMEND.tipsReads.slide).tool.lines.includes(AMEND.tipsReads.from));
  assert.ok(slide(raw, AMEND.tipsReads.slide).tiles.includes(AMEND.tipsReads.from));
  for (const w of [AMEND.diureticsLine, AMEND.refractoryLine, AMEND.lvpLine]) assert.ok(slide(raw, w.slide).line.includes(w.from), w.slide);
  assert.ok(slide(raw, AMEND.lvpNotes.slide).notes.includes(AMEND.lvpNotes.from), 'lvp notes');
  assert.ok(slide(deck, AMEND.lvpNotes.slide).notes.includes('give about 35 to 47 g of 20% albumin'), 'lvp notes amended');
  assert.notDeepEqual(deck, raw, 'the amended deck differs from the copy');
  assert.ok(!JSON.stringify(slide(raw, 'tips')).includes('"ppg"'), 'the copy itself is untouched (amend works on a clone)');
});

test('the summary table: the untreated row is compared with the paracentesis it follows, so the refilled belly and the rising PPG are red, not green', async () => {
  const s = slide(deck, 'summary');
  const spec = Object.fromEntries(['cols', 'of', 'vs', 'asc', 'rowHead'].filter((k) => s[k] != null).map((k) => [k, s[k]])) as unknown as TableSpec;
  const rows: ResolvedRow[] = [];
  for (const r of s.of) { const sl = slide(deck, r.id); rows.push({ spec: r, i: deck.slides.indexOf(sl), f: await fpOfId(r.id), title: r.title, kicker: r.kicker }); }
  const m = tableModel(spec, rows);
  const at = (id: string, k: string) => m.rows.find((r) => r.key === id)!.cells.find((c) => c.k === k)!;
  assert.equal(m.rows.find((r) => r.key === 'back')!.vs, 'vs paracentesis with albumin');
  assert.ok(at('back', 'asc').arrow > 0 && at('back', 'asc').eff === 'bad', 'ascites came back: up and red');
  assert.ok(at('back', 'ppg').arrow >= 0 && at('back', 'ppg').eff !== 'good', 'the PPG did not improve');
  for (const k of ['asc', 'ppg']) assert.equal(at('tips', k).eff, 'good', `the TIPS row's ${k} is a real improvement over the baseline`);
  assert.equal(at('diuretics', 'asc').eff, 'good');
});

test('a slide whose words give a pressure plots that pressure: the TIPS slide says PPG, so its chart and tile read the PPG (8.8), not the portal vein pressure', () => {
  const t = slide(deck, 'tips');
  assert.deepEqual(t.tool.lines, ['ppg', 'asc']);
  assert.ok(t.tiles.includes('ppg') && !t.tiles.includes('pv'));
  assert.match(t.line, /\{ppg\}/);
  // the same rule over every ascites-family slide with a flow-time chart: a pressure its line names is a line of its chart
  const dir = new URL('../src/decks/ag/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.copied.ts'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    const body = JSON.parse(src.slice(src.indexOf('{', src.indexOf('= {')), src.lastIndexOf('};') + 1)) as { id: string; slides: S[] };
    for (const sl of body.slides) {
      const tool = f === 'ascites.copied.ts' ? slide(deck, sl.id).tool : sl.tool;
      if (tool?.kind !== 'flowtime') continue;
      const line = f === 'ascites.copied.ts' ? slide(deck, sl.id).line : sl.line;
      for (const k of ['pv', 'ppg', 'hvpg', 'sin']) if (new RegExp(`\\{${k}[}:@ ]`).test(line)) assert.ok(modelLines(tool.lines).includes(k) && LINE[k], `${body.id}/${sl.id}: the line says {${k}} but the chart plots ${tool.lines}`);
    }
  }
});

test('words that say "stabilizes" or "stable" agree with the day card: no slide says so while the model still adds ascites', async () => {
  const all = await fpsOf();
  deck.slides.forEach((s, i) => {
    if (!/stabili[sz]|stable/i.test(String(s.line))) return;
    const net = (all[i + 1]!.lymphNet ?? 0) * 1440;
    assert.ok(Math.abs(net) < 10, `${s.id} says it is stable at ${net.toFixed(0)} mL/day`);
  });
});

test('ROOT CAUSE of the missing dot: the SAAG plane takes its patients from the slide\'s own `of` list (beside its tool), not only from tool.of, which the 2D deck never sets', () => {
  const body = readFileSync(new URL('../src/ui/talk/ToolCardBody.tsx', import.meta.url), 'utf8');
  assert.match(body, /case 'saag': return <SaagCard rows=\{\(\(\(tool\.of \?\? cs\.of\)/);
  for (const id of ['hf', 'map']) { const sl = slide(deck, id); assert.equal(sl.tool.kind, 'saag'); assert.equal(sl.tool.of, undefined); assert.ok(sl.of.length >= 3, id); }
});

test('the heart-failure slide draws its own dot at SAAG 1.3 and protein 4.5 (the one the slide is about, in full ink), beside the other two', async () => {
  const s = slide(deck, 'hf');
  const rows = await Promise.all((s.tool.of ?? s.of).map(async (o: S) => ({ id: o.id, name: o.name, f: await fpOfId(o.id) })));
  const pts = pointsOf(rows as never, s.tool.extra, s.tool.own);
  const own = pts.find((p) => p.own)!;
  assert.deepEqual([own.name, +own.saag.toFixed(1), +own.tp.toFixed(1)], ['Right heart failure', 1.3, 4.5]);
  for (const W of [220, 300, 420]) {
    const L = saagLayout(W, 12, measure as never, pts);
    const dot = L.dots.find((d) => d.look === 'saag.pt.cur')!;
    assert.ok(dot && dot.cx > L.plot.L && dot.cx < L.plot.L + L.plot.pw && dot.cy > L.plot.T && dot.cy < L.plot.T + L.plot.ph, `W ${W}`);
    assert.equal(L.dots.length, 4, 'cirrhosis, heart failure, Budd–Chiari and the one not modeled');
  }
});

test('a pill that is followed by a stop (2.2 g/dL.) keeps only the hair of room: the rule reaches a pill inside its no-break span, as Line sets it', () => {
  const css = merged2d('app-04-presenter.css');
  assert.match(css, /\.pz-stop :is\(\.pz-val, \.pz-term\) \{ margin-inline-end: \.08em; \}/);
  // (2D's own rule is the child combinator, which a pill inside its no-break span escapes; the descendant rule above is in css3d-over-2d.css and out-ranks it by order)
  const line = readFileSync(new URL('../src/ui/cards/Line.tsx', import.meta.url), 'utf8');
  assert.match(line, /<span className="pz-nw"><span className=\{`pz-val/, 'the value pill sits inside .pz-nw, so it is never a direct child of .pz-stop');
});
