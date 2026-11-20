// Atlas art's vessels: the artist's centrelines and radii fed into the live vessel builders. Every vessel keeps its VesselObject, its shader (pressure colour from the engine's data texture,
// the chevrons, the lens, the Circuit's morph attributes) and its ids; only the tube's shape is swapped, in place (VesselObject.reshape), as a collateral's coil already is. The vertex count
// is the vessel's own (the classic build's `tubular`, taken before any atlas course is set), so nothing is rebuilt or re-added. Going back to Classic is the same call with no courses: the
// 2D courses are built again and written over the atlas ones, and the Circuit's morph attributes with them.
import { NETWORK, NETWORK_BY_ID, ATLAS_COURSE } from '../vessels/network.ts';
import { REST, coursesOf, tubularOf } from '../vessels/shape.ts';
import { buildTubes } from '../vessels/tubes.ts';
import type { VesselObject } from '../vessels/vessel-object.ts';
import { COURSES } from '../circuit/course.ts';
import { attachRuns, slicesFor } from '../circuit/geometry.ts';
import type { Vec3 } from '../anatomy/vessels.ts';
import type { AtlasCourses } from './courses.ts';
import type { Specimen } from './types.ts';

export class AtlasVessels {
  /** each vessel's tube segments as the classic build made them (the atlas branch of coursesOf must not be in play when they are read) */
  private readonly tubular = new Map<string, number[]>();
  /** each vessel's 2D centreline (NetVessel.pts) while the artist's stands in for it */
  private readonly pts0 = new Map<string, Vec3[]>();
  /** the form the courses were last set for */
  private at: Specimen | null = null;

  private readonly object: (id: string) => VesselObject | undefined;
  constructor(object: (id: string) => VesselObject | undefined) { this.object = object; }

  /** The form of the vessels now, or null for Classic. */
  get specimen(): Specimen | null { return this.at; }

  private tubularOfClassic(id: string): number[] {
    let t = this.tubular.get(id);
    if (!t) {
      t = tubularOf(NETWORK_BY_ID.get(id)!, slicesFor(id));   // (counted on the 2D courses whatever is set: shape.ts tubularOf)
      this.tubular.set(id, t);
    }
    return t;
  }

  /** Sets every vessel's course for `specimen` from the artist's file (`courses`), or back to the 2D courses (`courses` null). Returns the ids that changed shape. */
  apply(courses: AtlasCourses | null, specimen: Specimen): string[] {
    const changed: string[] = [];
    const drawn = (id: string) => NETWORK_BY_ID.has(id);
    for (const v of NETWORK) {
      const obj = this.object(v.id);
      if (!obj) continue;
      const had = ATLAS_COURSE.get(v.id), want = courses ? courses.courseOf(v.id, specimen, v.radius, drawn) : null;
      if (!want && !had) continue;
      const tub = this.tubularOfClassic(v.id);
      if (want) {
        if (!this.pts0.has(v.id)) this.pts0.set(v.id, v.pts);
        ATLAS_COURSE.set(v.id, want); v.pts = want.pts;
      } else {
        ATLAS_COURSE.delete(v.id);
        const p0 = this.pts0.get(v.id);
        if (p0) { v.pts = p0; this.pts0.delete(v.id); }
      }
      const built = buildTubes(coursesOf(v, REST), tub, v.radius);
      const circ = COURSES.get(v.id);
      if (circ) attachRuns(built.geometry, built.runs, circ, v.radius);
      obj.reshape(built.geometry, built.length);
      if (obj.edge) obj.edge.length = built.length;
      built.geometry.dispose();
      changed.push(v.id);
    }
    this.at = courses ? specimen : null;
    return changed;
  }
}
