// The list of every shader source in the app, by file, and the programs they make. tests/glsl-compile.test.ts compiles them all in glslang (node, no browser); the ?gl page
// (gl-check.tsx) compiles them on the device. A file that holds GLSL and is not in GL_FILES fails the test: add it here, with how its programs are found.
import type { Object3D } from 'three';
import { type Program, collectMaterials, lateMaterialProgram, rawProgram, templateConstants } from './gl-programs.ts';
import { INK_FS, INK_VS, TOON_FS, TOON_VS } from '../scene/materials/shaders.ts';
import { VESSEL_FS, VESSEL_VS } from '../scene/vessels/shaders.ts';
import { DOT_FS, DOT_VS, PLATE_FS, PLATE_VS } from '../scene/circuit/map-layer.ts';
import { SINUSOID_FS, SINUSOID_PFS, SINUSOID_PVS, SINUSOID_VS } from '../scene/sinusoid/gl.copied.ts';
import { ORGAN_FS, ORGAN_INK_VS, ORGAN_VS } from '../scene/organs/organ-shader.ts';
import { patchedShaders } from '../scene/organs/organ-art.ts';
import { SINUSOID_PFS, SINUSOID_PVS, SINUSOID_VS } from '../scene/sinusoid/gl.copied.ts';
import { SINUSOID_CEL_FS } from '../scene/sinusoid/view.ts';
import { ORGAN_FS, ORGAN_VS } from '../scene/organs/organ-shader.ts';
import { RES_FS, RES_VS } from '../scene/circuit/resistors.ts';
import { DYE_FS, DYE_VS } from '../scene/disease/dye.ts';
import { CHART_FS, CHART_VS } from '../ui/charts/gl.ts';
import { SYNTH_FS, SYNTH_VS } from '../ui/tests/copied/doppler-synth.copied.js';
import { LOBULE_INK_FS, LOBULE_INK_VS, LOBULE_TOON_FS, LOBULE_TOON_VS } from '../scene/lobule/shading.ts';
import { SPECTRUM_FS, SPECTRUM_VS } from '../ui/tests/doppler/spectrum-gl.ts';
import { LOBULE_PLATE_FS, LOBULE_PLATE_VS } from '../scene/lobule/plate.ts';
import { LOBULE_ZONES_FS, LOBULE_ZONES_VS } from '../scene/lobule/zones.ts';
import { LOBULE_FIELD_FS, LOBULE_FIELD_VS } from '../scene/lobule/field.ts';
import { AA_FS, AA_VS } from '../scene/post-aa.ts';
import { DOF_GATHER_FS, DOF_MIX_FS, DOF_VS } from '../scene/post-dof.ts';
import { CELLS_FS, CELLS_VS } from '../scene/blood/cells/shader.ts';

/** Where the app's GLSL lives (a path under src/), and how its programs reach the check. A new file with a shader goes here, or the test fails. */
export const GL_FILES: Record<string, string> = {
  'scene/materials/shaders.ts': 'cel toon and ink (every organ, lobule and sinusoid part, the devices): found on the scene graph',
  'scene/vessels/shaders.ts': 'the vessel, with its veil (VEIL define): found on the scene graph',
  'scene/sinusoid/gl.copied.ts': 'the sinusoid (2D\'s shader, copied): RawShaderMaterials found on the scene graph',
  'scene/sinusoid/view.ts': 'where the sinusoid\'s RawShaderMaterials are made (version moved to glslVersion): found on the scene graph',
  'scene/organs/organ-art.ts': 'the organ wash wrapped for the organs\' art and the esophagus\'s fade (made when the art file is in): registered by name',
  'scene/organs/organ-shader.ts': 'the organ wash (WP1): registered by name until the scene wears it, then also found on the scene graph',
  'scene/circuit/shader.ts': 'the Circuit morph, spliced into the vessel shader: part of the vessel program',
  'scene/circuit/map-layer.ts': 'the Circuit plate and dots: found on the scene graph',
  'scene/circuit/resistors.ts': 'the Circuit resistor ribbons (made when the Circuit opens): registered by name',
  'scene/disease/dye.ts': 'the dye overlay (made when a bolus is given): registered by name',
  'scene/devices/device-object.ts': 'a device wears the toon shader with an alpha: found on the scene graph',
  'scene/lobule/shading.ts': 'the lobule\'s vessels: the toon and ink shaders rewritten for 2D\'s three tones, line and discs: found on the scene graph',
  'scene/lobule/plate.ts': 'the lobule\'s tissue plate (2D\'s painter on a canvas texture): found on the scene graph',
  'scene/lobule/zones.ts': 'the lobule\'s Zones layer: found on the scene graph',
  'scene/lobule/field.ts': 'the neighbouring lobules out of focus: found on the scene graph',
  'scene/blood/cells/shader.ts': 'the blood-cell particles (Settings > Figure depth; built when first switched on): registered by name, and found on the scene graph once they are in it',
  'scene/post-aa.ts': 'the anti-aliasing pass over the whole figure (FXAA on a full-screen quad, outside the scene graph): registered by name',
  'scene/post-dof.ts': 'the depth of field of the dive (desktop only: a half-size gather and a full-size blend on a full-screen quad, outside the scene graph): registered by name',
  'ui/charts/gl.ts': 'the charts\' shared drawer: registered by name',
  'ui/tests/copied/doppler-synth.copied.js': 'the Doppler spectrum: registered by name',
  'ui/tests/doppler/spectrum-gl.ts': 'the Doppler spectrum on the chart drawer (2D\'s line shader and display pass joined, with the grain): registered by name',
  'ui/tests/doppler/copied/doppler-gl.copied.js': 'the Doppler trace\'s display pass (the noise floor, the wall filter), joined with the line shader by spectrum-gl.ts: registered by name',
  'ui/tests/fibro/copied/fibro-gl.copied.js': 'the FibroScan map: its private templates are read from the file\'s text',
};

