// Plan 38 (audit 3, state wiring): the figure's second input, the patient's parameters, has one owner. Gates G2 (the React tick follows the copy), G3 (the copy is the sanitized
// copy) and G4 (no write-only figure switch, no twin store for a switch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { sendParams } from '../src/engine/params-send.ts';
import { adoptFrame, patient, setParams, useParamsTick } from '../src/engine/store.ts';
import { PRESETS, defaultParams, sanitizeParams } from '../src/engine/hales/portal/scenario.js';
import { copiedOf } from '../src/decks/hp/deck.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { presetStarted, presetBase, updateParams, rebase, canUndo, historyNow } from '../src/ui/action/params.ts';
import { slideParams } from '../src/ui/talk/deck-model.ts';
import { UI } from '../src/ui/strings.generated.ts';

type P = Record<string, unknown>;
const tick = () => useParamsTick.getState().tick;
const frame = (params?: unknown) => ({ P: new Float64Array(64), metrics: {}, ...(params !== undefined ? { params } : {}) }) as never;

test('G2: the params tick changes after sendParams, after a frame that carries params, and after a plain setParams (W3, W10)', () => {
  setParams(defaultParams());
  let t = tick();
  sendParams({ cirrhosis: 0.3 });
  assert.ok(tick() > t, 'sendParams');
  t = tick();
  adoptFrame(frame({ ...(defaultParams() as P), cirrhosis: 0.7 }));
  assert.ok(tick() > t, 'adoptFrame with params (a worker action, a morph landing, a lapse tick)');
  assert.equal((patient.params as P).cirrhosis, 0.7);
  t = tick();
  adoptFrame(frame());
  assert.equal(tick(), t, 'a frame without params leaves the tick alone');
  setParams(defaultParams());
  assert.ok(tick() > t, 'setParams (a slide, a restore, a loaded patient)');
});

test('G3: the page copy equals sanitize(page copy) after sendParams, for every preset, slide model, what-if end and a hand-made bad set (W4)', async () => {
  let modelSlides = 0, compareButtons = 0, whatIfEnds = 0;
  const same = (what: string) => assert.deepEqual(patient.params, sanitizeParams(patient.params), what);
  sendParams({ cirrhosis: 9, splenicRx: 7.4, stenosis: { PV: 3 }, stenosisSite: { PV: 'mid' }, nonsense: 1 });
  same('a value outside the clamp');
  const p = patient.params as P;
  assert.equal(p.cirrhosis, 1);
  assert.equal(p.splenicRx, 2);
  assert.equal((p.stenosis as P | undefined)?.PV ?? 0, 0, 'a stenosis under an old "mid" site is carried into a waist, not left raw');
  assert.ok(!('nonsense' in p), 'an unknown key is dropped');
  for (const pr of PRESETS as { id: string; apply(p: unknown): unknown }[]) { sendParams(pr.apply(defaultParams()), { replace: true }); same(`preset ${pr.id}`); }
  for (const d of UI.decks) {
    const deck = await loadBuiltin(d.id);
    if (!deck) continue;
    for (const c of copiedOf(d.id)?.slides ?? []) { const m = (c as { params?: unknown }).params; if (m && typeof m === 'object') { setParams(defaultParams()); sendParams(m); same(`${d.id} ${(c as { id?: string }).id} slide params`); modelSlides++; } }
    deck.slides.forEach((s, i) => {
      const sl = s as unknown as { model?: { preset?: string; params?: unknown }; controls?: { compare?: { opts: { how: string; params?: unknown }[] }; whatIf?: { paths: string[]; min: number; max: number } } };
      if (sl.model?.params) { setParams(defaultParams()); sendParams(sl.model.params); same(`${d.id} slide ${i + 1} model`); modelSlides++; }
      for (const o of sl.controls?.compare?.opts ?? []) if (o.how === 'params' && o.params) { setParams(defaultParams()); sendParams(o.params); same(`${d.id} slide ${i + 1} compare button`); compareButtons++; }
      const w = sl.controls?.whatIf;
      if (w) for (const x of [w.min, w.max]) {
        setParams(defaultParams());
        const patch: P = {};
        for (const path of w.paths) { const k = path.split('.'); let o = patch; k.forEach((q, j) => { if (j === k.length - 1) o[q] = x; else o = (o[q] = (o[q] as P) ?? {}) as P; }); }
        sendParams(patch); same(`${d.id} slide ${i + 1} what-if ${x}`); whatIfEnds++;
      }
    });
  }
  console.log(`G3 checked ${modelSlides} slide models, ${compareButtons} compare parameter buttons, ${whatIfEnds} what-if ends`);
  assert.ok(modelSlides > 0 && whatIfEnds > 0, 'the walk found slides (a loader that returned nothing would pass for nothing)');
});

