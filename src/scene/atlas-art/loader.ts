// The atlas art's files, fetched only when Atlas is chosen (Settings > Figure depth). Nothing here runs at boot: scene.ts asks for it from `AtlasArt.setEnabled(true)`.
//   courses.json   the artist's vessel centrelines and radii (146 KB; scripts/gen-atlas-courses.mjs)
//   atlas-grain.png the artist's 256 x 256 linear grain (50 KB)
//   organs-<form>.glb  the healthy file first (1.4 MB), the decompensated and Budd-Chiari files (1 MB each) only when a patient of that form is on the screen
// The service worker holds none of them (scripts/pwa.mjs): they are fetched from the network when asked for, and the browser's own cache keeps them between visits.
import { LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, Texture } from 'three';
import { AtlasCourses, type CourseFile } from './courses.ts';
import { type GlbMesh, parseGlb } from './glb.ts';
import type { Specimen } from './types.ts';

const env = (import.meta as { env?: { BASE_URL?: string } }).env;
const url = (name: string): string => `${env?.BASE_URL ?? '/'}${['atlas', name].join('/')}`;

async function get(name: string): Promise<Response> {
  const r = await fetch(url(name));
  if (!r.ok) throw new Error(`atlas art: ${name} ${r.status}`);
  return r;
}

let courses: Promise<AtlasCourses> | null = null;
/** The artist's vessel courses (once). */
export const loadCourses = (): Promise<AtlasCourses> => (courses ??= get('courses.json').then((r) => r.json()).then((j: CourseFile) => new AtlasCourses(j)).catch((e) => { courses = null; throw e; }));

let grain: Promise<Texture> | null = null;
/** The grain texture: linear data, repeat wrapping, mipmaps, linear filtering (the package's README). */
export const loadGrain = (): Promise<Texture> => (grain ??= get('atlas-grain.png').then((r) => r.blob()).then((b) => createImageBitmap(b, { imageOrientation: 'none' })).then((bmp) => {
  const t = new Texture(bmp);
  t.wrapS = t.wrapT = RepeatWrapping; t.minFilter = LinearMipmapLinearFilter; t.magFilter = LinearFilter; t.generateMipmaps = true; t.colorSpace = NoColorSpace; t.needsUpdate = true;
  return t;
}).catch((e) => { grain = null; throw e; }));

const organs = new Map<Specimen, Promise<GlbMesh[]>>();
/** One form's organ meshes (once each). */
export function loadOrgans(s: Specimen): Promise<GlbMesh[]> {
  let p = organs.get(s);
  if (!p) { p = get(`organs-${s}.glb`).then((r) => r.arrayBuffer()).then(parseGlb); p.catch(() => organs.delete(s)); organs.set(s, p); }
  return p;
}
