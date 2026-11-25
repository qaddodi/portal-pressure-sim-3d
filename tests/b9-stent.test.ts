// The stent editor (B9/B5: registerPanel('stent')): the controls and the tiles' words are the 2D app's, cut out by scripts/copy-b11-stent.mjs; the editor changes the params through updateParams,
// one History entry per gesture; the panel is registered for the TIPS, DIPS and custom shunt cards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { defaultParams } from '../src/engine/hales/portal/scenario.js';
import { setParams } from '../src/engine/store.ts';
import { stentControls } from '../src/ui/action/stent/stent-controls.copied.ts';
import { EDITOR_ROWS, rowValue, tileWords, splitValue, lumLo } from '../src/ui/action/stent/stent-rows.copied.ts';
import { VESSEL_KEYS } from '../src/ui/action/stent/vessel-keys.copied.ts';
import { canUndo, currentParams, historyNow, updateParams } from '../src/ui/action/params.ts';
import { cardFor } from '../src/ui/action/cards.ts';
import { lumenShown, shareFor } from '../src/engine/hales/portal/stent-geom.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type P = any;
const fresh = (): P => { const p = defaultParams(); p.tips = { ...p.tips, on: true, d: 8 }; setParams(p); return p; };
const ctl = (id: string, c: string) => stentControls(id).find((v: { id: string }) => v.id === c);

test('the controls are the 2D list: diameter, stenosis, its end, the waist, its length, its ends', () => {
  assert.deepEqual(stentControls('TIPS').map((v: { id: string }) => v.id), ['diameter', 'narrow', 'site', 'waistD', 'waist', 'ends']);
  assert.deepEqual(stentControls('DIPS').map((v: { id: string }) => v.id), ['diameter', 'narrow', 'site', 'waistD', 'waist', 'ends']);
  assert.deepEqual(stentControls('PV_TRUNK'), [], 'a vessel that is not a stent has none');
  assert.deepEqual(EDITOR_ROWS.map((r) => r.name), ['Diameter', 'Stenosis', 'Waist']);
  assert.deepEqual(EDITOR_ROWS.flatMap((r) => r.ids), ['diameter', 'site', 'narrow', 'waistD', 'waist', 'ends']);
});

test('the diameter runs 6 to 12 mm on a TIPS or DIPS and 4 to 16 on a custom shunt; every change is a params edit', () => {
  fresh();
  const d = ctl('TIPS', 'diameter');
  assert.equal(d.min, 6); assert.equal(d.max, 12); assert.equal(d.step, 0.5);
  assert.equal(ctl('X_SMV_RHV', 'diameter')?.min ?? ctl('X_PVH_RHV', 'diameter')?.min, 4);
  assert.equal(d.get(currentParams()), 8);
  d.set(currentParams(), 10);
});

test('the tiles read as 2D: 8.0 mm / Whole stent, None / Ends clear, None / Uniform; a narrowing prints its lumen on the 0.5 mm step', () => {
  const p = fresh();
  assert.deepEqual(tileWords('dia', 'TIPS', p), ['8.0', 'mm', 'Whole stent']);
  assert.deepEqual(tileWords('end', 'TIPS', p), ['None', '', 'Ends clear']);
  assert.deepEqual(tileWords('waist', 'TIPS', p), ['None', '', 'Uniform']);
  assert.equal(rowValue('dia', 'TIPS', p), '8.0 mm');
  assert.equal(rowValue('end', 'TIPS', p), 'None');
  const s = ctl('TIPS', 'narrow');
  const q = structuredClone(p); s.set(q, 0.5);
  const w = tileWords('end', 'TIPS', q);
  assert.equal(w[1], 'mm'); assert.equal(w[2], 'Distal');
  assert.equal(Number(w[0]) % 0.5, 0, 'the lumen is on the 0.5 mm step');
  assert.equal(rowValue('end', 'TIPS', q), `${w[0]} mm`.replace(/^/, 'Distal '));
  assert.deepEqual(splitValue('40% · 6.0 mm'), ['6.0 mm', '40%']);
  assert.deepEqual(splitValue('None'), ['None', '']);
});

test('the lumen sliders are in mm and write the share: the open stent is the right end, 0.5 mm steps', () => {
  assert.equal(lumLo(8, 0.95), 0.5 * Math.ceil(8 * 0.05 / 0.5 - 1e-9));
  assert.equal(shareFor(lumenShown(8), 8), 0);
  assert.equal(shareFor(4, 8), 0.5);
  const p = fresh(), q = structuredClone(p);
  ctl('TIPS', 'waistD').set(q, shareFor(5, 8));
  assert.equal(tileWords('waist', 'TIPS', q)[0], '5.0');
  assert.match(tileWords('waist', 'TIPS', q)[2], /^× \d\.\d cm$/);
});

test('a drag is one History entry: the first move makes it, the rest edit it', () => {
  fresh();
  const before = historyNow().length;
  const d = ctl('TIPS', 'diameter');
  updateParams((q: P) => { d.set(q, 9); return q; }, { history: true, label: d.hist });
  updateParams((q: P) => { d.set(q, 9.5); return q; }, { history: false, label: d.hist });
  updateParams((q: P) => { d.set(q, 10); return q; }, { history: false, label: d.hist });
  assert.equal(historyNow().length, before + 1);
  assert.equal(historyNow().at(-1)!.label, 'TIPS diameter');
  assert.equal(currentParams().tips.d, 10);
  assert.ok(canUndo());
});

test('the TIPS card lists the stent panel, and the editor is registered as the card\'s stent panel', () => {
  const card = cardFor({ type: 'edge', id: 'TIPS' });
  assert.ok(card?.verbs.some((v) => v.type === 'panel'), 'the TIPS card has a stent panel verb');
  const dips = cardFor({ type: 'edge', id: 'DIPS' });
  assert.ok(dips?.verbs.some((v) => v.type === 'panel'));
  const panel = readFileSync(new URL('../src/ui/action/stent/StentPanel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /registerPanel\('stent', StentPanel\)/);
  const boot = readFileSync(new URL('../src/ui/action/boot.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(boot, /^import[^\n]*StentPanel/m, 'the panel is a chunk of its own (stent-load.ts), read in when idle or when its card is selected');
  assert.match(readFileSync(new URL('../src/ui/action/stent/stent-load.ts', import.meta.url), 'utf8'), /import\('\.\/StentPanel\.tsx'\)/);
});

test('the vessel card\'s line of three numbers is the 2D list: PPG, flow, peak velocity', () => {
  assert.deepEqual(VESSEL_KEYS.map((k: { id: string }) => k.id), ['ppg', 'flow', 'peak']);
  assert.equal(VESSEL_KEYS[0].v({ ppg: 6.2 }, null), 6.2);
  assert.equal(VESSEL_KEYS[1].v({}, { flow: 0.9 }), 0.9);
});

test('the copied files are what the 2D app has (checked when PPS_2D_REPO names a 2D checkout)', { skip: !process.env.PPS_2D_REPO || !existsSync(`${process.env.PPS_2D_REPO}/src/ui/actions.js`) }, () => {
  execFileSync('node', ['scripts/copy-b11-stent.mjs', '--from', process.env.PPS_2D_REPO!, '--check'], { stdio: 'pipe' });
});