test('W7: a slide\'s parameters are the preset\'s own settings plus the slide\'s, not the leftover of the last slider (applyModel gate, Plan 32 gate 3)', () => {
  const preset = (PRESETS as { id: string; apply(p: unknown): unknown }[]).find((x) => x.id === 'cirr-decomp')!.apply(defaultParams()) as P;
  presetStarted('cirr-decomp', preset);
  setParams(preset);
  sendParams({ tips: { on: true, d: 10 }, splenicRx: 2 });   // a slider's leftover on the last slide
  const slide = { cirrhosis: 0.4 };
  const want = JSON.parse(JSON.stringify(sanitizeParams({ ...preset, ...slide })));
  assert.deepEqual(JSON.parse(JSON.stringify(sanitizeParams(slideParams(slide)))), want, 'preset + slide');
  assert.notDeepEqual((patient.params as P).tips, (preset as P).tips, 'the leftover is on the patient now');
});

test('W9: a slide or a link is the new base: Treat counts the learner\'s own changes from it, and Undo does not walk back through what came before', () => {
  const preset = (PRESETS as { id: string; apply(p: unknown): unknown }[]).find((x) => x.id === 'healthy')!.apply(defaultParams()) as P;
  presetStarted('healthy', preset);
  setParams(preset);
  updateParams({ cirrhosis: 0.3 }, { label: 'mine' });
  assert.equal(canUndo(), true);
  updateParams((p: P) => { p.tips = { on: true, d: 8 }; return p; }, { history: false, base: true, label: 'From the link' });
  assert.equal(canUndo(), false, 'the history before the link is gone');
  assert.deepEqual((presetBase() as P).tips, { on: true, d: 8 }, 'the link\'s TIPS is the base, not "Your changes"');
  updateParams({ cirrhosis: 0.9 }, { label: 'mine again' });
  assert.equal(historyNow().length, 1, 'only his own change is listed');
  rebase();
  assert.equal(canUndo(), false);
  assert.equal((presetBase() as P).cirrhosis, 0.9);
});

/** every .ts/.tsx under src (not the vendored engine) */
function sources(dir = 'src', out: string[] = []): string[] {
  for (const n of readdirSync(dir)) { const f = join(dir, n); if (f === join('src', 'engine', 'hales')) continue; if (statSync(f).isDirectory()) sources(f, out); else if (/\.tsx?$/.test(n)) out.push(f); }
  return out;
}
const keysOf = (src: string, decl: string): string[] => {
  const m = src.match(new RegExp(`${decl}[^{]*\\{([\\s\\S]*?)\\n\\}`));
  return m ? [...m[1]!.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?:^|[;{\s])([a-zA-Z]+)\??:/g)].map((x) => x[1]!) : [];
};

test('G4: the shell Figure has no write-only key, and none of its keys is a twin of a Blood switch (W2)', () => {
  const shell = readFileSync('src/ui/shell/store.ts', 'utf8'), blood = readFileSync('src/scene/blood/options.ts', 'utf8');
  const figure = keysOf(shell, 'export interface Figure'), bloodKeys = keysOf(blood, 'export interface BloodChoice');
  assert.deepEqual(figure.sort(), ['bile', 'labelLevel', 'lymph', 'zones']);
  assert.ok(bloodKeys.includes('chevrons') && !bloodKeys.includes('keyStreaks'));
  assert.deepEqual(figure.filter((k) => bloodKeys.includes(k)), [], 'a key lives in one store: the Blood menu owns its five, the shell the lobule layers and the label level');
  const others = sources().filter((f) => f !== 'src/ui/shell/store.ts').map((f) => readFileSync(f, 'utf8'));
  for (const k of figure) assert.ok(others.some((s) => new RegExp(`figure\\.${k}\\b|figure\\)\\.${k}\\b|\\b${k}: f\\.${k}|f\\.${k}\\b`).test(s) || (['zones', 'lymph', 'bile'].includes(k) && s.includes('LAYER_SWITCHES'))), `Figure.${k} has no reader outside its own store`);
});

