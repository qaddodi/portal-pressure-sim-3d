import type { Vec3 } from '../anatomy/vessels.ts';

/** The artist's course for one vessel in one specimen, ready for the live builders (courses.ts makes it from public/atlas/courses.json). */
export interface AtlasCourse {
  /** the centreline in the app's own frame, flow order (the artist's topology direction) */
  pts: Vec3[];
  /** the radius along it as a share of the vessel's own `radius` (network.ts): flat [arc-length share, share, ...] (tubes.ts Course.profile) */
  profile: number[];
  /** the ends that carry on into another tube at a shared ring (no round cap there) */
  joined: [boolean, boolean];
}

/** The three specimens the artist drew: the organs and the vessels each have a healthy, a decompensated cirrhosis and a Budd–Chiari form. */
export type Specimen = 'healthy' | 'cirr-decomp' | 'budd-chiari';
