// The network figure of ?geom=net (WP4): the skeleton's meshes in the scene, drawn by the network shader (net/shaders.ts) in place of the tubes and skins. One object per connected network with more than one vessel (the venous tree, the hepatic artery's
// three) and ONE for all the single-vessel networks (the collaterals and the shunts are separate networks only because their ends are sewn, not welded: they share a mesh and a draw), each drawn in at most two passes, the two the old figure draws a
// vessel in: the ORGANS pass (camera layer 0, the program as is: the solid copy of a vessel that lies behind the organs) and the VESSEL pass (the VEIL program: every other vessel and the veil copy of a back one). Which edge is in which pass is the edge's
// `solidK` and `veilK` columns (VesselObject.netCopies) and, so no triangle of a vessel that is in no organs-pass copy is ever sent to it, a second index buffer of that pass holds only the triangles that touch a back vessel.
// Three small passes run once per drawn frame before the figure (`prepass`): the sewn hosts' live radii (NET_SEWN_VS) and every junction region's live capsules (NET_CAP_VS), into float targets the vertex stage reads.
// The state is not set here: net/rows.ts copies it from the old vessel objects, which the scene keeps building as the one place the vessel rules run. Picking, the glow and the labels keep reading those objects.
import { BufferAttribute, BufferGeometry, Color, DataTexture, DoubleSide, FloatType, Group, InterleavedBuffer, InterleavedBufferAttribute, Mesh, NearestFilter, NoBlending, OrthographicCamera, Points, RGBAFormat, Scene, ShaderMaterial, Vector3, WebGLRenderTarget, type IUniform, type WebGLRenderer } from 'three';
import { markBlends, setBlendState } from '../../materials/warm.ts';
import { vdbgDefines } from '../debug-view.ts';
import { VESSEL_LAYER } from '../../layers.ts';
import { NET_CAP_FS, NET_CAP_VS, NET_FS, NET_GLOBALS, NET_RING_SAG, NET_SEWN_FS, NET_SEWN_VS, NET_VS, capPointIds, sewnPointIds } from './shaders.ts';
import { BoneTable } from './bones.ts';
import { EdgeStateTable } from './edge-state.ts';
import { REGION_CAPS, REGION_PTS, regionTexture, regionsOf, type Region } from './regions.ts';
import { NetRows, type RowSource } from './rows.ts';
import type { NetData, NetMeshData } from './load.ts';
import type { NodeReport } from './mesh.ts';
import type { NetMesh, Skeleton } from './types.ts';

/** What the figure needs of the scene besides the rows' state: a vessel's uniforms to share the scene-wide ones from, and the palette's three tone colours. */
export interface NetSource extends RowSource {
  /** any one vessel's uniforms: every scene-wide uniform (the engine data, the lenses, the blood, the circuit, the look's inks) is shared from it BY REFERENCE, so a look change or a new frame of the engine reaches the network with no copying */
  template(): Readonly<Record<string, IUniform>>;
  /** the look's colour of each tone [portal, sys, artery] (the old per-vessel `color` uniform) */
  tones(): readonly [Color, Color, Color];
}

/** One network (or the merged single-vessel ones) as the scene draws it. */
export interface NetDraw { name: string; edges: number[]; vertices: number; triangles: number; regions: Region[]; /** triangles of the organs-pass copy (those touching a back vessel) */ organsTriangles: number; meshes: Mesh[] }

/** Concatenates meshes into one (vertex data end to end, indices rebased). The meshes of the single-vessel networks have no junction regions, so nothing else needs rebasing. */
export function mergeMeshes(parts: readonly NetMesh[]): NetMesh {
  const V = parts.reduce((n, m) => n + m.position.length / 3, 0), I = parts.reduce((n, m) => n + m.index.length, 0);
  const out: NetMesh = { position: new Float32Array(3 * V), bone: new Uint16Array(4 * V), weight: new Float32Array(4 * V), offset: new Float32Array(12 * V), offsetMap: new Float32Array(12 * V), normal: new Float32Array(12 * V), index: new Uint32Array(I) };
  let v = 0, i = 0;
  for (const m of parts) {
    const n = m.position.length / 3;
    out.position.set(m.position, 3 * v); out.bone.set(m.bone, 4 * v); out.weight.set(m.weight, 4 * v); out.offset.set(m.offset, 12 * v); out.normal.set(m.normal, 12 * v);
    out.offsetMap!.set(m.offsetMap ?? m.offset, 12 * v);
    for (let k = 0; k < m.index.length; k++) out.index[i + k] = m.index[k]! + v;
    v += n; i += m.index.length;
  }
  if (parts[0]?.bakeScale) out.bakeScale = parts[0].bakeScale;
  return out;
}

