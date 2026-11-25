// The superior vena cava is drawn whole in both views, and runs UP out of the right atrium as 2D draws it (Mohammad, 20 Nov: "where is the SVC? it should be present in both circuit and
// anatomy ... extend upwards"). Root cause: `isDrawnEdge` left out V_UP (the brachiocephalic veins, the cava's own run up out of the figure), so the cava ended in a blunt cap at the azygos
// (Circuit) and just above the heart (Anatomy) instead of rising on, fading to nothing, as 2D's FADE_DOWN_Y has it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRAWN_EDGE_IDS, NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { BACK_EDGES, CONTEXT_EDGES, EDGE_PATH_2D } from '../src/scene/vessels/paths.copied.ts';
import { fadeOf } from '../src/scene/vessels/fades.ts';
import { CIRCUIT_D } from '../src/scene/circuit/data.copied.ts';
import { y3 } from '../src/scene/frame2d.ts';
import { PLACED_EDGE_3D } from '../src/scene/anatomy/placed-network.ts';

const CHAIN = ['V_UP', 'SVC_RA_1', 'SVC_RA'] as const;

test('every context vessel the 2D figure draws (the cava, the azygos, the renal and epigastric veins) is a vessel here', () => {
  for (const id of CONTEXT_EDGES) assert.ok(DRAWN_EDGE_IDS.includes(id) && NETWORK_BY_ID.has(id), `${id} is not drawn`);
});

test('the superior cava is one connected run from above the figure to the right atrium, behind the organs like the 2D cava', () => {
  for (const id of CHAIN) { assert.ok(NETWORK_BY_ID.has(id), id); assert.ok(BACK_EDGES.has(id), `${id} is a back vessel`); }
  for (let i = 1; i < CHAIN.length; i++) {
    const a = NETWORK_BY_ID.get(CHAIN[i - 1]!)!, b = NETWORK_BY_ID.get(CHAIN[i]!)!;
    const p = a.pts[a.pts.length - 1]!, q = b.pts[0]!;
    assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-3, `${a.id} meets ${b.id}`);
  }
  const top = NETWORK_BY_ID.get('V_UP')!.pts[0]!, atrium = NETWORK_BY_ID.get('SVC_RA')!.pts.at(-1)!;
  assert.ok(top[1] > y3(40) + 0.2, 'it rises well above where the SVC proper starts (2D y 40), out of the top of the figure');
  assert.ok(top[1] > atrium[1] + 0.4, 'and well above the right atrium');
});

test('Circuit: the cava runs up past the azygos (2D draws a long bar above it), on the same column as the SVC', () => {
  const col = (d: string) => [...d.matchAll(/[ML]\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/g)].map((m) => [+m[1]!, +m[2]!] as const);
  const up = col(CIRCUIT_D.V_UP!), svc = col(CIRCUIT_D.SVC_RA_1!), azy = col(CIRCUIT_D.AZY_SVC!);
  assert.equal(up[0]![0], svc[0]![0]);
  assert.ok(up[0]![1] < azy[azy.length - 1]![1] - 50, 'its top lies well above the azygos joint');
});

test('Anatomy: it fades out going up (2D FADE_DOWN_Y) and is solid where it meets the heart; the SVC proper is never faded', () => {
  const f = fadeOf('V_UP', false)!;
  assert.equal(f.mode, 2);
  assert.ok(f.a0 === 1 && f.a1 === 0, 'solid at the top of the SVC, gone toward the top of the figure');
  {
    // (restated for the placed anatomy, the only one now: the 2D band y 38 to 4 moves with the vessel, by how far its course's end moved to the placed one (fades.ts placedFade),
    // so it is the same span, still running upward, and it lies on the placed course)
    assert.ok(Math.abs((f.to - f.from) - (y3(4) - y3(38))) < 1e-12 && f.from < f.to, 'the span of 2D y 38 to 4, moved with the vessel');
    const ys = PLACED_EDGE_3D.V_UP!.map((p) => p[1]);
    assert.ok(f.from >= Math.min(...ys) - 1e-9 && f.to <= Math.max(...ys) + 1e-9, 'on the placed course');
  }
  assert.equal(f.keep, false, 'the Circuit lets the fade go: the bar is drawn whole there');
  for (const id of ['SVC_RA_1', 'SVC_RA']) { const g = fadeOf(id, false); assert.ok(!g || (g.a0 === 1 && g.a1 === 1), `${id} is solid`); }
  assert.ok(EDGE_PATH_2D.V_UP![0]![1] < 0, 'its 2D course starts above the figure (y < 0)');
});