/** Source text → name, so a program found on the scene graph is called what it is. */
export function namedSources(): Map<string, string> {
  const bare = (s: string) => s.replace(/^#version 300 es\n/, '');   // (the sinusoid view makes its materials without the version line)
  return new Map<string, string>([
    [bare(SINUSOID_VS), 'sinusoid'], [bare(SINUSOID_CEL_FS), 'sinusoid'], [bare(SINUSOID_PVS), 'sinusoid particles'], [bare(SINUSOID_PFS), 'sinusoid particles'],
    [VESSEL_VS, 'vessel'], [VESSEL_FS, 'vessel'], [TOON_VS, 'toon'], [TOON_FS, 'toon'], [INK_VS, 'ink'], [INK_FS, 'ink'], [LOBULE_TOON_VS, 'lobule toon'], [LOBULE_TOON_FS, 'lobule toon'], [LOBULE_INK_VS, 'lobule ink'], [LOBULE_INK_FS, 'lobule ink'],
    [ORGAN_VS, 'organ wash'], [ORGAN_FS, 'organ wash'], [DYE_VS, 'dye overlay'], [DYE_FS, 'dye overlay'], [RES_VS, 'circuit resistors'], [RES_FS, 'circuit resistors'], [PLATE_VS, 'circuit plate'], [PLATE_FS, 'circuit plate'], [LOBULE_PLATE_VS, 'lobule plate'], [LOBULE_PLATE_FS, 'lobule plate'], [LOBULE_ZONES_VS, 'lobule zones'], [LOBULE_ZONES_FS, 'lobule zones'], [LOBULE_FIELD_VS, 'lobule field'], [LOBULE_FIELD_FS, 'lobule field'], [DOT_VS, 'circuit dots'], [DOT_FS, 'circuit dots'], [DOF_GATHER_FS, 'post dof'], [DOF_MIX_FS, 'post dof mix'], [CELLS_VS, 'blood cells'], [CELLS_FS, 'blood cells'],
  ]);
}

/** The organ wash wrapped for the art (the heart's line: art only), the stomach (art, the esophagus's tone and fade; its fill has vertex paint) and the colon (art, the rectum's fade): fill and outline. */
function organArtPrograms(): Program[] {
  const eso = { poly: [775, -90, 799, -90, 813, 266, 792, 266], box: [775, -90, 38, 356] as [number, number, number, number], fade: [40, -40] as [number, number], seam: [226, 262] as [number, number] };
  const out: Program[] = [];
  for (const [name, o, defines] of [['art', { art: true, eso: null }, undefined], ['stomach', { art: true, eso }, { VERTEX_INK: '' }], ['colon', { art: true, eso: null, fade: true }, undefined]] as const) {
    const p = patchedShaders(ORGAN_VS, ORGAN_FS, ORGAN_INK_VS, INK_FS, o);
    out.push(lateMaterialProgram(`organ wash + ${name}`, p.vs, p.fs, defines));
    if (name !== 'art') out.push(lateMaterialProgram(`organ outline + ${name}`, p.inkVs, p.inkFs));
  }
  return out;
}

/** The programs the scene graph does not hold until something happens (a Circuit, a dye bolus) and the ones outside the scene (charts, Doppler, FibroScan). */
export function rawPrograms(fibroText: string): Program[] {
  const fibro = templateConstants(fibroText);
  const out = [
    lateMaterialProgram('circuit resistors', RES_VS, RES_FS),
    lateMaterialProgram('dye overlay', DYE_VS, DYE_FS),
    lateMaterialProgram('organ wash', ORGAN_VS, ORGAN_FS),
    lateMaterialProgram('blood cells', CELLS_VS, CELLS_FS),
    lateMaterialProgram('post aa', AA_VS, AA_FS),
    lateMaterialProgram('post dof', DOF_VS, DOF_GATHER_FS),
    lateMaterialProgram('post dof mix', DOF_VS, DOF_MIX_FS),
    ...organArtPrograms(),
    rawProgram('charts', CHART_VS, CHART_FS),
    rawProgram('doppler spectrum', SYNTH_VS, SYNTH_FS),
    rawProgram('doppler spectrum (chart)', SPECTRUM_VS, SPECTRUM_FS),
  ];
  if (fibro.VS && fibro.FS) out.push(rawProgram('fibroscan map', fibro.VS, fibro.FS));
  if (fibro.VS && fibro.SHOW_FS) out.push(rawProgram('fibroscan map (show)', fibro.VS, fibro.SHOW_FS));
  return out;
}

/** Every program: the scene graph's, then the ones registered by hand. */
export function allPrograms(root: Object3D, fibroText: string): Program[] {
  const found = collectMaterials(root, namedSources());
  const have = new Set(found.map((p) => p.vertexGlsl + p.fragmentGlsl));
  return [...found, ...rawPrograms(fibroText).filter((p) => !have.has(p.vertexGlsl + p.fragmentGlsl))];
}
