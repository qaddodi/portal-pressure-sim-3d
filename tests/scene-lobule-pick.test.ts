// A tap on the lobule picks what 2D's does (lobule-zoom.js hitInto), so each part opens its own card: the triad and, inside it, the arteriole, the ductule and (Lymph on) the lymphatic; the central
// vein; a sinusoid, inlet or cross-link; the Bile layer's vessels only while it is on; the septa once cirrhosis draws them; the hepatocytes of the zone anywhere else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Raycaster, Vector2 } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { buildLobule, zoneOf, hexFrac } from '../src/scene/lobule/geometry.ts';
import { lobuleHit, lobuleSel } from '../src/scene/lobule/pick.ts';
import { cardFor } from '../src/ui/action/cards.ts';

const net = buildLobule();
const st = (o: Partial<Parameters<typeof lobuleHit>[2]> = {}) => ({ septU: 0, lymphOn: true, bileOn: false, radius: () => 0.01, cvRadius: 0.07, pxPerR: 300, ...o });
const hit = (x: number, y: number, o = {}) => lobuleHit(net, net.courses, st(o), x, y);

test('the triad\'s three vessels, and the triad round them', () => {
  const t = net.triads[2]!;
  assert.deepEqual(hit(t.ha[0], t.ha[1]), { part: 'ha', tri: 2 });
  assert.deepEqual(hit(t.bd[0], t.bd[1]), { part: 'bd', tri: 2 });
  assert.deepEqual(hit(t.lv[0], t.lv[1]), { part: 'lv', tri: 2 });
  assert.deepEqual(hit(t.x, t.y), { part: 'triad', tri: 2 });
  // with the Lymph layer off the lymphatic is not there: it is the triad's
  assert.equal(hit(t.lv[0], t.lv[1], { lymphOn: false })?.part, 'triad');
});

test('the central vein, a sinusoid, a cross-link and an inlet are their own parts', () => {
  assert.equal(hit(0, 0)?.part, 'cv');
  const mid = (k: string) => { const c = net.courses.find((x) => x.kind === k)!; return c.pts[Math.floor(c.pts.length / 2)]!; };
  assert.equal(hit(...mid('s0'))?.part, 'sin');
  assert.equal(hit(...mid('s2'))?.part, 'sin');
  assert.equal(hit(...mid('an'))?.part, 'an');
  const inlet = net.courses.find((x) => x.kind === 'in')!, q = inlet.pts[Math.floor(inlet.pts.length * 0.6)]!;
  assert.equal(hit(q[0], q[1])?.part, 'in');
});

test('anywhere else on the hexagon is the hepatocytes of its zone, and outside it nothing', () => {
  // a spot away from every vessel: found by walking out along an angle between two sinusoids
  let found = 0;
  for (let a = 0; a < 6.28 && found < 3; a += 0.17) for (const r of [0.2, 0.5, 0.85]) {
    const x = Math.cos(a) * r, y = Math.sin(a) * r, h = hit(x, y);
    if (h?.part === 'hep') { found++; assert.equal(h.zone, zoneOf(hexFrac(x, y))); }
  }
  assert.ok(found > 0);
  assert.equal(hit(3, 3), null);
});

test('the septa are tapped once cirrhosis draws them', () => {
  const [a, b] = [net.corners[0]!, net.corners[1]!], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  assert.equal(lobuleHit(net, [], st({ septU: 0.9 }), mx, my)?.part, 'septum');
  assert.equal(lobuleHit(net, [], st({ septU: 0.05 }), mx * 0.97, my * 0.97)?.part, 'hep', 'not before: the edge is tissue');
});

test('every part a tap can pick has the card 2D shows for it', () => {
  for (const part of ['triad', 'in', 'sin', 'an', 'cv', 'ha', 'bd', 'bs', 'bh', 'lv', 'septum']) {
    const card = cardFor(lobuleSel({ part }));
    assert.ok(card && card.key === `l:${part}`, `${part}: its own card`);
  }
  for (const zone of [1, 2, 3] as const) assert.equal(cardFor(lobuleSel({ part: 'hep', zone }))?.key, `l:zone${zone}`);
});

test('the view: the Bile layer\'s vessels are tapped only while it is on, and a ray through the plate finds the part under it', () => {
  const v = new LobuleView(createShared());
  v.setLayers({ bile: false }); v.setVisible(true); v.update(16);
  const bile = (v as unknown as { bilePick: { pts: [number, number][] }[] }).bilePick;
  assert.ok(bile.length > 0, 'the canaliculi and canals are known to the picker');
  const q = bile.find((b) => b.pts.length > 4)!.pts[3]!;
  assert.ok(!['bs', 'bh'].includes(v.hit(q[0], q[1], 300)?.part ?? ''), 'off: not tappable');
  v.setLayers({ bile: true }); v.update(32);
  assert.ok(['bs', 'bh'].includes(v.hit(q[0], q[1], 300)?.part ?? ''), 'on: tappable');
  // a ray straight at the centre of the plate, through a camera that looks at it from in front
  const cam = new PerspectiveCamera(14, 1, 0.1, 1000);
  cam.position.set(0, 0, 40); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  v.group.updateMatrixWorld(true);
  const rc = new Raycaster(); rc.setFromCamera(new Vector2(0, 0), cam);
  assert.equal(v.hitRay(rc.ray, cam, { w: 800, h: 800 })?.part, 'cv');
});
