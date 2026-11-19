// A vessel's tube, carried to the map: the body's tube (buildTube) gets the attributes the vertex shader morphs it by (shader.ts): the map course's centre and direction at
// each vertex's place along the vessel, the vertex's offset in the frame fixed by the direction (frame.ts), and its flow rank and place along the course. The two courses
// are read at the same arc-length share, so the tube is one mesh in both views and the morph is only a move of its vertices. Nothing is built per frame.
import { BufferAttribute, type BufferGeometry, type Vector3 } from 'three';
import type { VesselGeometry } from '../anatomy/vessels.ts';
import { COURSES, type CircuitCourse } from './course.ts';
import { encode } from './frame.ts';
import { sceneToMap } from './map.ts';
import { peelRank } from './peel.ts';

/** Slices a tube needs for its map course to keep its rounded corners: 24 to a scene unit of the longer course (the body's own is 30 to a unit of its course). */
export function slicesFor(id: string): number {
  const c = COURSES.get(id);
  return c ? Math.min(360, Math.max(16, Math.ceil(c.lenC * 24))) : 0;
}

export const CIRCUIT_ATTRIBUTES = ['cC', 'tC', 'fr', 'pk', 'cl'] as const;

/** Adds the morph's attributes to a built tube. The tube must have been built with at least `slicesFor(id)` slices. */
export function attachCircuit(built: VesselGeometry, course: CircuitCourse, radius: number): BufferGeometry {
  const g = built.geometry;
  const pos = g.getAttribute('position'), tan = g.getAttribute('tang');
  const n = pos.count;
  const cC = new Float32Array(n * 3), tC = new Float32Array(n * 3), fr = new Float32Array(n * 3), pk = new Float32Array(n * 2), cl = new Float32Array(n * 2);
  const { tubular, radial, curve } = built;
  const tubeCount = (tubular + 1) * (radial + 1);
  const capCount = (n - tubeCount) / 2;
  const write = (v: number, s: number, ca: Vector3, ta: readonly [number, number, number], cc: Vector3, tc: Vector3, rank: number) => {
    const o: [number, number, number] = [(pos.getX(v) - ca.x) / radius, (pos.getY(v) - ca.y) / radius, (pos.getZ(v) - ca.z) / radius];
    const f = encode(o, ta);
    fr[3 * v] = f[0]; fr[3 * v + 1] = f[1]; fr[3 * v + 2] = f[2];
    cC[3 * v] = cc.x; cC[3 * v + 1] = cc.y; cC[3 * v + 2] = cc.z;
    tC[3 * v] = tc.x; tC[3 * v + 1] = tc.y; tC[3 * v + 2] = tc.z;
    pk[2 * v] = rank; pk[2 * v + 1] = s;
    cl[2 * v] = course.lenA; cl[2 * v + 1] = course.lenC;
  };
  const tmpA = course.curveA.getPointAt(0), tmpC = course.curveC.getPointAt(0), tmpT = course.curveC.getTangentAt(0);
  const at = (s: number) => {
    tmpA.copy(curve.getPointAt(s)); tmpC.copy(course.curveC.getPointAt(s)); tmpT.copy(course.curveC.getTangentAt(s));
    return peelRank(sceneToMap(tmpC.x, tmpC.y)[0]);
  };
  for (let i = 0; i <= tubular; i++) {
    const s = i / tubular, rank = at(s);
    for (let j = 0; j <= radial; j++) {
      const v = i * (radial + 1) + j;
      write(v, s, tmpA, [tan.getX(v), tan.getY(v), tan.getZ(v)], tmpC, tmpT, rank);
    }
  }
  for (let cap = 0; cap < 2; cap++) {
    const s = cap, rank = at(s);
    for (let k = 0; k < capCount; k++) {
      const v = tubeCount + cap * capCount + k;
      write(v, s, tmpA, [tan.getX(v), tan.getY(v), tan.getZ(v)], tmpC, tmpT, rank);
    }
  }
  g.setAttribute('cC', new BufferAttribute(cC, 3));
  g.setAttribute('tC', new BufferAttribute(tC, 3));
  g.setAttribute('fr', new BufferAttribute(fr, 3));
  g.setAttribute('pk', new BufferAttribute(pk, 2));
  g.setAttribute('cl', new BufferAttribute(cl, 2));
  return g;
}
