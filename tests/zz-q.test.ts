import { test } from 'node:test';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
test('q', () => {
  setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  const draws: any[] = [];
  const set = new SkinSet({ vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, axes, arms) => { const d = new SkinObject(mesh, arms[0]!, axes, arms); (d as any).sk = mesh; draws.push(d); return d; },
    add: (o: Object3D) => new Group().add(o), remove: () => {}, warn: () => {} });
  set.build(2);
  for (const d of draws) {
    const m = d.sk, P = m.position, N = m.normal, I = m.index, R = m.restR;
    const out: string[] = [];
    for (const f of [0.1, 0.2, 0.4]) {
      const Q = new Float64Array(P.length); for (let v = 0; v < P.length / 3; v++) for (let k = 0; k < 3; k++) Q[3*v+k] = P[3*v+k] + N[3*v+k] * R[v] * f;
      let flips = 0;
      for (let i = 0; i < I.length; i += 3) {
        const nrm = (A: ArrayLike<number>) => { const [a,b,c]=[I[i],I[i+1],I[i+2]]; const u=[0,1,2].map(k=>A[3*b!+k]!-A[3*a!+k]!), v=[0,1,2].map(k=>A[3*c!+k]!-A[3*a!+k]!); return [u[1]!*v[2]!-u[2]!*v[1]!, u[2]!*v[0]!-u[0]!*v[2]!, u[0]!*v[1]!-u[1]!*v[0]!]; };
        const a = nrm(P), b = nrm(Q); if (a[0]!*b[0]!+a[1]!*b[1]!+a[2]!*b[2]! < 0) flips++;
      }
      out.push(`${f}:${flips}`);
    }
    process.stderr.write(`F ${d.mesh.name} flips at offset*R ${out.join(' ')}\n`);
  }
});