// ---- Push 2 (W1 the shown moment, W6 the transport mirror, W5 a stale frame) ----
import { holdFrame, latest, live, shownParams, viewingHeld, onLeaveHeld, resetParamsRev } from '../src/engine/store.ts';
import { askSpeed, mirrorTransport, togglePlay } from '../src/ui/shell/transport.ts';
import { useShell } from '../src/ui/shell/store.ts';

test('G8: with a held frame, the figure and the Tests panes read the held parameters; the edit paths keep the patient\'s (W1)', () => {
  const now = { ...(defaultParams() as P), cirrhosis: 0.2, tips: { on: true, d: 8 } }, then = { ...(defaultParams() as P), cirrhosis: 0.9 };
  setParams(now);
  assert.equal(shownParams(), patient.params);
  const t = tick();
  holdFrame(frame() as never, then);
  assert.equal(shownParams(), then, 'the shown moment is Then');
  assert.equal(patient.params, now, 'the patient is still Now');
  assert.ok(viewingHeld());
  assert.ok(tick() > t, 'a card that reads the shown parameters reads them again');
  holdFrame(frame() as never);   // (Force-all: a frame forged from the live model has no parameters of its own)
  assert.equal(shownParams(), patient.params);
  assert.ok(!viewingHeld());
  holdFrame(null);
});

test('W1: an edit while Then is shown returns to Now first, then applies to the live patient', () => {
  const now = { ...(defaultParams() as P), cirrhosis: 0.2 };
  setParams(now);
  let left = 0;
  onLeaveHeld(() => { left++; holdFrame(null); });
  holdFrame(frame() as never, { ...(defaultParams() as P), cirrhosis: 0.9 });
  sendParams({ splenicRx: 1 });
  assert.equal(left, 1, 'Compare was told to go back to Now');
  assert.ok(!viewingHeld());
  assert.equal((patient.params as P).cirrhosis, 0.2, 'the edit is on the live patient, not on Then');
  assert.equal((patient.params as P).splenicRx, 1);
  sendParams({ splenicRx: 2 });
  assert.equal(left, 1, 'nothing held: nothing to leave');
  onLeaveHeld(null);
});

test('G7: the speed pill follows the frame after a rupture, a lapse end and a morph; a speed just asked for is not undone by a frame in flight (W6)', () => {
  const tr = () => useShell.getState().transport;
  const f = (o: object) => ({ t: 1, day: 0, running: true, speed: 1, clock: 'hemo' as const, ...o });
  mirrorTransport(f({ speed: 30, clock: 'disease' }));
  assert.equal(tr().lapse, 30, 'a lapse at 30 d/s');
  mirrorTransport(f({ speed: 1, clock: 'hemo' }));
  assert.deepEqual([tr().speed, tr().lapse], [1, 0], 'the lapse ended (or a rupture, or a morph): the worker put the clock back to 1x');
  mirrorTransport(f({ speed: 2, clock: 'hemo' }));
  assert.equal(tr().speed, 2);
  // the learner asks for 4x: the pill says 4x at once, and a frame posted before the worker saw it (still 2x) does not take it back
  setParams(defaultParams());
  askSpeed(4, false);
  assert.equal(tr().speed, 4);
  mirrorTransport(f({ speed: 2, clock: 'hemo' }));
  assert.equal(tr().speed, 4, 'a frame in flight');
  mirrorTransport(f({ speed: 4, clock: 'hemo' }));
  assert.equal(tr().speed, 4, 'the worker agrees');
  mirrorTransport(f({ speed: 1, clock: 'hemo' }));
  assert.equal(tr().speed, 1, 'and from then the frame is the truth again');
});

test('W6: togglePlay reads the live model, not the shown (pinned or forged) frame', () => {
  const sent: unknown[] = [];
  live.frame = { ...(frame() as object), running: false } as never;
  holdFrame({ ...(frame() as object), running: true } as never, defaultParams());
  assert.equal(latest.frame?.running, true);
  const src = readFileSync('src/ui/shell/transport.ts', 'utf8');
  assert.match(src, /live\.frame\?\.running/);
  assert.doesNotMatch(src, /latest\.frame/);
  void togglePlay; void sent;
  holdFrame(null);
});

