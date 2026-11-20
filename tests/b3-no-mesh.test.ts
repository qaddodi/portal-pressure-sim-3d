// "REMOVE THEM" (Mohammad, 20 Nov): no pink or red mesh over the cavernoma, the varices or the rectal varices. The root cause: the plexuses were drawn twice, once by the vessels (their own
// strands, vessels/shape.ts) and once by the disease StrandLayer in the portal tone, over them; and the varix's own trunk tube, a solid fill the width of the bundle, lay behind its strands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { StrandLayer, strandsDrawnByVessels } from '../src/scene/disease/strands.ts';
import { STRANDS } from '../src/scene/disease/copied/anatomy-b4.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { coursesOf, REST } from '../src/scene/vessels/shape.ts';
import { presetState } from './b4-presets.ts';

test('every plexus the 2D figure has is a vessel here, so the strand layer draws none (no second pink copy over the first)', async () => {
  for (const host of Object.keys(STRANDS)) assert.ok(strandsDrawnByVessels(host), `${host} is drawn by its vessel`);
  const s = new CelScene(); const d = s.disease;
  d.feed((await presetState('cirr-decomp')).frame as never, {}, null, { instant: true, presence: () => 1, recruit: () => 1 }, true); d.update(1000);
  assert.deepEqual(d.strands.drawn(), {}, 'the layer draws nothing');
  assert.ok(d.strands instanceof StrandLayer);
  s.dispose?.();
});

test('a varix is a few separate strands and no fill: the trunk tube is not drawn, the cavernoma keeps its own channels', () => {
  for (const id of ['C1a', 'C2', 'C4', 'C7']) {
    const cs = coursesOf(NETWORK_BY_ID.get(id)!, REST);
    assert.equal(cs[0]!.radius, 0, `${id}: no solid fill behind the strands`);
    assert.ok(cs.length - 1 >= 2 && cs.length - 1 <= 3, `${id}: ${cs.length - 1} strands`);
  }
  const c8 = coursesOf(NETWORK_BY_ID.get('C8')!, REST);
  assert.ok(c8.length > 2, 'the cavernoma channels are the vessel\'s own');
});
