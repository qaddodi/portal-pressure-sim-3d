// EVERY JUNCTION IS A FORK (Mohammad, 20 Nov: "the coronary vein junction to the portal vein and the SMV SV junction still suck... isn't it 3D and can be joined easily?"). The root cause: a junction was a separate tube with a collar (a symmetric
// bulge that blooms into a pad or a knot), a buried ring and a held-back line, and the trunk drew its own wall straight across the branch's mouth. The liver's branches already had the better construction (liver-branches.ts, neighbour.ts): the branch
// ends on the trunk's centreline at its own width, a little behind the trunk, and the outline of the two together is the outline of their UNION. Every plain vessel that ends on a trunk (smooth-joins.ts `attach`) is built that way now.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { SMOOTH, isPlain } from '../src/scene/vessels/smooth-joins.ts';
import { JUNCTION_MATES, nbrMatesOf, neighbourAttr } from '../src/scene/vessels/neighbour.ts';
import { REST, coursesOf, tubularOf } from '../src/scene/vessels/shape.ts';
import { buildTubes } from '../src/scene/vessels/tubes.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { CelScene } from '../src/scene/scene.ts';

const junctionEnds = (): { id: string; end: 0 | 1; hosts: string[] }[] => {
  const out: { id: string; end: 0 | 1; hosts: string[] }[] = [];
  for (const [id, sj] of SMOOTH) { const v = NETWORK_BY_ID.get(id)!; if (!isPlain(v)) continue; for (const end of [0, 1] as const) if (sj.attach[end]) out.push({ id, end, hosts: [...sj.attach[end]!] }); }
  return out;
};
const withJoins = <T>(f: () => T): T => { const was = smoothJoinsOn(); setSmoothJoins(true); try { return f(); } finally { setSmoothJoins(was); } };

test('the junctions the figure has are the coronary vein, the splenic vein, the left portal vein, the inferior mesenteric vein, the epigastric vein and the left hepatic artery', () => {
  const ids = new Set(junctionEnds().map((j) => j.id));
  for (const id of ['LGV_CONF', 'SV_CONF', 'PVH_L', 'V_IMV', 'EPI_SVC', 'A_HL']) assert.ok(ids.has(id), `${id} is a junction branch`);
});

test('a branch and the trunk pieces it ends on are fork mates of each other, so the outline of the whole is the outline of the union (with Smooth vessel joins on; off, the 2D rule\'s own)', () => {
  withJoins(() => {
    for (const { id, hosts } of junctionEnds()) {
      assert.deepEqual(nbrMatesOf(id).filter((m) => hosts.includes(m)).sort(), [...hosts].sort(), `${id} sees its trunk`);
      for (const h of hosts) assert.ok(JUNCTION_MATES.get(h)!.includes(id), `${h} sees ${id}: the trunk draws no wall across the branch's mouth`);
    }
  });
  assert.equal(smoothJoinsOn(), false);
  for (const { id } of junctionEnds()) assert.deepEqual(nbrMatesOf(id), [], `${id}: off, no union`);
});

test('at a junction the branch\'s end lies inside the trunk\'s lumen and the trunk\'s vertices beside it lie inside the branch\'s: the shader draws one outline there', () => {
  withJoins(() => {
    for (const { id, end, hosts } of junctionEnds()) {
      const v = NETWORK_BY_ID.get(id)!, b = buildTubes(coursesOf(v, REST), tubularOf(v, 16), v.radius), run = b.runs[0]!;
      const nbr = neighbourAttr(id, b.geometry.getAttribute('position').array)!;
      assert.ok(nbr, `${id} has a nbr attribute`);
      const k = end ? run.tubular : 0;
      let inside = 0;
      for (let j = 0; j < run.radial; j++) { const i = run.tubeStart + k * (run.radial + 1) + j; if (nbr[i * 3 + 1]! > 0 && nbr[i * 3 + 2]! < 0.003 && Math.abs(nbr[i * 3]!) < nbr[i * 3 + 1]! * 1.02 + 0.003) inside++; }
      assert.ok(inside >= run.radial * 0.7, `${id} end ${end}: ${inside} of ${run.radial} end vertices lie inside the trunk's lumen (hosts ${hosts.join(', ')})`);
      // and the trunk sees the branch somewhere along it
      for (const h of hosts) {
        const hv = NETWORK_BY_ID.get(h)!, hb = buildTubes(coursesOf(hv, REST), tubularOf(hv, 16), hv.radius), hn = neighbourAttr(h, hb.geometry.getAttribute('position').array)!;
        let any = 0; for (let i = 0; i < hn.length / 2; i++) if (hn[i * 2 + 1]! > 0) any++;
        assert.ok(any > 0, `${h} carries the fork mate`);
      }
    }
  });
});

test('every tube carries the nbr attribute and every junction vessel switches the union on in the scene (a toggle of the setting rewrites the tubes in place)', () => {
  const s = new CelScene();
  for (const { id } of junctionEnds()) {
    const o = s.vesselObject(id)!;
    assert.ok(o.toonMesh.geometry.getAttribute('nbr'), `${id} has nbr`);
    assert.equal(o.toon.uniforms.nbrOn!.value, 1, `${id}: the union is on`);
  }
  assert.ok(s.vesselObject('IVC_IS')!.toonMesh.geometry.getAttribute('nbr'), 'a vessel with no mate carries zeros, not nothing');
  s.dispose?.();
});
