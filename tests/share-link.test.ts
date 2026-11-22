// The share link carries the whole scenario, as the 2D app's does (src/ui/share-flow.js): the patient, every setting, the view, the selection, and the 3D camera; a link opens
// back to the same values; an edited link is cleaned; a load that was replaced applies nothing. And every command the search lists has work behind it (2D palette.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { sharePayload, shareUrl, readShare, loadShared, hasShare, SHARE_WORDS, type ShareDeps, type ShareNow, type Shared } from '../src/ui/shell/share.ts';
import { encodeShare } from '../src/ui/deck/from2d/share-link.js';
import { defaultParams } from '../src/engine/hales/portal/scenario.js';
import { UI } from '../src/ui/strings.generated.ts';
import { isWiredCommand, goToSel } from '../src/ui/search/wired.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';

const BASE = 'https://example.org/app/';
const IDS = UI.presets.map((p) => p.id);
const params = () => { const p = defaultParams(); p.cirrhosis = 0.6; p.tips = { ...p.tips, on: true, d: 8 }; p.drugs = { ...p.drugs, [Object.keys(p.drugs)[0]!]: true }; return p; };
const now = (over: Partial<ShareNow> = {}): ShareNow => ({ preset: 'csph', params: params(), view: 'circuit', sel: { type: 'edge', id: 'PV_TRUNK' }, cam: { orbit: -12.5, k: 2.25, x: -140, y: 60 }, deck: null, ...over });

function fake(over: Partial<ShareDeps> = {}) {
  const log: string[] = [], said: [string, string?][] = [];
  const st = { params: defaultParams() as unknown, view: 'anatomic' as string, sel: null as unknown, cam: null as unknown, preset: '' };
  const d: ShareDeps = {
    loadPatient: async (id) => { st.preset = id; st.params = defaultParams(); log.push(`load ${id}`); return true; },
    currentParams: () => st.params, setParams: (p) => { st.params = p; log.push('params'); },
    view: () => st.view as never, goToView: (v) => { st.view = v; log.push(`view ${v}`); }, select: (s) => { st.sel = s; }, setCamera: (c) => { st.cam = c; },
    say: (t, tone) => { said.push([t, tone]); }, ...over,
  };
  return { d, st, log, said };
}

test('the link carries the patient, every setting, the view, the selection and the camera, and reads back whole', () => {
  const url = shareUrl(now(), BASE);
  assert.ok(url.startsWith(`${BASE}#s=`) && hasShare(new URL(url).hash));
  const s = readShare(new URL(url).hash, IDS)!;
  assert.equal(s.preset, 'csph');
  assert.deepEqual(s.params, JSON.parse(JSON.stringify(params())));
  assert.equal(s.view, 'circuit');
  assert.deepEqual(s.sel, { type: 'edge', id: 'PV_TRUNK' });
  assert.deepEqual(s.cam, { orbit: -12.5, k: 2.25, x: -140, y: 60 });
});

test('the payload is the 2D app\'s (v, preset, params, view), so either app opens the other\'s link; the lobule and the camera ride in x', () => {
  const p = sharePayload(now({ view: 'lobule', sel: null, cam: null }));
  assert.deepEqual(Object.keys(p), ['v', 'preset', 'params', 'view', 'x']);
  assert.equal(p.view, 'anatomic'); assert.deepEqual(p.x, { view: 'lobule' });
  assert.equal(readShare(`#s=${encodeShare(p)}`, IDS)!.view, 'lobule');
  assert.deepEqual(Object.keys(sharePayload(now({ view: 'anatomic', sel: null, cam: null }))), ['v', 'preset', 'params', 'view']);
  // a link the 2D app wrote: its camera is in the 2D drawing's units and is left out; the rest applies
  const from2d = readShare(`#s=${encodeShare({ v: 1, preset: 'healthy', params: { cirrhosis: 0.4 }, view: 'anatomic', cam: { k: 2, x: 10, y: 10 } })}`, IDS)!;
  assert.deepEqual(from2d, { preset: 'healthy', params: { cirrhosis: 0.4 }, view: 'anatomic' });
});

test('in a talk the link is the talk at its slide', () => {
  assert.equal(shareUrl(now({ deck: { id: 'hvpg', slide: 4 } }), BASE), `${BASE}?script=hvpg&slide=4`);
});

test('opening a link loads the patient, then puts its settings, view, selection and camera on', async () => {
  const f = fake();
  const s = readShare(new URL(shareUrl(now(), BASE)).hash, IDS)!;
  assert.equal(await loadShared(s, f.d), true);
  assert.deepEqual(f.log, ['load csph', 'params', 'view circuit']);
  const got = f.st.params as ReturnType<typeof params>;
  assert.equal(got.cirrhosis, 0.6); assert.equal(got.tips.on, true); assert.equal(got.tips.d, 8);
  assert.equal((got.drugs as Record<string, boolean>)[Object.keys(got.drugs)[0]!], true);
  assert.deepEqual(f.st.sel, { type: 'edge', id: 'PV_TRUNK' }); assert.deepEqual(f.st.cam, { orbit: -12.5, k: 2.25, x: -140, y: 60 });
  assert.deepEqual(f.said, []);
});

