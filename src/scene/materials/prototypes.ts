// Program stand-ins (L3, 21 Nov): one hidden one-triangle object for each material recipe the scene graph does not hold at boot, so the warm-up (Stage, before the first frame) compiles every program the
// figure can ever ask for under the splash, and nothing compiles after the cover has lifted. three.js shares one program between materials with the same shader text, defines and flags
// (materials/program-key.ts), so a stand-in that wears the same shaders and the same flags as the real material compiles the real one's program. Every stand-in takes its shaders from the module that
// makes the real material and its flags from a constant that module exports and uses itself (RESISTOR_FLAGS, STREAK_FLAGS, JET_INK_FLAGS, HALO_FLAGS), or is the real class (the clot), so a change to
// either side reaches both. tests/program-warm.test.ts holds the rest: every program the scene can reach once fully built is either on the boot graph, a stand-in, or named there as not compiled here.
//
// The micro views are not stand-ins: the scene constructs them under the splash with no geometry (scene.ts constructMicro), which makes every one of their materials the real ones.
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, Points, ShaderMaterial, Vector3 } from 'three';
import type { Material } from 'three';
import type { CelObject, CelShared } from './cel.ts';
import { CELLS_FS, CELLS_VS } from '../blood/cells/shader.ts';
import { STREAK_FLAGS } from '../blood/cells/cells.ts';
import { RES_FS, RES_VS, RESISTOR_FLAGS } from '../circuit/resistors.ts';
import { JET_INK_FLAGS, JET_INK_FS, JET_INK_VS } from '../disease/bleed.ts';
import { HALO_FLAGS } from '../highlight.ts';
import { ORGAN_MASK_FLAGS, ORGAN_MASK_FS, ORGAN_MASK_VS } from '../organs/glow-mask.ts';

/** One triangle with the attributes any of these shaders declares (a program's compile reads none of them). */
const triangle = (extra: readonly [string, number][] = []): BufferGeometry => {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  g.setAttribute('normal', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  for (const [name, size] of extra) g.setAttribute(name, new Float32BufferAttribute(new Array<number>(3 * size).fill(0), size));
  return g;
};

/** The recipes, each as a hidden object: its name says which material it stands in for. */
export function programPrototypes(shared: CelShared): Group {
  const root = new Group();
  root.name = 'program-prototypes';
  root.visible = false;
  const add = (name: string, geometry: BufferGeometry, material: Material, points = false): void => {
    const o = points ? new Points(geometry, material) : new Mesh(geometry, material);
    o.name = `prototype/${name}`; o.frustumCulled = false;
    root.add(o);
  };
  // the Circuit's resistor ribbons (made when the Circuit first opens)
  add('circuit resistors', triangle(), new ShaderMaterial({ name: 'circuit resistors', vertexShader: RES_VS, fragmentShader: RES_FS, ...RESISTOR_FLAGS, uniforms: {} }));
  // the blood streaks (Settings > Figure depth, made when first switched on)
  add('blood streaks', triangle([['aB', 4]]), new ShaderMaterial({ name: 'blood streaks', vertexShader: CELLS_VS, fragmentShader: CELLS_FS, ...STREAK_FLAGS, uniforms: {} }), true);
  // an organ's glow mask (made when an organ is first lit: organs/glow-mask.ts)
  add('organ glow mask', triangle(), new ShaderMaterial({ name: 'organ glow mask', vertexShader: ORGAN_MASK_VS, fragmentShader: ORGAN_MASK_FS, ...ORGAN_MASK_FLAGS, uniforms: {} }));
  // the bleed jet's ink (made when a bleed first shows; its fill is the device toon the scene holds)
  add('bleed jet ink', triangle([['tang', 3], ['ik', 1]]), new ShaderMaterial({ name: 'bleed jet ink', vertexShader: JET_INK_VS, fragmentShader: JET_INK_FS, ...JET_INK_FLAGS, uniforms: {} }));
  return root;
}

/** The spleen's normal-range ring (made when it is first shown): the organ's own ink shaders, blended and drawn on the back faces. The organs arrive after their
 *  geometry and art files do, so these are added to the stand-ins then (scene.ts organsBuilt), and the warm-up that waits for the organs compiles them with the organs' own programs. */
export function addOrganHalos(root: Group, organs: readonly CelObject[]): void {
  const seen = new Set(root.children.filter((c) => c.name.startsWith('prototype/organ halo')).map((c) => c.userData.key as string));
  for (const o of organs) {
    const key = o.ink.vertexShader + '\u0000' + o.ink.fragmentShader;   // (the highlight's shell takes the ink's shaders and none of its defines: scene/highlight.ts)
    if (seen.has(key)) continue;
    seen.add(key);
    const m = new Mesh(triangle(), new ShaderMaterial({ name: 'organ halo', vertexShader: o.ink.vertexShader, fragmentShader: o.ink.fragmentShader, ...HALO_FLAGS, uniforms: {} }));
    m.name = `prototype/organ halo ${o.tone}`; m.frustumCulled = false; m.userData.key = key;
    root.add(m);
  }
}
