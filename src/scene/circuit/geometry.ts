// A vessel's tube, carried to the map: the body's tube (buildTube) gets the attributes the vertex shader morphs it by (shader.ts): the map course's centre and direction at
// each vertex's place along the vessel, the vertex's offset in the frame fixed by the direction (frame.ts), and its flow rank and place along the course. The two courses
// are read at the same arc-length share, so the tube is one mesh in both views and the morph is only a move of its vertices. Nothing is built per frame.
import { BufferAttribute, type BufferGeometry, type Vector3 } from 'three';
import type { VesselGeometry } from '../anatomy/vessels.ts';
import { COURSES, type CircuitCourse } from './course.ts';
import { encode } from './frame.ts';
import { sceneToMap } from './map.ts';
import { peelRank } from './peel.ts';
import type { TubeRun } from '../vessels/tubes.ts';

/** Slices a tube needs for its map course to keep its rounded corners: 24 to a scene unit of the longer course (the body's own is 30 to a unit of its course). */
export function slicesFor(id: string): number {
  const c = COURSES.get(id);
  return c ? Math.min(360, Math.max(16, Math.ceil(c.lenC * 24))) : 0;
}

export const CIRCUIT_ATTRIBUTES = ['cC', 'tC', 'fr', 'pk', 'cl'] as const;
/** The floats each morph attribute carries per vertex. */
export const CIRCUIT_ATTRIBUTE_SIZE: Readonly<Record<(typeof CIRCUIT_ATTRIBUTES)[number], number>> = { cC: 3, tC: 3, fr: 3, pk: 2, cl: 2 };

/** A vessel with no map course (a fan of tributaries, the liver's branching veins) gets the morph's attributes as zeros, so the shader's `cl.y <= 0` guard (circuit/shader.ts: the vertex stays where it is and
 *  fades by 2D's `1 - 2 * T0`) reads a real attribute and never relies on what a missing one defaults to. Attributes it already has are kept. */
export function withCircuitAttributes(g: BufferGeometry): BufferGeometry {
  const n = g.getAttribute('position').count;
  for (const name of CIRCUIT_ATTRIBUTES) if (!g.getAttribute(name)) g.setAttribute(name, new BufferAttribute(new Float32Array(n * CIRCUIT_ATTRIBUTE_SIZE[name]), CIRCUIT_ATTRIBUTE_SIZE[name]));
  return g;
}

/** Adds the morph's attributes to a built tube. The tube must have been built with at least `slicesFor(id)` slices. */
export function attachCircuit(built: VesselGeometry, course: CircuitCourse, radius: number): BufferGeometry {
  const { tubular, radial, curve } = built;
  const tubeCount = (tubular + 1) * (radial + 1);
  const capCount = (built.geometry.getAttribute('position').count - tubeCount) / 2;
  return attachRuns(built.geometry, [{ curve, tubular, radial, tubeStart: 0, tubeCount, capStart: tubeCount, capCount }], course, radius);
}

/** The same for a vessel built of several tubes (buildTubes: a trunk with its strands). Every tube is carried by the one map course, at its own share of the length, and a
 *  vertex's offset is read against its own radius (`rk`), so a thin strand or a tapered end keeps its width on the map. */
export function attachRuns(g: BufferGeometry, runs: readonly TubeRun[], course: CircuitCourse, radius: number): BufferGeometry {
  const pos = g.getAttribute('position'), tan = g.getAttribute('tang'), rkA = g.getAttribute('rk');
  const n = pos.count;
  const cC = new Float32Array(n * 3), tC = new Float32Array(n * 3), fr = new Float32Array(n * 3), pk = new Float32Array(n * 2), cl = new Float32Array(n * 2);
  const write = (v: number, s: number, ca: Vector3, ta: readonly [number, number, number], cc: Vector3, tc: Vector3, rank: number) => {
    const r = radius * (rkA ? rkA.getX(v) : 1);
    // (a tube of no radius, rk 0, is never drawn: its offset is none, not a division by nothing)
    const o: [number, number, number] = r > 0 ? [(pos.getX(v) - ca.x) / r, (pos.getY(v) - ca.y) / r, (pos.getZ(v) - ca.z) / r] : [0, 0, 0];
    const f = encode(o, ta);
    fr[3 * v] = f[0]; fr[3 * v + 1] = f[1]; fr[3 * v + 2] = f[2];
    cC[3 * v] = cc.x; cC[3 * v + 1] = cc.y; cC[3 * v + 2] = cc.z;
    tC[3 * v] = tc.x; tC[3 * v + 1] = tc.y; tC[3 * v + 2] = tc.z;
    pk[2 * v] = rank; pk[2 * v + 1] = s;
    cl[2 * v] = course.lenA; cl[2 * v + 1] = course.lenC;
  };
  const tmpA = course.curveA.getPointAt(0), tmpC = course.curveC.getPointAt(0), tmpT = course.curveC.getTangentAt(0);
  for (const run of runs) {
    const { curve, tubular, radial } = run;
    const at = (s: number) => {
      tmpA.copy(curve.getPointAt(s)); tmpC.copy(course.curveC.getPointAt(s)); tmpT.copy(course.curveC.getTangentAt(s));
      return peelRank(sceneToMap(tmpC.x, tmpC.y)[0]);
    };
    for (let i = 0; i <= tubular; i++) {
      const s = i / tubular, rank = at(s);
      for (let j = 0; j <= radial; j++) {
        const v = run.tubeStart + i * (radial + 1) + j;
        write(v, s, tmpA, [tan.getX(v), tan.getY(v), tan.getZ(v)], tmpC, tmpT, rank);
      }
    }
    for (let cap = 0; cap < 2; cap++) {
      const s = cap, rank = at(s);
      for (let k = 0; k < run.capCount; k++) {
        const v = run.capStart + cap * run.capCount + k;
        write(v, s, tmpA, [tan.getX(v), tan.getY(v), tan.getZ(v)], tmpC, tmpT, rank);
      }
    }
  }
  g.setAttribute('cC', new BufferAttribute(cC, 3));
  g.setAttribute('tC', new BufferAttribute(tC, 3));
  g.setAttribute('fr', new BufferAttribute(fr, 3));
  g.setAttribute('pk', new BufferAttribute(pk, 2));
  g.setAttribute('cl', new BufferAttribute(cl, 2));
  return g;
}