test('a load that failed or was replaced by another patient applies nothing of the link', async () => {
  const f = fake({ loadPatient: async () => false });
  assert.equal(await loadShared({ preset: 'csph', params: { cirrhosis: 0.9 }, view: 'circuit', sel: { type: 'edge', id: 'PV_TRUNK' }, cam: { orbit: 1, k: 2, x: 0, y: 0 } }, f.d), false);
  assert.deepEqual(f.log, []); assert.equal(f.st.sel, null); assert.equal(f.st.cam, null); assert.deepEqual(f.said, []);
});

test('an edited link is cleaned: unknown patient named, bad values repaired and said, hostile keys and unknown vessels dropped', async () => {
  const code = encodeShare({ v: 1, preset: 'no-such', params: { cirrhosis: 'lots' }, view: 'sideways', sel: { type: 'edge', id: 'NOT_A_VESSEL' }, x: { cam: { orbit: 900, k: 2, x: 0, y: 0 }, view: 'moon' } });
  const s = readShare(`#s=${code}`, IDS)!;
  assert.deepEqual(s, { preset: 'healthy', missing: 'no-such', params: { cirrhosis: 'lots' } });
  const f = fake();
  await loadShared(s, f.d);
  assert.equal(typeof (f.st.params as { cirrhosis: unknown }).cirrhosis, 'number');
  assert.deepEqual(f.said, [[SHARE_WORDS.missing('no-such'), undefined]]);   // (the app opened fine on the healthy patient: not a failure, no red dot)
  assert.equal(readShare('#s=%%%', IDS), null); assert.equal(readShare('#s=bm90IGpzb24', IDS), null); assert.equal(readShare('', IDS), null);
  const proto = readShare(`#s=${Buffer.from('{"v":1,"preset":"csph","params":{"__proto__":{"polluted":1},"cirrhosis":0.5}}').toString('base64url')}`, IDS)!;
  assert.deepEqual(Object.keys(proto.params!), ['cirrhosis']); assert.equal(({} as Record<string, unknown>).polluted, undefined);
  const yours: Shared = readShare(`#s=${encodeShare({ v: 1, preset: 'yours-abc123' })}`, IDS)!;
  assert.equal(yours.fromYours, true); assert.equal(yours.preset, 'healthy');
});

test('Go to: every structure the 2D palette lists names a vessel of the model or an organ', () => {
  const rows = UI.search.commands.filter((c) => c.group === 'Go to');
  assert.ok(rows.length >= 40);
  const ids = new Set((EDGES as { id: string }[]).map((e) => e.id));
  for (const c of rows) { const sel = goToSel(c.title); assert.ok(sel, `Go to/${c.title}`); if (sel!.type === 'edge') assert.ok(ids.has(sel!.id), c.title); }
  assert.deepEqual(goToSel('Portal vein'), { type: 'edge', id: 'PV_TRUNK' });
  assert.deepEqual(goToSel('Spleen'), { type: 'organ', id: 'spleen' });
  assert.deepEqual(goToSel('Ascites'), { type: 'organ', id: 'abdomen' });
  assert.equal(goToSel('Nowhere'), null);
});

