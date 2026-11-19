import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csphFingerprint as fp0 } from '../scripts/gen-engine-fixture.mjs';
import { csphVerdict, lsmContext } from '../src/engine/hales/portal/lsm-cuts.js';
import { stiffLayout, stiffWords, verdictOf, spleenVerdictOf, ZONES, SPLEEN_ZONES, VERDICT, plateletWords } from '../src/ui/charts/stiff/model.ts';
import { stiffFrame } from '../src/ui/charts/stiff/frame.ts';
import { saagLayout, pointsOf, readingOf, saagWords, type Row } from '../src/ui/charts/saag/model.ts';
import { saagFrame } from '../src/ui/charts/saag/frame.ts';
import { measure } from '../src/ui/charts/measure.ts';
import { ctxOf, eachLook, judge } from './charts-helpers.ts';

// one engine run per preset in this file (a run is about 0.7 s)
const memo = new Map<string, Promise<unknown>>();
const csphFingerprint = (id: string) => { if (!memo.has(id)) memo.set(id, fp0(id)); return memo.get(id)!; };
const PRESETS = ['healthy', 'csph', 'cirr-decomp', 'budd-chiari', 'psvd', 'rhf'];

test('the verdict is the guideline function as the bar prints it, for every preset the engine has', async () => {
  for (const id of PRESETS) {
    const fp: any = await csphFingerprint(id);
    const lsm = Math.round(fp.lsm * 10) / 10, plt = Math.round(fp.plt);
    const ctx = lsmContext({ fhvp: fp.fhvp, scar: fp.scar, ppg: fp.ppg, lsm: fp.lsm }) as 'congested' | 'vascular' | null;
    const v = verdictOf(lsm, plt, ctx);
    const g = (csphVerdict as (a: number, b: number, c: unknown) => string | null)(lsm, plt, ctx);
    assert.equal(v?.[0], g == null ? undefined : g === 'open' && lsm > 15 ? VERDICT.between![0] : VERDICT[g]![0], id);
    const words = stiffWords(lsm, plt, 'liver', ctx);
    assert.ok(words.includes(`${lsm.toFixed(1)} kPa`), `${id}: ${words}`);
  }
});

test('the spleen rules CSPH in above 55 kPa and never rules it out; a congested organ takes the rules off', () => {
  assert.equal(spleenVerdictOf(56)![0], 'CSPH ruled in');
  assert.equal(spleenVerdictOf(20)![0], 'CSPH not ruled in');
  assert.equal(spleenVerdictOf(null), null);
  assert.equal(spleenVerdictOf(80, 'congested')![0], VERDICT.congested![0]);
  assert.match(plateletWords(128), /^Platelets 128 .+, under 150$/);
});

test('the mark stands where the reading is on the axis, the zones tile the bar, and every word is at least 12 px in every look at every width', () => {
  eachLook((look) => {
    for (const [w, d] of [[300, 'phone-portrait'], [330, 'desktop'], [430, 'tablet-portrait'], [330, 'phone-landscape']] as const) {
      for (const [organ, lsm, plt] of [['liver', 8, 220], ['liver', 12.4, 128], ['liver', 20, 90], ['liver', 39, 59], ['liver', null, null], ['spleen', 30, null], ['spleen', 64.5, null]] as const) {
        for (const note of [false, true]) {
          const c = ctxOf(look, w, d);
          const f = stiffFrame({ lsm, plt, organ, note }, c);
          judge(f, look);
          judge(stiffFrame({ lsm, plt, organ, ctx: 'congested', note }, c), look);
          assert.ok(f.h > 0);
        }
      }
    }
  });
  const L = stiffLayout(330, 13, measure, { lsm: 20, plt: 90 });
  const zs = L.rects.filter((r) => r.look.startsWith('stiff.z'));
  assert.equal(zs.length, ZONES.length);
  for (let i = 1; i < zs.length; i++) assert.ok(zs[i]!.x >= zs[i - 1]!.x + zs[i - 1]!.w, 'zones do not overlap');
  const stem = L.rects.find((r) => r.look === 'stiff.mk')!;
  const pad = Math.ceil(13 * 0.3), ew = 330 - 2 * pad;
  assert.ok(Math.abs(stem.x + 1 - (pad + (20 / 30) * ew)) < 1e-6);
  assert.equal(stiffLayout(330, 13, measure, { organ: 'spleen', lsm: 30 }).rects.filter((r) => r.look.startsWith('stiff.z')).length, SPLEEN_ZONES.length);
});

