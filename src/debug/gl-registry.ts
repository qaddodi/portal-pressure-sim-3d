// The list of every shader source in the app, by file, and the programs they make. tests/glsl-compile.test.ts compiles them all in glslang (node, no browser); the ?gl page
// (gl-check.tsx) compiles them on the device. GL_FILES is the HAND-MADE list of the files that existed when it was made and is CLOSED: a new file that holds GLSL is found by scanning (scripts/gl-scan.mjs)
// and its programs are read from the module (gl-auto.ts: `GL_PROGRAMS`, `_VS`/`_FS` pairs, or `GL_ON_SCENE_GRAPH`), so nothing is added here.
import { MICRO_FS, MICRO_INK_FS, MICRO_INK_VS, MICRO_VS } from '../scene/micro3d/cel3d.ts';
import type { Object3D } from 'three';
import { autoPrograms } from './gl-auto.ts';
import { type Program, assemble, collectMaterials, lateMaterialProgram, rawProgram, templateConstants } from './gl-programs.ts';
import { INK_FS, INK_VS, TOON_FS, TOON_VS } from '../scene/materials/shaders.ts';
import { VESSEL_FS, VESSEL_VS } from '../scene/vessels/shaders.ts';
import { SKIN_FS, SKIN_VS } from '../scene/vessels/skin/shaders.ts';
import { DOT_FS, DOT_VS, PLATE_FS, PLATE_VS } from '../scene/circuit/map-layer.ts';
import { ORGAN_FS, ORGAN_INK_VS, ORGAN_VS } from '../scene/organs/organ-shader.ts';
import { patchedShaders } from '../scene/organs/organ-art.ts';
import { RES_FS, RES_VS } from '../scene/circuit/resistors.ts';
import { DYE_FS, DYE_VS } from '../scene/disease/dye.ts';
import { JET_INK_FS, JET_INK_VS } from '../scene/disease/bleed.ts';
import { CHART_FS, CHART_VS } from '../ui/charts/gl.ts';
import { SYNTH_FS, SYNTH_VS } from '../ui/tests/copied/doppler-synth.copied.js';
import { SPECTRUM_FS, SPECTRUM_VS } from '../ui/tests/doppler/spectrum-gl.ts';
import { ENDO_VS } from '../ui/tests/copied/endo-shader.copied.js';
import { endoShaderSource } from '../ui/tests/endo/endo-under.ts';
import { LOBULE_PLATE_FS, LOBULE_PLATE_VS } from '../scene/lobule/plate.ts';
import { LOBULE_FIELD_FS, LOBULE_FIELD_VS } from '../scene/lobule/field.ts';
import { AA_FS, AA_VS } from '../scene/post-aa.ts';
import { DOF_COPY_FS, DOF_GATHER_FS, DOF_MIX_FS, DOF_VS } from '../scene/post-dof.ts';
import { CELLS_FS, CELLS_VS } from '../scene/blood/cells/shader.ts';
import { createShared } from '../scene/materials/cel.ts';
import { BufferGeometry } from 'three';

