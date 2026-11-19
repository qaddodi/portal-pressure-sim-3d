// Simple organs inflated from the 2D app's organ outlines (art/organs-simple/build.py). Shared frame:
// X=(x-700)/300, Y=-(y-556)/300, organs straddle z=0, every front face at z <= 0.26. The esophagus is part of 'stomach' (2D SEAM_D).
import { BufferGeometry, Float32BufferAttribute } from 'three';
import data from './organs-data.json';

type Raw = { p: number[]; i: number[] };
const make = (id: string) => () => {
  const r = (data as Record<string, Raw>)[id];
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(r.p, 3));
  g.setIndex(r.i);
  g.computeVertexNormals();
  return g;
};
export const ORGAN_MESHES: Record<string, () => BufferGeometry> = Object.fromEntries(
  ['heart', 'heart-ra', 'liver', 'spleen', 'stomach', 'kidney-l', 'duodenum', 'bowel', 'colon'].map((id) => [id, make(id)]),
);