test('the same reading gives the same pair of mark shapes in a frame with and without a reading, so a new reading glides', async () => {
  const c = ctxOf('light');
  const a = stiffFrame({ lsm: 12, plt: 150 }, c), b = stiffFrame({ lsm: 28, plt: 150 }, c), none = stiffFrame({ lsm: null, plt: null }, c);
  const kinds = (f: typeof a) => f.shapes.filter((s) => s.k !== 'text').map((s) => s.k).join();
  assert.equal(kinds(a), kinds(b));
  assert.equal(kinds(a), kinds(none));
});

const rowsOf = async (ids: string[]): Promise<Row[]> => Promise.all(ids.map(async (id) => ({ id, name: id, f: (await csphFingerprint(id)) as any })));

test('SAAG: a patient with no fluid to tap has no point; the points are the engine numbers; the reading says what the guideline says', async () => {
  const pts = pointsOf(await rowsOf(['healthy', 'cirr-decomp', 'budd-chiari', 'csph']), [{ name: 'Peritoneal carcinomatosis', saag: 0.6, tp: 3.8 }], 'cirr-decomp');
  assert.ok(!pts.some((p) => p.id === 'healthy'), 'no fluid, no point');
  const cirr = pts.find((p) => p.id === 'cirr-decomp')!;
  assert.ok(cirr.own && cirr.modeled);
  assert.match(readingOf(cirr.saag, cirr.tp), /low-protein fluid, the pattern of cirrhosis/);
  assert.match(readingOf(0.6, 3.8), /is under 1.1: portal hypertension is not the cause/);
  assert.match(readingOf(2, 4), /over 2.5/);
  assert.ok(pts.find((p) => !p.modeled && p.name === 'Peritoneal carcinomatosis'));
  assert.ok(saagWords(pts).includes('(not modeled)'));
});

test('SAAG: every look and width is sound, the names of points never touch, and a small room takes height from the plot, not the words', async () => {
  const pts = pointsOf(await rowsOf(['cirr-decomp', 'budd-chiari', 'rhf', 'csph', 'psvd']), [{ name: 'Peritoneal carcinomatosis', saag: 0.6, tp: 3.8 }, { name: 'Nephrotic syndrome', saag: 0.4, tp: 0.9 }], 'rhf');
  const read = readingOf(pts[0]!.saag, pts[0]!.tp);
  eachLook((look) => {
    for (const [w, d] of [[300, 'phone-portrait'], [330, 'desktop'], [430, 'tablet-portrait']] as const) {
      const c = ctxOf(look, w, d);
      judge(saagFrame(pts, c, { read }), look);
      judge(saagFrame([], c), look);
    }
  });
  const f = 13;
  const free = saagLayout(330, f, measure, pts, { read });
  const tight = saagFrame(pts, ctxOf('light', 330), { read, room: free.H - 60 });
  assert.ok(tight.h <= free.H - 60 + 1 || free.plot.ph - 60 < 100, `${tight.h} vs ${free.H}`);
  const sz = (l: ReturnType<typeof saagLayout>) => l.texts.filter((t) => t.look === 'saag.read').length;
  assert.equal(sz(free), sz(saagLayout(330, f, measure, pts, { read, plotH: 100 })), 'the words keep their lines');
});