/** Where the app's GLSL lived when this list was made (a path under src/), and how its programs reach the check. CLOSED: do not add to it, a new shader file is found by gl-auto.ts. */
export const GL_FILES: Record<string, string> = {
  'scene/materials/shaders.ts': 'cel toon and ink (every organ, lobule and sinusoid part, the devices): found on the scene graph',
  'scene/blood/chevron-glsl.ts': 'the one chevron (the Anatomy\'s flow head), spliced into the vessel and the 3D lobule and sinusoid programs: part of those',
  'scene/blood/streak-glsl.ts': 'the one streak (lanes, comets), spliced into the blood streaks, the 3D lobule and the 3D sinusoid programs: part of those',
  'scene/blood/dust-glsl.ts': 'the dust (the Dust Lab\'s particles, drawn by the vessel\'s own fragment shader), spliced into the vessel program: part of that',
  'scene/cel-glsl.ts': 'the cel style\'s shared tube GLSL (two tones, the world light), spliced into the vessel, toon and lobule programs: part of those',
  'scene/vessels/shaders.ts': 'the vessel, with its veil (VEIL define): found on the scene graph',
  'scene/vessels/skin/shaders.ts': 'the junction skin (one merged mesh where 3 or 4 vessels meet; behind ?joins=mesh): registered by name until the scene wears it, then also found on the scene graph',
  'scene/sinusoid/view.ts': 'where the sinusoid\'s RawShaderMaterials are made (version moved to glslVersion): found on the scene graph',
  'scene/organs/organ-shader.ts': 'the organ wash (WP1): registered by name until the scene wears it, then also found on the scene graph',
  'scene/circuit/shader.ts': 'the Circuit morph, spliced into the vessel shader: part of the vessel program',
  'scene/circuit/map-layer.ts': 'the Circuit plate and dots: found on the scene graph',
  'scene/circuit/resistors.ts': 'the Circuit resistor ribbons (made when the Circuit opens): registered by name',
  'scene/disease/bleed.ts': 'the bleed jet\'s ink (a hull whose line thins toward the tip; made when a bleed first shows): registered by name',
  'scene/disease/dye.ts': 'the dye overlay (made when a bolus is given): registered by name',
  'scene/shunt-guide.ts': 'the shunt\'s dashed guide (a quad on the vessels\' pass, in the body group): found on the scene graph',
  'scene/devices/device-object.ts': 'a device wears the toon shader with an alpha: found on the scene graph',
  'scene/lobule/plate.ts': 'the lobule\'s tissue plate under the 3D cells (2D\'s painter on a canvas texture): found on the scene graph',
  'scene/lobule/field.ts': 'the neighbouring lobules out of focus: found on the scene graph',
  'scene/lobule/one-fade.ts': 'the one-line GLSL patch that scales a stock material\'s alpha by the lobule\'s fade (the tap halo\'s MeshBasicMaterial): the halo\'s program is found on the scene graph',
  'scene/micro3d/cel3d.ts': 'the true-3D lobule and sinusoid (Settings > Figure depth): the cel toon and its ink hull, plain and instanced: found on the scene graph',
  'scene/organs/organ-art.ts': 'the organ wash wrapped for the organs\' art and the esophagus\'s fade (made when the art file is in): registered by name',
  'scene/blood/cells/shader.ts': 'the blood-cell particles (Settings > Figure depth; built when first switched on): registered by name, and found on the scene graph once they are in it',
  'scene/post-aa.ts': 'the anti-aliasing pass over the whole figure (FXAA on a full-screen quad, outside the scene graph): registered by name',
  'scene/post-dof.ts': 'the depth of field of the dive (desktop only: a half-size gather and a full-size blend on a full-screen quad, outside the scene graph): registered by name',
  'ui/charts/gl.ts': 'the charts\' shared drawer: registered by name',
  'ui/tests/copied/doppler-synth.copied.js': 'the Doppler spectrum: registered by name',
  'ui/tests/copied/endo-shader.copied.js': 'the scope\'s field (2D\'s per-pixel shader), shaded under the Endoscopy chart by endo-under.ts: registered by name',
  'ui/tests/endo/endo-under.ts': 'the scope\'s field on the chart drawer (the shader\'s colours written in): registered by name',
  'ui/tests/doppler/spectrum-gl.ts': 'the Doppler spectrum on the chart drawer (2D\'s line shader and display pass joined, with the grain): registered by name',
  'ui/tests/doppler/copied/doppler-gl.copied.js': 'the Doppler trace\'s display pass (the noise floor, the wall filter), joined with the line shader by spectrum-gl.ts: registered by name',
  'ui/tests/fibro/copied/fibro-gl.copied.js': 'the FibroScan map: its private templates are read from the file\'s text',
};

/** Source text → name, so a program found on the scene graph is called what it is. */
export function namedSources(): Map<string, string> {
  return new Map<string, string>([
    [VESSEL_VS, 'vessel'], [VESSEL_FS, 'vessel'], [SKIN_VS, 'skin'], [SKIN_FS, 'skin'], [TOON_VS, 'toon'], [TOON_FS, 'toon'], [INK_VS, 'ink'], [INK_FS, 'ink'],
    [ORGAN_VS, 'organ wash'], [ORGAN_FS, 'organ wash'], [DYE_VS, 'dye overlay'], [DYE_FS, 'dye overlay'], [JET_INK_VS, 'bleed jet ink'], [JET_INK_FS, 'bleed jet ink'], [RES_VS, 'circuit resistors'], [RES_FS, 'circuit resistors'], [PLATE_VS, 'circuit plate'], [PLATE_FS, 'circuit plate'], [LOBULE_PLATE_VS, 'lobule plate'], [LOBULE_PLATE_FS, 'lobule plate'], [LOBULE_FIELD_VS, 'lobule field'], [LOBULE_FIELD_FS, 'lobule field'], [DOT_VS, 'circuit dots'], [DOT_FS, 'circuit dots'], [DOF_GATHER_FS, 'post dof'], [DOF_MIX_FS, 'post dof mix'], [DOF_COPY_FS, 'post dof copy'], [CELLS_VS, 'blood cells'], [CELLS_FS, 'blood cells'], [MICRO_VS, 'micro3d toon'], [MICRO_FS, 'micro3d toon'], [MICRO_INK_VS, 'micro3d ink'], [MICRO_INK_FS, 'micro3d ink'],
  ]);
}

