// What a tap or a hover lands on: organs, vessels, the lobule's parts and the Circuit's stations.
// Part of CelScene (scene.ts): these methods are mixed into the class, so `this` is the scene. Moved from scene.ts as they were.
import { Vector3, Raycaster, Vector2 } from 'three';
import { MAPPED, NETWORK } from '../vessels/network.ts';
import { FAINT_ONLY_LAYER } from '../vessels/vessel-object.ts';
import { x2d } from '../frame2d.ts';
import { type FigureHit, organHit } from '../organs/pick.ts';
import { type LobuleHit } from '../lobule/index.ts';
import { VESSEL_LAYER } from '../layers.ts';
import { COURSES } from '../circuit/course.ts';
import { mapToScene, turnScenePt } from '../circuit/map.ts';
import type { CelScene } from '../scene.ts';
import { scenePart } from './define.ts';

export const pickPart = scenePart<CelScene>()({
  /** The vessel under a point of the canvas (CSS px), or null: what a shunt's pointer is over. */
  vesselAtPoint(x: number, y: number): string | null { const h = this.pickTargetAt(x, y, this.shuntRay, false); return h && h.type === 'edge' ? h.id : null; },
  /** The vessel the pointer is on, in the Circuit: the nearest drawn course within a thumb's reach (screen px). */
  pickCircuit(x: number, y: number): string | null {
    if (this.circuit.t < 1) return null;
    const rr = this.circuit.rr, reach = this.phone ? 16 : 10;
    let best: string | null = null, bestD = reach * reach;
    const v3 = new Vector3(), a = { x: 0, y: 0 };
    const along = (id: string, pts: readonly (readonly [number, number])[]): void => {
      let px = NaN, py = NaN;
      for (let i = 0; i < pts.length; i += 2) {
        const m = mapToScene(pts[i]![0], pts[i]![1]), q = turnScenePt(m[0], m[1], rr);
        this.rig.project(v3.set(q[0], q[1], m[2]), a);
        if (!Number.isNaN(px)) {
          const dx = a.x - px, dy = a.y - py, L = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((x - px) * dx + (y - py) * dy) / L)), ex = px + dx * u - x, ey = py + dy * u - y, d = ex * ex + ey * ey;
          if (d < bestD) { bestD = d; best = id; }
        }
        px = a.x; py = a.y;
      }
    };
    for (const v of MAPPED) if (this.presence.stateOf(v.id) === 'shown') along(v.id, COURSES.get(v.id)!.mapPts);
    // (the custom shunts a learner opened: routed on the map, drawn with the rest, so a tap on one is a tap on a vessel)
    for (const c of this.tubes.pickCourses()) if (c.map) along(c.id, c.map);
    return best;
  },
  /** The vessel whose body a pointer ray hits first, for tap-to-pick. */
  pickAt(x: number, y: number, raycaster: Raycaster): string | null {
    if (this.figureView === 'circuit') return this.pickCircuit(x, y);
    if (this.figureView !== 'body') return null;
    raycaster.layers.enable(VESSEL_LAYER); raycaster.layers.enable(FAINT_ONLY_LAYER);
    raycaster.setFromCamera(new Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1), this.rig.camera);
    const all = [...this.vessels, ...this.tubes.pickable()];   // (a custom shunt's tube is a vessel too)
    const hits = raycaster.intersectObjects(all.map((v) => v.toonMesh), false);
    for (const h of hits) {
      const o = all.find((v) => v.toonMesh === h.object);
      if (o && o.group.visible) return o.edge!.id;   // (a vessel not drawn, a collateral not yet open, takes no tap)
    }
    return null;
  },
  /** What a tap on the lobule is (a part, and the zone for the hepatocytes), by 2D's own rule (lobule/pick.ts), or null; only while the lobule is the view. */
  pickLobule(x: number, y: number, raycaster: Raycaster): LobuleHit | null {
    if (this.figureView !== 'lobule') return null;
    raycaster.setFromCamera(new Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1), this.rig.camera);
    return this.lobule.hitRay(raycaster.ray, this.rig.camera, { w: this.width, h: this.height });
  },
  /** What a tap at canvas point (x, y) opens, in the 2D app's order (stage.js pick): the vessel under it, else the nearest vessel within reach of the finger (12 px, 18 for a touch),
   *  else the organ under it (the liver with its lobe, the heart, the spleen), else the belly's fluid, else nothing. Only the body takes organ and fluid taps (the Circuit has no organs). */
  pickTargetAt(x: number, y: number, raycaster: Raycaster, touch = false): FigureHit | null {
    const edge = this.pickAt(x, y, raycaster) ?? (this.figureView === 'body' ? this.nearVessel(x, y, touch ? 18 : 12) : null);
    if (edge) return { type: 'edge', id: edge };
    if (this.figureView !== 'body' || this.circuit.t > 0.5 || this.bodyShown < 0.5) return null;
    const o = this.disease.organs.pick(raycaster);   // (the ray is the one pickAt set)
    if (o) return organHit(o.id, x2d(o.x));
    // (the gut is one surface over the belly; a tap on it, where no liver, heart or spleen lies beneath, lights the part it is on)
    const gut = this.disease.organs.pickGut(raycaster);
    if (gut) return organHit(gut.id, x2d(gut.x));
    const wet = this.disease.ascites.pick(raycaster);   // (the drawn pool and its top, by ray: no plane of its own)
    if (wet) return organHit('abdomen', wet.x);
    return null;
  },
  /** The drawn vessel nearest the point within `reach` CSS px of its edge (screen space, from the courses as laid; 2D nearbyEdge), or null. */
  nearVessel(x: number, y: number, reach: number): string | null {
    const a = new Vector3(), b = new Vector3(), pa = { x: 0, y: 0 }, pb = { x: 0, y: 0 };
    const one = this.rig.project(b.set(1, 0, 0), pb), zero = this.rig.project(a.set(0, 0, 0), pa);
    const k = Math.hypot(one.x - zero.x, one.y - zero.y);   // CSS px in a scene unit at the figure's plane
    let best: string | null = null, bestD = reach;
    for (const v of NETWORK) {
      if (v.plan?.kind === 'feeder' || this.presence.stateOf(v.id) !== 'shown' || !this.byEdge.get(v.id)?.group.visible) continue;
      const half = v.radius * k, pts = v.pts;
      let px = NaN, py = NaN;
      for (const p of pts) {
        this.rig.project(a.set(p[0], p[1], p[2]), pb);
        if (!Number.isNaN(px)) {
          const dx = pb.x - px, dy = pb.y - py, L = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((x - px) * dx + (y - py) * dy) / L));
          const d = Math.hypot(px + dx * u - x, py + dy * u - y) - half;
          if (d < bestD) { bestD = d; best = v.id; }
        }
        px = pb.x; py = pb.y;
      }
    }
    // the custom shunts a learner opened, on their own body course (circuit/tubes.ts)
    for (const c of this.tubes.pickCourses()) {
      if (!c.body) continue;
      const half = c.body.radius * k;
      let px = NaN, py = NaN;
      for (const p of c.body.pts) {
        this.rig.project(a.set(p.x, p.y, p.z), pb);
        if (!Number.isNaN(px)) {
          const dx = pb.x - px, dy = pb.y - py, L = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((x - px) * dx + (y - py) * dy) / L));
          const d = Math.hypot(px + dx * u - x, py + dy * u - y) - half;
          if (d < bestD) { bestD = d; best = c.id; }
        }
        px = pb.x; py = pb.y;
      }
    }
    return best;
  },
});
export type PickPart = typeof pickPart;
