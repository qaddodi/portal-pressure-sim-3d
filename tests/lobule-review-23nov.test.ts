// Lobule deck review, 23 Nov 2026 (iPhone capture 58722f12): the numbers a slide's figure names print must be the numbers its cards print; the summary table's legend names every mark a row can show;
// heart failure's ascitic protein is a high one; the schistosomiasis slide's title agrees with its gauge. (The chart's unit and halos: tests/charts-profile.test.ts. The names keeping off a callout: below.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { csphFingerprint } from '../scripts/gen-engine-fixture.mjs';
import { NODES } from '../src/engine/hales/portal/topology.js';
import { readModel, setSlidePressures } from '../src/scene/lobule/read-model.ts';
import { readingText } from '../src/scene/lobule/captions.ts';
import { tableModel, valueText } from '../src/ui/talk/table-model.ts';
import type { ResolvedRow, Fp } from '../src/ui/talk/table-model.ts';
import { DECK } from '../src/decks/hp/data/lobule.copied.ts';

const NI = Object.fromEntries((NODES as { id: string }[]).map((n, i) => [n.id, i])) as Record<string, number>;
const fp = async (preset: string) => (await csphFingerprint(preset)) as Fp & { at?: { P: ArrayLike<number> } };
const row = (id: string, f: Fp | null, o: object = {}): ResolvedRow => ({ spec: { id, ...o }, i: 1, f, title: id, kicker: 'Levels' });

test('on a slide the lobule and sinusoid names print the slide\'s own pressures: the sinusoid reads the number its tile prints (22.1 on the card, 22.6 on the figure, slide 5.2)', async () => {
  const P = Float32Array.from({ length: NODES.length }, () => 0);
  P[NI.RPV!] = 22.4; P[NI.SIN_R!] = 22.1; P[NI.CV_R!] = 6.3;
  const live = { P1: 22.9, P2: 22.6, P3: 6.9, lymph: 1 };   // (the live frame: it pulses with every beat)
  assert.equal(readModel(live), live, 'off a slide the live model stands');
  setSlidePressures(P);
  try {
    const m = readModel(live)!;
    assert.deepEqual([m.P1, m.P2, m.P3], [22.4, 22.1, 6.3].map((x) => Math.fround(x)));
    assert.equal(readingText('P2', m, false, true), '22.1 mmHg', 'the sinusoid\'s name says what the card says');
    assert.equal(m.lymph, 1, 'the rest of the model is the live one');
  } finally { setSlidePressures(null); }
  assert.equal(readModel(live), live);
  assert.equal(readModel(null), null);
});

test('the summary table\'s legend names the level dash a row can show; heart failure\'s ascitic protein is an arrow up, and no ascites reads "No ascites" across both columns', async () => {
  const [healthy, schisto, cong, cirr] = await Promise.all(['healthy', 'schisto', 'rhf', 'cirr-decomp'].map(fp));
  const m = tableModel({ of: ['a', 'b', 'c', 'd'], cols: ['pv', 'hvpg'], asc: true }, [row('a', healthy!, { ref: true }), row('b', schisto!), row('c', cirr!), row('d', cong!)]);
  assert.match(m.legend, /• within normal/, 'the dash is in the legend');
  assert.ok(m.rows[1]!.cells.some((c) => c.k === 'hvpg' && c.arrow === 0), 'schistosomiasis: a normal HVPG is the dash');
  assert.ok(m.rows[3]!.cells.some((c) => c.k === 'hvpg' && c.arrow === 0), 'heart failure: a normal HVPG is the dash');
  const tp = m.rows[3]!.cells.find((c) => c.k === 'tp')!;
  assert.equal(tp.arrow, 1, 'cardiac ascites is protein-rich: the arrow points up');
  assert.match(tp.sr, /2\.5 or more/);
  assert.equal(m.rows[2]!.cells.find((c) => c.k === 'tp')!.arrow, -1, 'cirrhotic ascites is protein-poor: down');
  const none = m.rows[1]!.cells.at(-1)!;
  assert.deepEqual([none.kind, none.text, none.sr], ['none', 'No ascites', 'no ascites']);
});

test('the schistosomiasis slide\'s title does not say "normal" over a gauge that rates the sinusoidal pressure High', async () => {
  const slide = DECK.slides.find((s) => s.id === 'wedge-sinusoid')!;
  const f = await fp('schisto');
  assert.ok((f.sin as number) >= 9, 'its sinusoidal pressure is past the gauge\'s amber (9 mmHg, table-marks RATE.sin)');
  assert.doesNotMatch((slide.title ?? ''), /normal/i);
  assert.match((slide.title ?? ''), /well below the portal pressure/);
  assert.ok((f.pv as number) > 2 * (f.sin as number), 'which is true: the portal pressure is more than twice it');
  assert.match((slide.line ?? ''), /\{sin\}/); assert.match((slide.line ?? ''), /\{pv\}/);
  const src = readFileSync(new URL('../scripts/source-edits.mjs', import.meta.url), 'utf8');
  assert.match(src, /wedge-sinusoid\.title/, 'the edit is a source patch, so a re-copy from 2D keeps it');
});

test('the lobule\'s names keep off the slide\'s callout (Resistance lay over Hepatic arteriole and its leader, slide 4.2)', () => {
  const src = readFileSync(new URL('../src/scene/lobule/LobuleCaptions.tsx', import.meta.url), 'utf8');
  assert.match(src, /calloutClaims\.boxes/, 'the callout\'s boxes are walls of the names');
  assert.match(src, /calloutClaims\.subscribe/, 'and a callout that comes or moves places the names again');
});