/** The edge each vertex belongs to: the edge of the bone that holds it most. */
export function vertexEdges(skel: Skeleton, m: NetMesh): Int32Array {
  const V = m.position.length / 3, out = new Int32Array(V);
  for (let v = 0; v < V; v++) { let k = 0; for (let j = 1; j < 4; j++) if (m.weight[4 * v + j]! > m.weight[4 * v + k]!) k = j; out[v] = skel.bones[m.bone[4 * v + k]!]!.edge; }
  return out;
}

/** The index of the triangles that touch an edge in `edges` (a triangle of a fillet is in it when any of its three vertices belongs to such an edge). */
export function subsetIndex(m: NetMesh, vertexEdge: Int32Array, edges: ReadonlySet<number>): Uint32Array {
  const out: number[] = [];
  for (let t = 0; t < m.index.length; t += 3) {
    const a = m.index[t]!, b = m.index[t + 1]!, c = m.index[t + 2]!;
    if (edges.has(vertexEdge[a]!) || edges.has(vertexEdge[b]!) || edges.has(vertexEdge[c]!)) out.push(a, b, c);
  }
  return Uint32Array.from(out);
}

function geometryOf(m: NetMesh, regionOf: Float32Array, index: Uint32Array | null, shareFrom?: BufferGeometry): BufferGeometry {
  const g = new BufferGeometry();
  if (shareFrom) { for (const name of Object.keys(shareFrom.attributes)) g.setAttribute(name, shareFrom.getAttribute(name)); }
  else {
    const V = m.position.length / 3;
    g.setAttribute('position', new BufferAttribute(m.position, 3));
    g.setAttribute('bone', new BufferAttribute(m.bone, 4));
    g.setAttribute('weight', new BufferAttribute(m.weight, 4));
    const trio = (data: Float32Array, names: [string, string, string]): void => { const ib = new InterleavedBuffer(data, 12); names.forEach((n, k) => g.setAttribute(n, new InterleavedBufferAttribute(ib, 4, 4 * k))); };
    trio(m.offset, ['off0', 'off1', 'off2']); trio(m.offsetMap ?? m.offset, ['offM0', 'offM1', 'offM2']); trio(m.normal, ['nrm0', 'nrm1', 'nrm2']);
    g.setAttribute('region', new BufferAttribute(regionOf, 1));
    void V;
  }
  if (index) g.setIndex(new BufferAttribute(index, 1));
  g.boundingSphere = null; g.computeBoundingSphere();
  return g;
}

const dataTexture = (data: Float32Array, w: number, h: number): DataTexture => { const t = new DataTexture(data, w, h, RGBAFormat, FloatType); t.minFilter = t.magFilter = NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; };
const blank = (): DataTexture => dataTexture(new Float32Array(4), 1, 1);
const floatTarget = (w: number, h: number): WebGLRenderTarget => new WebGLRenderTarget(w, Math.max(1, h), { type: FloatType, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false, generateMipmaps: false });

/** Groups the baked networks into the objects the scene draws: each network with several vessels alone, every single-vessel network together. */
export function groupNets(nets: readonly NetMeshData[]): { name: string; nets: NetMeshData[] }[] {
  const out: { name: string; nets: NetMeshData[] }[] = [], loose: NetMeshData[] = [];
  nets.forEach((n, i) => { if (n.edges.length > 1) out.push({ name: `net${i}`, nets: [n] }); else loose.push(n); });
  if (loose.length) out.push({ name: 'loose', nets: loose });
  return out;
}

