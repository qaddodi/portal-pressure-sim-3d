// What three.js keys a shader program on, written out (WebGLPrograms.getProgramCacheKey for a ShaderMaterial, as of three 0.187): two draws share a program exactly when this string is equal, so a program compiled
// for one is a program the other finds ready. Used by the warm-up's coverage test (tests/program-warm.test.ts) and by the `?perf` late-program row (the key names the recipe that compiled late). The output
// colour space is left out: it comes from the render target the warm-up binds (materials/warm.ts), not from the material.
import type { BufferGeometry, InstancedMesh, Material, Object3D, ShaderMaterial } from 'three';

type Drawn = Object3D & { material?: Material | Material[]; geometry?: BufferGeometry };

/** The program key of `material` as drawn by `object` (a mesh, an instanced mesh). */
export function programKey(object: Object3D, material: Material): string {
  const m = material as ShaderMaterial & { isRawShaderMaterial?: boolean; glslVersion?: string | null };
  const g = (object as Drawn).geometry;
  const colour = g?.getAttribute?.('color');
  const defines = Object.entries(m.defines ?? {}).map(([k, v]) => `${k}=${String(v)}`).join(';');
  const inst = object as InstancedMesh;
  const opaque = !m.transparent && m.blending === 1;   // (NormalBlending: the `opaque` parameter, a `#define OPAQUE`; a marked material blends through CustomBlending so it is constantly false: materials/warm.ts)
  const flags = [
    m.isRawShaderMaterial ? 'raw' : 'shader',
    m.glslVersion ?? '', m.precision ?? '',
    inst.isInstancedMesh ? 'inst' : '', inst.isInstancedMesh && inst.instanceColor ? 'instcol' : '',
    m.vertexColors ? 'vcol' : '', m.vertexColors && colour && colour.itemSize === 4 ? 'valpha' : '',
    m.side === 2 ? 'double' : '', m.side === 1 ? 'back' : '',
    (m as { flatShading?: boolean }).flatShading ? 'flat' : '', m.premultipliedAlpha ? 'premul' : '', opaque ? 'opaque' : '', m.alphaToCoverage ? 'a2c' : '', m.toneMapped ? 'tone' : '', m.dithering ? 'dither' : '',
  ].filter(Boolean).join(',');
  return `${m.vertexShader.length}:${hash(m.vertexShader)}|${m.fragmentShader.length}:${hash(m.fragmentShader)}|${defines}|${flags}`;
}

/** FNV-1a over the source: short, stable, and enough to tell two shaders of one length apart. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/** Every (program key, material name) a scene graph would compile: each mesh's material(s), hidden ones too (compileAsync walks `traverse`, not `traverseVisible`). */
export function programsOf(root: Object3D): Map<string, string> {
  const out = new Map<string, string>();
  root.traverse((o) => {
    const d = o as Drawn;
    if (!d.material) return;
    for (const m of Array.isArray(d.material) ? d.material : [d.material]) {
      if (!(m as ShaderMaterial).vertexShader) continue;   // (a stock material: its program is three's, found by the warm-up's own scene walk)
      const k = programKey(o, m);
      if (!out.has(k)) out.set(k, `${o.name || '?'} (${m.name || (m as ShaderMaterial).type})`);
    }
  });
  return out;
}

/** True for the compile-only stand-ins (materials/prototypes.ts): never drawn, no uniform values, so scans of the drawn scene (the uniform checks, the program list) leave them out. */
export function isStandIn(o: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (p.name === 'program-prototypes') return true;
  return false;
}