/** The programs the scene graph does not hold until something happens (a Circuit, a dye bolus) and the ones outside the scene (charts, Doppler, FibroScan). */
/** The organ wash wrapped for the art (the heart's line: art only), the stomach (art, the esophagus's tone and fade; its pool is per pixel) and the colon (art, the rectum's fade): fill and outline. */
function organArtPrograms(): Program[] {
  const eso = { poly: [775, -90, 799, -90, 813, 266, 792, 266], box: [775, -90, 38, 356] as [number, number, number, number], fade: [40, -40] as [number, number], seam: [226, 262] as [number, number] };
  const out: Program[] = [];
  for (const [name, o, defines] of [['art', { art: true, eso: null }, undefined], ['stomach', { art: true, eso }, undefined], ['colon', { art: true, eso: null, fade: true }, undefined]] as const) {
    const p = patchedShaders(ORGAN_VS, ORGAN_FS, ORGAN_INK_VS, INK_FS, o);
    out.push(lateMaterialProgram(`organ wash + ${name}`, p.vs, p.fs, defines));
    if (name !== 'art') out.push(lateMaterialProgram(`organ outline + ${name}`, p.inkVs, p.inkFs));
  }
  return out;
}

export function rawPrograms(fibroText: string): Program[] {
  const fibro = templateConstants(fibroText);
  const out = [
    lateMaterialProgram('circuit resistors', RES_VS, RES_FS),
    lateMaterialProgram('dye overlay', DYE_VS, DYE_FS),
    lateMaterialProgram('skin', SKIN_VS, SKIN_FS),
    lateMaterialProgram('skin (solid copy)', SKIN_VS, SKIN_FS, { SKIN_COPY: 1 }),
    lateMaterialProgram('skin (veil copy)', SKIN_VS, SKIN_FS, { SKIN_COPY: 2 }),
    // the inspector's programs (?inspect: scene/vessels/debug-view.ts): the same sources with the VDBG hooks, and the skin's three build-time diagnostics, so every variant a panel switch can reach has been through the compile check
    lateMaterialProgram('vessel (inspector)', VESSEL_VS, VESSEL_FS, { VDBG: 1 }),
    lateMaterialProgram('skin (inspector)', SKIN_VS, SKIN_FS, { SKIN_COPY: 0, VDBG: 1, SKIN_DEBUG: 1 }),
    lateMaterialProgram('skin (inspector, no marks)', SKIN_VS, SKIN_FS, { SKIN_COPY: 0, VDBG: 1, SKIN_NOMARKS: 1 }),
    lateMaterialProgram('skin (inspector, no ink)', SKIN_VS, SKIN_FS, { SKIN_COPY: 0, VDBG: 1, SKIN_NOINK: 1 }),   // (spec 10.4: one source, three programs: the front copy is the one above)
    lateMaterialProgram('organ wash', ORGAN_VS, ORGAN_FS),
    ...organArtPrograms(),
    lateMaterialProgram('blood cells', CELLS_VS, CELLS_FS),
    lateMaterialProgram('post aa', AA_VS, AA_FS),
    lateMaterialProgram('post dof', DOF_VS, DOF_GATHER_FS),
    lateMaterialProgram('post dof copy', DOF_VS, DOF_COPY_FS),
    lateMaterialProgram('post dof mix', DOF_VS, DOF_MIX_FS),
    rawProgram('charts', CHART_VS, CHART_FS),
    rawProgram('doppler spectrum', SYNTH_VS, SYNTH_FS),
    rawProgram('doppler spectrum (chart)', SPECTRUM_VS, SPECTRUM_FS),
    rawProgram('endoscopic field', ENDO_VS, endoShaderSource()),
  ];
  if (fibro.VS && fibro.FS) out.push(rawProgram('fibroscan map', fibro.VS, fibro.FS));
  if (fibro.VS && fibro.SHOW_FS) out.push(rawProgram('fibroscan map (show)', fibro.VS, fibro.SHOW_FS));
  return out;
}

/** Every program: the scene graph's, then the ones registered by hand. */
export function allPrograms(root: Object3D, fibroText: string, auto: Readonly<Record<string, Record<string, unknown>>> = {}): Program[] {
  const found = collectMaterials(root, namedSources());
  const have = new Set(found.map((p) => p.vertexGlsl + p.fragmentGlsl));
  const raw = rawPrograms(fibroText).filter((p) => !have.has(p.vertexGlsl + p.fragmentGlsl));
  for (const p of raw) have.add(p.vertexGlsl + p.fragmentGlsl);
  // the files found by scanning (gl-auto.ts): a program the scene graph or the hand list already holds is not compiled twice
  const fresh = Object.fromEntries(Object.entries(auto).filter(([f]) => !(f in GL_FILES)));   // (the hand list is closed: its files are found as they always were)
  const more = autoPrograms(fresh).filter((p) => !have.has(p.vertexGlsl + p.fragmentGlsl));
  return [...found, ...raw, ...more];
}
