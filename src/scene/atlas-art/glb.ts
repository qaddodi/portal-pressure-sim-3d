// A small GLB reader for the artist's organ meshes (src/scene/atlas-art/): indexed triangle meshes with position, normal, uv and COLOR_0, one node a mesh, identity transforms.
// No three.js loader (and no DOM): it runs in node for the tests and keeps GLTFLoader and its textures out of the bundle. Anything it does not understand throws, so a changed
// package fails loudly instead of drawing wrong.
export interface GlbMesh {
  /** the node's name (the structure: `liver`, `spleen`, `ascites`...) */
  name: string;
  position: Float32Array;
  normal: Float32Array | null;
  uv: Float32Array | null;
  /** COLOR_0, the artist's linear multiplicative wash, as 0..1 floats, 3 per vertex */
  color: Float32Array | null;
  index: Uint16Array | Uint32Array;
  extras: Record<string, unknown>;
}

interface Accessor { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean }
interface Json { nodes: { name?: string; mesh?: number; extras?: Record<string, unknown>; matrix?: unknown; translation?: unknown; rotation?: unknown; scale?: unknown }[]; meshes: { primitives: { attributes: Record<string, number>; indices?: number; mode?: number }[] }[]; accessors: Accessor[]; bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number }[] }

const WIDTH: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const SIZE: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

export function parseGlb(buf: ArrayBuffer): GlbMesh[] {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('glb: not a GLB');
  let json: Json | null = null, bin: ArrayBuffer | null = null;
  for (let off = 12; off + 8 <= buf.byteLength;) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    const body = buf.slice(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body)) as Json;
    else if (type === 0x004e4942 && !bin) bin = body;
    off += 8 + len;
  }
  if (!json || !bin) throw new Error('glb: no JSON or no binary chunk');
  const j = json, b = bin;

  /** The accessor's values as a flat array of its own component type, made again so it is aligned (an accessor may start anywhere in the buffer). */
  const read = (ix: number): { data: Float32Array | Uint8Array | Uint16Array | Uint32Array | Int8Array | Int16Array; acc: Accessor } => {
    const acc = j.accessors[ix], bv = acc && j.bufferViews[acc.bufferView];
    if (!acc || !bv) throw new Error(`glb: no accessor ${ix}`);
    const w = WIDTH[acc.type], z = SIZE[acc.componentType];
    if (!w || !z) throw new Error(`glb: accessor ${ix} is ${acc.type} / ${acc.componentType}`);
    const start = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0), natural = w * z, stride = bv.byteStride && bv.byteStride > natural ? bv.byteStride : natural;
    let bytes: ArrayBuffer;
    if (stride === natural) bytes = b.slice(start, start + acc.count * natural);
    else {
      // padded elements (a VEC3 of bytes is held 4 apart): gathered tight
      const src = new Uint8Array(b), out = new Uint8Array(acc.count * natural);
      for (let i = 0; i < acc.count; i++) out.set(src.subarray(start + i * stride, start + i * stride + natural), i * natural);
      bytes = out.buffer;
    }
    const data = acc.componentType === 5126 ? new Float32Array(bytes) : acc.componentType === 5121 ? new Uint8Array(bytes) : acc.componentType === 5123 ? new Uint16Array(bytes)
      : acc.componentType === 5125 ? new Uint32Array(bytes) : acc.componentType === 5120 ? new Int8Array(bytes) : new Int16Array(bytes);
    return { data, acc };
  };
  const floats = (ix: number | undefined, width: number): Float32Array | null => {
    if (ix === undefined) return null;
    const { data, acc } = read(ix);
    if (WIDTH[acc.type] !== width) throw new Error(`glb: attribute of ${acc.type}, wanted ${width} values a vertex`);
    if (data instanceof Float32Array) return data;
    const k = acc.normalized ? (data instanceof Uint8Array ? 1 / 255 : data instanceof Uint16Array ? 1 / 65535 : 1) : 1;
    return Float32Array.from(data, (v) => v * k);
  };

  const out: GlbMesh[] = [];
  for (const n of j.nodes) {
    if (n.mesh === undefined) continue;
    if (n.matrix || n.translation || n.rotation || n.scale) throw new Error(`glb: node ${n.name} has a transform (the atlas is authored in the app's own frame, identity)`);
    const prims = j.meshes[n.mesh]!.primitives;
    if (prims.length !== 1) throw new Error(`glb: node ${n.name} has ${prims.length} primitives`);
    const p = prims[0]!;
    if (p.mode !== undefined && p.mode !== 4) throw new Error(`glb: node ${n.name} is not triangles`);
    if (p.indices === undefined) throw new Error(`glb: node ${n.name} is not indexed`);
    const position = floats(p.attributes.POSITION, 3);
    if (!position) throw new Error(`glb: node ${n.name} has no positions`);
    const idx = read(p.indices).data;
    if (!(idx instanceof Uint16Array) && !(idx instanceof Uint32Array)) throw new Error(`glb: node ${n.name} has indices of an odd type`);
    out.push({ name: n.name ?? '', position, normal: floats(p.attributes.NORMAL, 3), uv: floats(p.attributes.TEXCOORD_0, 2), color: floats(p.attributes.COLOR_0, 3), index: idx, extras: n.extras ?? {} });
  }
  return out;
}
