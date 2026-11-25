// A key for "what would these layers draw": a hash over every visible object on the given camera layers (its place, its geometry's versions,
// its material's uniforms and textures) plus the camera and the target.
// Two frames with the same key draw the same picture, so a picture that depends on nothing else (the organ map, organ-map.ts) is drawn
// once and kept until the key moves. It is generic on purpose: no setter has to remember to say "the organs changed", the objects
// themselves are read, so a change nobody thought of still moves the key. A uniform the shaders of that object never read (`time`,
// `vdata` on the organs' own program) is left out ONLY when the program's source is read and does not name it, so a program that
// does read it is never kept.
// Anything it does not understand (a skinned mesh, a uniform of an unknown kind) returns NaN, which equals nothing: that frame is drawn.
import type { Camera, Material, Object3D, ShaderMaterial } from 'three';

const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
const MAYBE_UNUSED = ['time', 'vdata', 'vdataSize'] as const;
const usedBy = new WeakMap<Material, Record<string, boolean>>();

/** Which of the shared per-frame uniforms this material's program really reads (the source is read once per material). */
function reads(m: ShaderMaterial): Record<string, boolean> {
  let r = usedBy.get(m);
  if (!r) {
    const src = `${m.vertexShader}\n${m.fragmentShader}`;
    r = {};
    for (const n of MAYBE_UNUSED) r[n] = new RegExp(`\\b${n}\\b`).test(src);
    usedBy.set(m, r);
  }
  return r;
}

interface Renderable {
  isMesh?: boolean; isLine?: boolean; isPoints?: boolean; isSkinnedMesh?: boolean; isInstancedMesh?: boolean; count?: number;
  geometry?: { id: number; attributes: Record<string, { version: number }>; index: { version: number } | null; drawRange: { start: number; count: number } };
  material?: Material | Material[];
}

export class KeyHash {
  h = 2166136261;
  bad = false;
  num(x: number): void { f32[0] = x; this.h = Math.imul(this.h ^ u32[0]!, 16777619) >>> 0; }
  nums(a: ArrayLike<number>): void { for (let i = 0; i < a.length; i++) this.num(a[i]!); }
  /** Hashes a uniform's value; false for a kind it does not know. */
  value(v: unknown): void {
    if (typeof v === 'number') this.num(v);
    else if (typeof v === 'boolean') this.num(v ? 1 : 0);
    else if (v == null) this.num(-7);
    else if (typeof v !== 'object') this.bad = true;
    else {
      const o = v as Record<string, unknown>;
      if (o.isTexture) { this.num(o.id as number); this.num(o.version as number); }
      else if (Array.isArray(v)) for (const e of v) this.value(e);
      else if (o.isColor) this.nums([o.r as number, o.g as number, o.b as number]);
      else if (o.isVector2) this.nums([o.x as number, o.y as number]);
      else if (o.isVector3) this.nums([o.x as number, o.y as number, o.z as number]);
      else if (o.isVector4 || o.isQuaternion) this.nums([o.x as number, o.y as number, o.z as number, o.w as number]);
      else if (o.isMatrix3 || o.isMatrix4) this.nums(o.elements as number[]);
      else if (ArrayBuffer.isView(v)) this.nums(v as unknown as ArrayLike<number>);
      else this.bad = true;
    }
  }
}

/** The key of everything drawn on `mask`'s layers by `cam`, in a target `w` x `h`. NaN when it cannot say. Call after the scene's matrices are current (`scene.updateMatrixWorld()`). */
export function sceneKey(scene: Object3D, cam: Camera, mask: number, w: number, h: number, extra: ArrayLike<number> = []): number {
  const k = new KeyHash();
  k.num(w); k.num(h); k.nums(extra);
  k.nums(cam.matrixWorld.elements); k.nums(cam.projectionMatrix.elements);
  scene.traverseVisible((o) => {
    if ((o.layers.mask & mask) === 0) return;
    const r = o as unknown as Renderable;
    if (!(r.isMesh || r.isLine || r.isPoints) || !r.geometry || !r.material) return;
    if (r.isSkinnedMesh) { k.bad = true; return; }
    k.num(o.id); k.num(o.renderOrder); k.nums(o.matrixWorld.elements);
    const g = r.geometry;
    k.num(g.id); k.num(g.drawRange.start); k.num(g.drawRange.count); k.num(g.index ? g.index.version : -1);
    for (const n in g.attributes) k.num(g.attributes[n]!.version);
    if (r.isInstancedMesh) k.num(r.count ?? 0);
    for (const m of Array.isArray(r.material) ? r.material : [r.material]) {
      k.num(m.id); k.num(m.version); k.num(+m.visible); k.num(m.opacity); k.num(+m.transparent); k.num(m.side);
      const sm = m as ShaderMaterial;
      if (sm.uniforms) {
        const used = reads(sm);
        for (const n in sm.uniforms) {
          if (n in used && !used[n]) continue;   // (a per-frame uniform this program never reads)
          k.value(sm.uniforms[n]!.value);
        }
      } else {
        const c = (m as { color?: unknown }).color;
        if (c) k.value(c);
      }
    }
  });
  return k.bad ? NaN : k.h;
}