test('W5: a frame stamped with fewer setParams than the page has sent never overwrites the page\'s copy, even during a bedside lapse; the next frame is taken', () => {
  resetParamsRev();
  setParams({ ...(defaultParams() as P), cirrhosis: 0.5 });
  const stamped = (rev: number, cirrhosis: number) => ({ ...(frame({ ...(defaultParams() as P), cirrhosis }) as object), paramsRev: rev }) as never;
  adoptFrame(stamped(0, 0.5));
  sendParams({ cirrhosis: 0.1 });   // the slider: the page has sent 1
  adoptFrame(stamped(0, 0.5));      // a frame posted just before the host saw it
  assert.equal((patient.params as P).cirrhosis, 0.1, 'the old value did not come back');
  for (let i = 0; i < 5; i++) adoptFrame(stamped(0, 0.5 + i / 100));   // (a lapse posts params every tick)
  assert.equal((patient.params as P).cirrhosis, 0.1, 'every stale tick of a lapse is dropped');
  adoptFrame(stamped(1, 0.12));     // the host has taken it: its frames are the truth again (a ramp may move the value)
  assert.equal((patient.params as P).cirrhosis, 0.12);
  adoptFrame(({ ...(frame({ ...(defaultParams() as P), cirrhosis: 0.3 }) as object) }) as never);   // (a host that stamps nothing is never stale)
  assert.equal((patient.params as P).cirrhosis, 0.3);
});

// ---- Push 3 (W7 slide controls, W8 settings reach, W9 base) ----
test('G5: every Settings key names its reach, the reader is where the table says, and a per-frame key has an invalidate in its writer path (W8)', () => {
  const table = (JSON.parse(readFileSync('tests/state-wiring.table.json', 'utf8')) as { 'settings-reach': Record<string, { reach: string; file: string }> })['settings-reach'];
  const keys = keysOf(readFileSync('src/state/settings.ts', 'utf8'), 'export interface Settings');
  assert.ok(keys.length >= 15, `Settings keys read: ${keys.join()}`);
  assert.deepEqual(Object.keys(table).sort(), [...keys].sort(), 'a Settings key without a row, or a row without a key');
  for (const [k, { reach, file }] of Object.entries(table)) {
    const src = readFileSync(file, 'utf8');
    assert.ok(new RegExp(`\\b${k}\\b`).test(src), `${k}: ${file} never reads it`);
    if (reach === 'per-frame+invalidate') assert.match(src, new RegExp(`${k} !== prev\\.${k}[^\\n]*invalidate\\(`), `${k}: no clock.invalidate where the setting changes`);
    if (reach === 'subscribe') assert.match(src, /subscribe\(/, `${k}: no subscriber in ${file}`);
    if (reach === 'ease') assert.match(src, new RegExp(`${k} !== prev\\.${k}[^\\n]*\\.to\\(`), `${k}: no Ease.to where the setting changes`);
  }
});

test('G1: every param-changing message the page sends is named in the table, with its sender, how the page follows and its tick', () => {
  const table = (JSON.parse(readFileSync('tests/state-wiring.table.json', 'utf8')) as { messages: Record<string, { file: string; follows: string; tick: string }[] | string> }).messages;
  const types = Object.keys(table).filter((k) => !k.startsWith('_'));
  const found = new Map<string, Set<string>>();
  for (const f of sources()) {
    if (f.startsWith('src/engine/hales')) continue;
    const text = readFileSync(f, 'utf8');
    for (const t of types) if (new RegExp(`type: '${t}'`).test(text)) (found.get(t) ?? found.set(t, new Set()).get(t)!).add(f);
  }
  for (const t of types) {
    const named = new Set((table[t] as { file: string }[]).map((r) => r.file)), seen = found.get(t) ?? new Set<string>();
    assert.deepEqual([...seen].sort(), [...named].sort(), `message "${t}": senders in the code and in the table differ (name a new sender, with how the page follows it)`);
    for (const r of table[t] as { follows: string; tick: string }[]) assert.ok(r.follows && r.tick, `${t}: say how the page follows and which tick fires`);
  }
});