export class NetFigure {
  readonly group = new Group();
  readonly skel: Skeleton;
  readonly bones: BoneTable;
  readonly state: EdgeStateTable;
  readonly rows: NetRows;
  readonly draws: NetDraw[] = [];
  /** the uniforms every program of the figure shares (the scene's by reference, the network's own) */
  readonly uniforms: Record<string, IUniform>;
  private readonly toneColor: Vector3[] = [new Vector3(), new Vector3(), new Vector3()];
  private readonly passScene = new Scene();
  private readonly passCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly targets: WebGLRenderTarget[] = [];
  private readonly sewnTarget: WebGLRenderTarget;
  private readonly materials: ShaderMaterial[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly textures: DataTexture[] = [];

  /** `behind`: the edges (skeleton indices) of vessels the old figure draws behind the organs: the organs-pass copy has their triangles only. */
  private readonly src: NetSource;
  constructor(data: NetData, src: NetSource, behind: ReadonlySet<number>) {
    this.src = src;
    this.skel = data.skel;
    const skel = this.skel, E = skel.edges.length;
    this.bones = new BoneTable(skel.bones, skel.edges);
    this.state = new EdgeStateTable(skel.edges);
    this.rows = new NetRows(skel, this.state, src);
    this.rows.writeStatic(data.nets[0]?.mesh.bakeScale, data.nets.flatMap((n) => n.nodes));
    this.rows.sync();
    this.sewnTarget = floatTarget(2, E);
    const tpl = src.template(), u: Record<string, IUniform> = {};
    for (const name of Object.keys(NET_GLOBALS)) if (tpl[name]) u[name] = tpl[name]!;
    for (const k of Object.keys(tpl)) if (k.startsWith('dbg')) u[k] = tpl[k]!;
    u.boneTex = { value: this.bones.texture() }; u.edgeTex = { value: this.state.texture() };
    u.sewnTex = { value: this.sewnTarget.texture }; u.sewnRows = { value: E };
    u.toneColor = { value: this.toneColor }; u.handOld = { value: 0 }; u.ringSag = { value: NET_RING_SAG };
    this.uniforms = u;
    this.refreshTones();
    const blankTex = blank(); this.textures.push(blankTex);
    // the sewn pass: one point per (edge, end); its own copy of the uniforms has a blank sewn texture, because it writes the real one (a program may not sample the target it draws into)
    {
      const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(3 * 2 * E), 3)); g.setAttribute('sewnId', new BufferAttribute(sewnPointIds(E), 1));
      const m = new ShaderMaterial({ vertexShader: NET_SEWN_VS, fragmentShader: NET_SEWN_FS, precision: 'highp', depthTest: false, depthWrite: false, blending: NoBlending, side: DoubleSide, uniforms: { ...u, sewnTex: { value: blankTex } }, defines: vdbgDefines() });
      this.geometries.push(g); this.materials.push(m);
      this.sewn = new Points(g, m); this.sewn.frustumCulled = false;
    }
    for (const grp of groupNets(data.nets)) this.addObject(grp.name, grp.nets, behind, blankTex);
  }
  private readonly sewn: Points;
  private readonly capPasses: { target: WebGLRenderTarget; points: Points }[] = [];

  private addObject(name: string, nets: NetMeshData[], behind: ReadonlySet<number>, blankTex: DataTexture): void {
    const skel = this.skel, u = this.uniforms;
    const mesh = nets.length === 1 ? nets[0]!.mesh : mergeMeshes(nets.map((n) => n.mesh));
    const regions: Region[] = nets.length === 1 && nets[0]!.nodes.length ? regionsOf(skel, nets[0]!.nodes as NodeReport[]) : [];
    const V = mesh.position.length / 3, rt = regionTexture(regions, V);
    const edges = nets.flatMap((n) => n.edges);
    const vEdge = vertexEdges(skel, mesh);
    const organsSet = new Set(edges.filter((e) => behind.has(e)));
    const organsIndex = organsSet.size ? subsetIndex(mesh, vEdge, organsSet) : null;
    const full = geometryOf(mesh, rt.vertexRegion, mesh.index), organs = organsIndex && organsIndex.length ? geometryOf(mesh, rt.vertexRegion, organsIndex, full) : null;
    this.geometries.push(full); if (organs) this.geometries.push(organs);
    const regionTex = dataTexture(rt.data, rt.width, rt.height); this.textures.push(regionTex);
    const capTarget = regions.length ? floatTarget(REGION_CAPS * REGION_PTS, regions.length) : null;
    if (capTarget) this.targets.push(capTarget);
    const own: Record<string, IUniform> = { ...u, regionTex: { value: regionTex }, capTex: { value: capTarget ? capTarget.texture : blankTex }, capRows: { value: Math.max(1, regions.length) } };
    // the two programs of the figure: the organs-pass copy (the program as it is: solidK) and the vessel-pass copy (VEIL: veilK)
    const mk = (defines: Record<string, number>): ShaderMaterial => { const m = markBlends(new ShaderMaterial({ vertexShader: NET_VS, fragmentShader: NET_FS, precision: 'highp', side: DoubleSide, uniforms: own, defines: { ...defines, ...vdbgDefines() } })); setBlendState(m, true); this.materials.push(m); return m; };
    const meshes: Mesh[] = [];
    if (organs) { const a = new Mesh(organs, mk({})); a.name = `net:${name}:organs`; a.renderOrder = 0; a.frustumCulled = false; a.matrixAutoUpdate = true; a.layers.set(0); meshes.push(a); }
    const b = new Mesh(full, mk({ VEIL: 1 })); b.name = `net:${name}:vessels`; b.renderOrder = 1; b.frustumCulled = false; b.layers.set(VESSEL_LAYER); meshes.push(b);
    for (const m of meshes) { m.raycast = () => {}; this.group.add(m); }   // (the pick is the old tubes': the figure keeps them as the picking proxies)
    if (capTarget) {
      const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(3 * regions.length * REGION_CAPS * REGION_PTS), 3)); g.setAttribute('capId', new BufferAttribute(capPointIds(regions.length), 1));
      const m = new ShaderMaterial({ vertexShader: NET_CAP_VS, fragmentShader: NET_CAP_FS, precision: 'highp', depthTest: false, depthWrite: false, blending: NoBlending, side: DoubleSide, uniforms: { ...own, capTex: { value: blankTex } }, defines: vdbgDefines() });
      this.geometries.push(g); this.materials.push(m);
      const p = new Points(g, m); p.frustumCulled = false; this.capPasses.push({ target: capTarget, points: p });
    }
    this.draws.push({ name, edges, vertices: V, triangles: mesh.index.length / 3, regions, organsTriangles: organsIndex ? organsIndex.length / 3 : 0, meshes });
  }

  /** The look's three tone colours into the palette the shader indexes by the edge's `tone`. */
  refreshTones(): void { const t = this.src.tones(); for (let i = 0; i < 3; i++) this.toneColor[i]!.set(t[i]!.r, t[i]!.g, t[i]!.b); }

  /** Per frame the figure moves: the rows from the vessels, the palette, one upload of the rows that changed. Returns whether anything changed. */
  sync(): boolean {
    this.refreshTones();
    const changed = this.rows.sync();
    this.state.flush(); this.bones.flush();
    return changed;
  }

  /** The Circuit's hand-over (TEMPORARY, net/flag.ts): the share of the old figure drawn now; the network draws the pixels it leaves. Returns whether it changed. */
  setOldShare(s: number): boolean {
    const v = this.uniforms.handOld!;
    if (v.value === s) return false;
    v.value = s;
    this.group.visible = s < 0.999;   // (the old figure holds the whole picture: the network's vertex stage is not run for nothing)
    return true;
  }

  /** The passes that make the textures the vertex stage reads, once per DRAWN frame before the figure: the sewn hosts' live radii, then each region's live capsules. */
  prepass(gl: WebGLRenderer): void {
    if (!this.group.visible) return;
    const prev = gl.getRenderTarget(), ac = gl.autoClear;
    gl.autoClear = false;
    this.passScene.clear(); this.passScene.add(this.sewn);
    gl.setRenderTarget(this.sewnTarget); gl.render(this.passScene, this.passCam);
    for (const p of this.capPasses) { this.passScene.clear(); this.passScene.add(p.points); gl.setRenderTarget(p.target); gl.render(this.passScene, this.passCam); }
    this.passScene.clear();
    gl.setRenderTarget(prev); gl.autoClear = ac;
  }

  /** The draw calls the figure makes in a frame (a mesh with a triangle to draw; the glow's and the passes' apart). */
  get drawCalls(): number { return this.draws.reduce((n, d) => n + d.meshes.length, 0); }
  /** The draw calls of the figure's passes before it (the sewn pass and one capsule pass per object with junction regions): points, a few hundred each. */
  get passCalls(): number { return 1 + this.capPasses.length; }

  dispose(): void {
    for (const m of this.materials) m.dispose();
    for (const g of this.geometries) g.dispose();
    for (const t of this.textures) t.dispose();
    for (const t of [...this.targets, this.sewnTarget]) t.dispose();
    this.group.removeFromParent();
  }
}
