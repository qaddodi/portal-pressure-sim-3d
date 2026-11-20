#!/usr/bin/env node
// Settings > Figure depth > Atlas art: the artist's vessel centrelines and radii, cut out of his vessel GLBs into one small JSON (public/atlas/courses.json), so the app
// never loads the vessel meshes: the live vessel builders (tubes.ts) rebuild the tubes from these courses and keep pressure colour, chevrons, morph, catheters and the Circuit.
//
//   node scripts/gen-atlas-courses.mjs <package dir>        (the artist's package: models/vessels-*.glb and models/atlas-inventory.json; kept at /mnt/project-files/rebuild-3d/atlas-art/)
//
// Output (all numbers in scene units, the app's own frame: X = (x - 700) / 300, Y = -(y - 556) / 300, +Z toward the viewer; nothing is converted):
//   { v: 1, specimens: { healthy | 'cirr-decomp' | 'budd-chiari': { courses: { <edge id>: { p: [x, y, z, ...], r: [radius per point], k: kind } }, rings: [[a, b, endOfA, startOfB], ...] },
//     optional: { courses } } }
// `rings` are the artist's shared ring pairs (inventory sharedRings: [edge, edge, end, end], end 1 = its last point, 0 = its first): the pairs of tubes that meet end to end.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('usage: gen-atlas-courses.mjs <the artist\'s package dir>'); process.exit(2); }
const out = fileURLToPath(new URL('../public/atlas/courses.json', import.meta.url));

/** The JSON chunk of a GLB. */
function glbJson(file) {
  const b = readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB`);
  let off = 12;
  while (off < b.length) {
    const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4);
    if (type === 0x4e4f534a) return JSON.parse(b.subarray(off + 8, off + 8 + len).toString('utf8'));
    off += 8 + len;
  }
  throw new Error(`${file}: no JSON chunk`);
}
const r5 = (x) => Math.round(x * 1e5) / 1e5;
function coursesOf(file) {
  const courses = {};
  for (const n of glbJson(file).nodes) {
    const e = n.extras;
    if (!e || !Array.isArray(e.centerline) || !Array.isArray(e.centerlineRadii)) continue;
    const id = e.structure ?? n.name;
    if (e.centerline.length !== e.centerlineRadii.length || e.centerline.length < 2) throw new Error(`${file}: ${id} has ${e.centerline.length} points and ${e.centerlineRadii.length} radii`);
    courses[id] = { p: e.centerline.flat().map(r5), r: e.centerlineRadii.map(r5), k: e.kind ?? '' };
  }
  return courses;
}

const inv = JSON.parse(readFileSync(join(dir, 'models', 'atlas-inventory.json'), 'utf8'));
const res = { v: 1, specimens: {} };
for (const s of ['healthy', 'cirr-decomp', 'budd-chiari']) {
  res.specimens[s] = { courses: coursesOf(join(dir, 'models', `vessels-${s}.glb`)), rings: inv[s].sharedRings };
}
res.specimens.optional = { courses: coursesOf(join(dir, 'models', 'vessels-optional.glb')), rings: [] };
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(res));
const n = Object.values(res.specimens).map((x) => Object.keys(x.courses).length);
console.log(`wrote ${out} (${(JSON.stringify(res).length / 1024).toFixed(0)} KB): ${n.join(', ')} courses`);
