// The ONE loader of every program the app draws with, shared by the three shader tests (glsl-compile, no-derivative-after-discard, shader-bindings). Audit 2 / Plan 41: the node checks used to build only
// `new CelScene().scene`, which holds 55 of the 77 programs a phone compiles, because the organs are async (`setOrganData` + `organsBuilt`), the micro views are lazy (`constructMicro()`), and the late classes
// (the passes, the glow, the resistors, the ascites, the organ glow mask) are made when something first happens. Here all of them are made, so every program is read and every real material is there to check.
// It takes about 45 seconds in node (the organs and micro build); the tests that import it say so by name, so pre-push runs them only when a shader or material file changed.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ShaderMaterial } from 'three';
import { organsReady, setOrganData } from '../src/scene/organs/meshes.ts';
import { organMask } from '../src/scene/organs/glow-mask.ts';
import { CelScene } from '../src/scene/scene.ts';
import { PostAA } from '../src/scene/post-aa.ts';
import { PostDof } from '../src/scene/post-dof.ts';
import { GlowFx } from '../src/scene/glow-fx.ts';
import { ResistorLayer } from '../src/scene/circuit/resistors.ts';
import { BleedLayer } from '../src/scene/disease/bleed.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { isStandIn } from '../src/scene/materials/program-key.ts';
import { partUniformValues } from '../src/scene/vessels/debug-view.ts';
import { AscitesLayer } from '../src/scene/disease/ascites.ts';
import { GL_FILES, allPrograms } from '../src/debug/gl-registry.ts';
import { type Program } from '../src/debug/gl-programs.ts';
import { glslFiles } from '../scripts/gl-scan.mjs';

export const FIBRO = resolve('src', 'ui', 'tests', 'fibro', 'copied', 'fibro-gl.copied.js');

export interface Loaded { programs: Program[]; scene: CelScene; auto: Record<string, Record<string, unknown>>; fibro: string; donors: ShaderMaterial[] }

type Priv = Record<string, unknown>;
const mats = (o: unknown, ...keys: string[]): ShaderMaterial[] => keys.flatMap((k) => { const v = (o as Priv)[k]; return (Array.isArray(v) ? v : [v]) as ShaderMaterial[]; }).filter(Boolean);

/** The real materials of the late classes, built the way the app builds them (no renderer: a constructor makes its materials and touches no GL). */
function lateMaterials(scene: CelScene): ShaderMaterial[] {
  const dof = new PostDof(() => false, null);
  const out: ShaderMaterial[] = [new PostAA('fxaa', dof).material, ...mats(dof, 'gather', 'mix', 'copy'), ...new GlowFx().materials, ...new GlowFx(undefined, true).materials];
  out.push(...mats(new AscitesLayer(), 'mats'));
  const res = new ResistorLayer();
  out.push((res as unknown as { material(): ShaderMaterial }).material());
  const bleed = new BleedLayer(createShared());
  (bleed as unknown as { ensure(): void }).ensure();
  out.push((bleed as unknown as { inkMat: ShaderMaterial }).inkMat);
  const organ = (scene as unknown as { disease: { organs: { objects: Parameters<typeof organMask>[1][] } } }).disease.organs.objects[0];
  if (organ) out.push((organMask('liver', organ).material as ShaderMaterial));
  return out;
}

/** Every material of the scene graph (hidden ones too), stand-ins left out. */
function sceneMaterials(scene: CelScene): ShaderMaterial[] {
  const out: ShaderMaterial[] = [];
  scene.scene.traverse((o) => { if (isStandIn(o)) return; const m = (o as { material?: unknown }).material; for (const x of Array.isArray(m) ? m : m ? [m] : []) if ((x as ShaderMaterial).isShaderMaterial) out.push(x as ShaderMaterial); });
  return out;
}

export async function loadAllPrograms(): Promise<Loaded> {
  const b = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const scene = new CelScene();
  scene.resize(900, 700);
  scene.constructMicro();
  await organsReady; await scene.organsBuilt;
  scene.update(0); scene.update(1000);
  const auto: Record<string, Record<string, unknown>> = {};
  for (const f of (glslFiles() as string[]).filter((x) => !(x in GL_FILES))) auto[f] = (await import(pathToFileURL(resolve('src', f)).href)) as Record<string, unknown>;
  const fibro = readFileSync(FIBRO, 'utf8');
  const programs = allPrograms(scene.scene, fibro, auto);
  // a registry program has text and no material (`lateMaterialProgram`): it takes the real material that carries exactly that source (the same program, so the same uniforms), from the scene or the late classes
  const donors = [...sceneMaterials(scene), ...lateMaterials(scene)];
  for (const p of programs) {
    if (p.material || p.kind !== 'three' || p.standIn) continue;
    const m = donors.find((d) => d.vertexShader === p.vertex && d.fragmentShader === p.fragment);
    if (!m) continue;
    // (a VDBG program is the inspector's: a page without ?inspect gives its materials no dbg* uniforms, and the panel's own are the ones the inspector's materials carry)
    if (/^#define VDBG\b/m.test(p.vertexGlsl)) { const v = m.clone(); v.uniforms = { ...v.uniforms, ...partUniformValues('tube'), ...partUniformValues('skin') }; p.material = v; } else p.material = m;
  }
  return { programs, scene, auto, fibro, donors };
}
