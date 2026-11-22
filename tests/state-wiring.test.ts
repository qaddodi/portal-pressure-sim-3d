// Plan 38 (audit 3, state wiring): the figure's second input, the patient's parameters, has one owner. Gates G2 (the React tick follows the copy), G3 (the copy is the sanitized
// copy) and G4 (no write-only figure switch, no twin store for a switch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { sendParams } from '../src/engine/params-send.ts';
import { adoptFrame, patient, setParams, useParamsTick } from '../src/engine/store.ts';
import { PRESETS, defaultParams, sanitizeParams } from '../src/engine/hales/portal/scenario.js';
import { loadBuiltin } from '../src/decks/registry.ts';
import { copiedOf } from '../src/decks/hp/deck.ts';
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
    const deck = await loadBuiltin(d.id), c = copiedOf(d.id);
    if (!deck || !c) continue;
    c.slides.forEach((s, i) => {
      const sl = s as { model?: { params?: unknown }; whatIf?: { param?: unknown; min?: number; max?: number }; compare?: { opts?: { params?: unknown }[] } };
      if (sl.model?.params) { setParams(defaultParams()); sendParams(sl.model.params); same(`${d.id} slide ${i + 1} model`); }
      for (const o of sl.compare?.opts ?? []) if (o.params) { setParams(defaultParams()); sendParams(o.params); same(`${d.id} slide ${i + 1} compare option`); }
      const w = sl.whatIf;
      if (w && w.param != null) for (const x of [Number(w.min), Number(w.max)]) {
        setParams(defaultParams());
        const patch: P = {};
        for (const path of ([] as unknown[]).concat(w.param).map(String)) { const k = path.split('.'); let o = patch; k.forEach((q, j) => { if (j === k.length - 1) o[q] = x; else o = (o[q] = (o[q] as P) ?? {}) as P; }); }
        sendParams(patch); same(`${d.id} slide ${i + 1} what-if ${x}`);
      }
    });
  }
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
  assert.ok(bloodKeys.includes('chevrons') && bloodKeys.includes('keyStreaks'));
  assert.deepEqual(figure.filter((k) => bloodKeys.includes(k)), [], 'a key lives in one store: the Blood menu owns its six, the shell the lobule layers and the label level');
  const others = sources().filter((f) => f !== 'src/ui/shell/store.ts').map((f) => readFileSync(f, 'utf8'));
  for (const k of figure) assert.ok(others.some((s) => new RegExp(`figure\\.${k}\\b|figure\\)\\.${k}\\b|\\b${k}: f\\.${k}|f\\.${k}\\b`).test(s) || (['zones', 'lymph', 'bile'].includes(k) && s.includes('LAYER_SWITCHES'))), `Figure.${k} has no reader outside its own store`);
});