test('every command the search registers has its work behind it and is counted as wired (none says "not in the 3D app yet")', async () => {
  const { work, buildCommands } = await import('../src/ui/search/commands.ts');
  const { useShell } = await import('../src/ui/shell/store.ts');
  const { useSelection } = await import('../src/ui/action/selection.ts');
  const { useTests } = await import('../src/ui/tests/store.ts');
  const { registerFeature } = await import('../src/ui/shell/features.ts');
  const FEATURES = new Set(['Undo (back one change)', 'Compare from here']);   // (run through the feature table: History and Compare register theirs when they mount)
  const dead: string[] = [];
  for (const c of UI.search.commands) {
    if (!isWiredCommand(c.group, c.title)) dead.push(`not wired: ${c.group}/${c.title}`);
    if (!work(c.group, c.title) && !FEATURES.has(c.title)) dead.push(`no work: ${c.group}/${c.title}`);
  }
  assert.deepEqual(dead, []);
  (await import('../src/engine/store.ts')).setParams(defaultParams());   // (a patient is loaded before the search can open)
  const cmds = buildCommands(() => undefined);
  for (const g of ['Go to', 'View', 'Tests', 'Patient', 'Present', 'App', 'Time']) assert.ok(cmds.some((c) => c.group === g), g);
  assert.deepEqual(cmds.filter((c) => !c.wired).map((c) => `${c.group}/${c.title}`), []);
  const run = (g: string, t: string) => cmds.find((c) => c.group === g && c.title === t)!.run(null);
  // Go to dispatches: the selection is the structure; Ascites opens its pane; from the lobule the figure goes back to the body
  run('Go to', 'Portal vein'); assert.deepEqual(useSelection.getState().sel, (await import('../src/ui/search/goto.ts')).GO_TO.get('Portal vein'));
  run('Go to', 'Spleen'); assert.deepEqual(useSelection.getState().sel, { type: 'organ', id: 'spleen' });
  useTests.getState().close(); run('Go to', 'Ascites');
  assert.equal(useSelection.getState().sel, null); assert.equal(useTests.getState().open, true); assert.equal(useTests.getState().pane, 'abdomen');
  run('View', 'Lobule view'); assert.equal(useShell.getState().view, 'lobule');
  run('Go to', 'Liver'); assert.equal(useShell.getState().view, 'anatomic'); assert.deepEqual(useSelection.getState().sel, { type: 'organ', id: 'liver' });
  run('View', 'Circuit view'); assert.equal(useShell.getState().view, 'circuit');
  run('View', 'Anatomy view'); assert.equal(useShell.getState().view, 'anatomic');
  // View/Tests and the Tests commands reach the Tests card
  let toggled = 0; const off = registerFeature('tests', () => { toggled++; });
  run('View', 'Tests'); off(); assert.equal(toggled, 1);
  useTests.getState().close(); run('Tests', 'Endoscopy'); assert.equal(useTests.getState().pane, 'endoscopy'); assert.equal(useTests.getState().open, true);
  run('Tests', 'Doppler of the portal vein'); assert.equal(useTests.getState().pane, 'doppler');
  assert.equal(useShell.getState().toast, null, 'no command said "not in the 3D app yet"');
});

// ---- N4: a link restores the figure's own choices too (the lens, the label level, the figure's switches) ----------------------------------------------------------
test('N4: the lens, label level and figure switches ride in the link, read back cleaned, and are put back before the view opens', async () => {
  const fig = { lens: 'delta', labels: 'all', figure: { chevrons: false, lymph: true, zones: true, bile: false } };
  const url = shareUrl(now({ fig, view: 'lobule', cam: null, sel: null }), BASE);
  const s = readShare(url.slice(url.indexOf('#')), IDS)!;
  assert.deepEqual(s.fig, fig);
  const { d, log } = fake(); let put: unknown = null;
  assert.equal(await loadShared(s, { ...d, setFigure: (f) => { put = f; log.push('figure'); } }), true);
  assert.deepEqual(put, fig);
  assert.ok(log.indexOf('figure') >= 0 && log.indexOf('figure') < log.indexOf('view lobule'), `figure before the view: ${log}`);
  // an app with no figure setter, and a link with none, are unchanged
  assert.equal(await loadShared(s, d), true);
  assert.equal(readShare(shareUrl(now(), BASE).replace(/^[^#]*/, ''), IDS)!.fig, undefined);
});

test('N4: an edited link keeps only what the app can apply of the figure part', () => {
  const payload = { v: 1, preset: 'csph', params: params(), view: 'anatomic', x: { lens: 'not a lens!', labels: 'everything', figure: { chevrons: 'yes', lymph: true, __proto__: { bad: 1 }, evil: true } } };
  const s = readShare(`#s=${encodeShare(payload)}`, IDS)!;
  assert.deepEqual(s.fig, { figure: { lymph: true } });
});

test('N4: the tool that is open (compare, layers, blood, lens) rides in the link and opens last, after the view, the selection and the camera; any other sheet is dropped', async () => {
  const fig = { sheet: 'layers' };
  const url = shareUrl(now({ fig, view: 'lobule', cam: { orbit: 1, k: 2, x: 3, y: 4 }, sel: { type: 'edge', id: 'SV' } }), BASE);
  const s = readShare(url.slice(url.indexOf('#')), IDS)!;
  assert.deepEqual(s.fig, fig);
  const { d, log } = fake();
  assert.equal(await loadShared(s, { ...d, openSheet: (n) => { log.push(`sheet ${n}`); } }), true);
  assert.equal(log.at(-1) === 'sheet layers' || log.indexOf('sheet layers') > log.findIndex((l) => l.startsWith('view')), true, `sheet after the view: ${log}`);
  const bad = readShare(`#s=${encodeShare({ v: 1, preset: 'csph', params: params(), view: 'anatomic', x: { sheet: 'readings' } })}`, IDS)!;
  assert.equal(bad.fig, undefined, 'a sheet that takes typing is not opened by a link');
});
