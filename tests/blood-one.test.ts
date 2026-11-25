// One blood: the stomach's pool wears the colour of the bleeding jet (disease/paint.ts bloodColour), and the pool fills the stomach's lumen.
(globalThis as { location?: unknown }).location = { search: '', pathname: '/', hostname: 'localhost' };
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry } from 'three';
import type { CelShared } from '../src/scene/materials/cel.ts';
import { paletteFor } from '../src/scene/palette.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';
import { OrganLayer } from '../src/scene/organs/layer.ts';
import { rgbOf } from '../src/scene/organs/organ-look.ts';
import { poolSurfaceY } from '../src/scene/organs/pool-level.ts';
import { LUMEN_BOTTOM, STO_Y0 } from '../src/scene/disease/copied/stomach-lumen.js';
import { bloodColour } from '../src/scene/disease/paint.ts';
import { bodyTargets } from '../src/scene/disease/targets.ts';
import { CelScene } from '../src/scene/scene.ts';
import { x3, y3 } from '../src/scene/frame2d.ts';
import { presetState } from './b4-presets.ts';

const shared = (s: CelScene) => (s as unknown as { shared: CelShared }).shared;

test('the pool is the jet\'s blood in every look: the wash plus the pool\'s delta lands on bloodColour', async () => {
  const t = bodyTargets((await presetState('cirr-decomp')).frame, {}, null);
  for (const look of LOOK_IDS) {
    const s = new CelScene(), palette = paletteFor(look);
    const o = new OrganLayer(shared(s), { stomach: () => new BoxGeometry(0.5, 1.2, 0.1, 3, 30, 1).translate(x3(850), y3(400), 0) });
    o.applyLook(palette); o.setBlood(bloodColour(look, palette));
    o.setBody({ ...t, bleed: { active: true, site: 'VAR', rate: 90, total: 900 } }, true);
    for (let i = 0; i < 160; i++) o.update(1000 + i * 33);
    const u = o.byId.get('stomach')!.toon.uniforms;
    const c = u.color!.value as { r: number; g: number; b: number }, d = u.poolDelta!.value as { x: number; y: number; z: number };
    const want = bloodColour(look, palette);
    assert.ok(Math.abs(c.r + d.x - want[0]) < 0.01 && Math.abs(c.g + d.y - want[1]) < 0.01 && Math.abs(c.b + d.z - want[2]) < 0.01, `${look}: the pool is bloodColour`);
    o.dispose(); s.dispose?.();
  }
  assert.ok(rgbOf('#8E1A20')[0] > 0, 'the old fixed maroon is only the fallback of a layer used alone');
});

test('a full pool fills the whole lumen, and a fuller one stands higher, never lower', () => {
  assert.ok(poolSurfaceY(1) <= STO_Y0 + 8, 'full is the top of the lumen (the old 80% left a fifth of the stomach empty)');
  assert.ok(poolSurfaceY(0.12) > poolSurfaceY(0.5) && poolSurfaceY(0.5) > poolSurfaceY(1), 'the surface only rises with the fill');
  assert.ok(poolSurfaceY(0) >= LUMEN_BOTTOM, 'empty is at the bottom of the lumen');
});
