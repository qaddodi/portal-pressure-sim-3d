// Every one of the 20 presets, through the disease layer: the targets say what the 2D figure shows, and the layer builds finite geometry for them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { presenceOf, recruitFrac, NETWORK } from '../src/scene/vessels/network.ts';
import { bodyTargets } from '../src/scene/disease/targets.ts';
import { type PresetState, presetIds, presetState } from './b4-presets.ts';

const ids = await presetIds();
const states = new Map<string, PresetState>();
for (const id of ids) states.set(id, await presetState(id));
const targets = (id: string) => { const s = states.get(id)!; return bodyTargets(s.frame, s.params, s.healthyP); };

test('there are 20 presets', () => assert.equal(ids.length, 20));

test('each preset\'s disease reads as the 2D figure draws it', () => {
  const t = (id: string) => targets(id);
  assert.deepEqual(t('healthy').thrombus, {}); assert.equal(t('healthy').ascites, 0); assert.equal(t('healthy').spleenScale, 1);
  assert.deepEqual(Object.keys(t('pvt-acute').thrombus), ['PV_TRUNK']);
  assert.deepEqual(Object.keys(t('svt').thrombus), ['SV_CONF']);
  assert.deepEqual(Object.keys(t('budd-chiari').thrombus).sort(), ['LHV_IVC', 'MHV_IVC', 'RHV_IVC']);
  assert.ok(t('cirr-decomp').cirrhosis > 0.8 && t('cirr-decomp').ascites > 1000 && t('cirr-decomp').spleenScale > 1.5 && t('cirr-decomp').varix.VAR === 1);
  assert.ok(t('gastric-varix').varix.GV === 1 && t('gastric-varix').varix.VAR === 0);
  for (const id of ['sos', 'budd-chiari', 'ivc-web', 'rhf', 'constrictive']) assert.ok(t(id).congestion > 0.4, `${id} congests the liver`);
  for (const id of ['healthy', 'cirr-comp', 'csph']) assert.equal(t(id).congestion, 0, id);
  assert.ok(t('rhf').liverScale > 1 && t('cirr-decomp').liverScale < 1, 'a congested liver swells, a cirrhotic one shrinks');
  assert.ok(t('budd-chiari').ascites > t('cirr-decomp').ascites);
});

test('every target is finite and in its range, for every preset', () => {
  for (const id of ids) {
    const t = targets(id);
    for (const [k, v] of Object.entries({ c: t.cirrhosis, g: t.congestion, tint: t.tint, liver: t.liverScale, spleen: t.spleenScale, asc: t.ascites, VAR: t.varix.VAR, GV: t.varix.GV })) assert.ok(Number.isFinite(v), `${id} ${k}`);
    assert.ok(t.congestion >= 0 && t.congestion <= 1 && t.tint >= 0 && t.tint <= 0.5 && t.varix.VAR >= 0 && t.varix.VAR <= 1 && t.varix.GV >= 0 && t.varix.GV <= 1, id);
    for (const [v, x] of Object.entries(t.thrombus)) assert.ok(x >= 0 && x <= 1, `${id} ${v}`);
  }
});

test('the whole layer takes every preset, eases, and keeps every number and every vertex finite', () => {
  const scene = new CelScene();
  const d = scene.disease;
  for (const id of ids) {
    const s = states.get(id)!;
    d.feed(s.frame, s.params, s.healthyP, {
      instant: true,
      presence: (v) => (NETWORK.some((n) => n.id === v && n.kind !== 'collateral') ? 1 : 0),
      recruit: (v, f) => recruitFrac(v, f as never),
    }, true);
    for (let i = 0; i < 40; i++) d.update(1000 + i * 33);
    d.group.traverse((o) => {
      const g = (o as { geometry?: { getAttribute(n: string): { array: ArrayLike<number> } | undefined } }).geometry;
      const p = g?.getAttribute('position');
      if (p) for (let i = 0; i < p.array.length; i += 7) assert.ok(Number.isFinite(p.array[i]!), `${id}: ${o.name || o.type} has a NaN vertex`);
    });
    const shown = d.clots.shown();
    for (const v of Object.keys(states.get(id)!.params.thrombus ?? {})) if ((states.get(id)!.params.thrombus ?? {})[v]! > 0.05) assert.ok(shown[v]! > 0.5, `${id}: clot ${v} shown`);
    for (const v of Object.keys(shown)) assert.ok((states.get(id)!.params.thrombus ?? {})[v]! > 0, `${id}: no clot ${v} in the patient`);
  }
  scene.dispose?.();
});

test('presence of collaterals follows the model: a healthy patient shows none, a decompensated one shows plexuses', () => {
  const scene = new CelScene(); const d = scene.disease;
  const feed = (id: string) => { const s = states.get(id)!; d.feed(s.frame, s.params, s.healthyP, { instant: true, presence: (v) => presenceOf(NETWORK.find((n) => n.id === v) ?? { id: v, kind: 'vein' } as never, s.frame as never, { collaterals: true }) === 'shown' ? 1 : 0, recruit: (v, f) => recruitFrac(v, f as never) }, true); for (let i = 0; i < 30; i++) d.update(1000 + i * 33); };
  // (the sinusoids' own faint strands are anatomy, drawn on a healthy liver: only the collaterals' plexuses follow the disease)
  const plexuses = () => Object.entries(d.strands.drawn()).filter(([id]) => !id.startsWith('SIN_')).reduce((a, [, b]) => a + b, 0);
  feed('healthy'); const none = plexuses();
  feed('cirr-decomp'); const some = plexuses();
  assert.equal(none, 0); assert.ok(some > 0, `${some} strands drawn for decompensated`);
});
