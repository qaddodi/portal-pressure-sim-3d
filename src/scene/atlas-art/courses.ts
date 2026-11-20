// The artist's vessel courses (public/atlas/courses.json, made by scripts/gen-atlas-courses.mjs from his vessel GLBs) as the live vessel builders take them: a centreline in the app's own
// frame and the radius along it. Pure data, no three.js: the tests read the file from disk.
import type { Vec3 } from '../anatomy/vessels.ts';
import type { AtlasCourse, Specimen } from './types.ts';

export interface CourseFile {
  v: 1;
  specimens: Record<string, { courses: Record<string, { p: number[]; r: number[]; k: string }>; rings: [string, string, number, number][] }>;
}

/** Which of the artist's files a vessel is read from for a specimen, in order. A vessel the specimen's own file lacks is the next one's: the collaterals exist only in the diseased files, the
 *  caudate vein only in Budd–Chiari's, the shunts only in the optional catalogue. */
export const SOURCE_ORDER: Record<Specimen, readonly string[]> = {
  healthy: ['healthy', 'cirr-decomp', 'budd-chiari', 'optional'],
  'cirr-decomp': ['cirr-decomp', 'budd-chiari', 'healthy', 'optional'],
  'budd-chiari': ['budd-chiari', 'cirr-decomp', 'healthy', 'optional'],
};

/** The surgical and transjugular shunts stay the 2D figure's: the stents and the procedure's catheter are built along them (devices/stent, procedures/route3d), and the artist's TIPS is a device mesh. */
export const KEEP_CLASSIC: ReadonlySet<string> = new Set(['TIPS', 'DIPS', 'S_PC', 'S_DSR', 'S_MC', 'REX']);

export class AtlasCourses {
  private readonly file: CourseFile;
  constructor(file: CourseFile) {
    this.file = file;
    if (file.v !== 1) throw new Error(`atlas courses: version ${file.v}`);
  }

  /** The ids the artist drew in any of his files. */
  ids(): Set<string> { const s = new Set<string>(); for (const sp of Object.values(this.file.specimens)) for (const id of Object.keys(sp.courses)) s.add(id); return s; }

  /** The artist's course of `id` for `specimen`, or null (he did not draw it, or it stays 2D's). `radius` is the vessel's own (network.ts), which the profile is a share of; `drawn` says which of
   *  the other vessels the app draws (a shared ring with one it does not draw leaves its end capped). */
  courseOf(id: string, specimen: Specimen, radius: number, drawn: (id: string) => boolean): AtlasCourse | null {
    if (KEEP_CLASSIC.has(id)) return null;
    for (const src of SOURCE_ORDER[specimen]) {
      const sp = this.file.specimens[src], c = sp?.courses[id];
      if (!sp || !c) continue;
      const n = c.r.length, pts: Vec3[] = [];
      for (let i = 0; i < n; i++) pts.push([c.p[3 * i]!, c.p[3 * i + 1]!, c.p[3 * i + 2]!]);
      const arc: number[] = [0];
      for (let i = 1; i < n; i++) arc.push(arc[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1], pts[i]![2] - pts[i - 1]![2]));
      const total = arc[n - 1]! || 1, profile: number[] = [];
      for (let i = 0; i < n; i++) profile.push(arc[i]! / total, c.r[i]! / radius);
      const joined: [boolean, boolean] = [false, false];
      for (const [a, b, ea, eb] of sp.rings) {
        if (a === id && drawn(b) && !KEEP_CLASSIC.has(b)) joined[ea ? 1 : 0] = true;
        if (b === id && drawn(a) && !KEEP_CLASSIC.has(a)) joined[eb ? 1 : 0] = true;
      }
      return { pts, profile, joined };
    }
    return null;
  }
}
