// The editor's overlay: stock three Points and Lines (no custom shaders), depth test off, in the body's frame, drawn in the vessels' pass (scene.setEditorOverlay).
// Rewritten only when an edit changes it (the panel asks for a frame with frameFor); nothing here runs per frame.
import { BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Points, PointsMaterial, type Material, type Object3D } from 'three';
import type { V3 } from '../../../editor/types.ts';

const RENDER_ORDER = 1000;
const mat = <M extends Material>(m: M): M => { m.depthTest = false; m.depthWrite = false; m.transparent = true; m.toneMapped = false; return m; };

export interface Dots { pos: readonly V3[]; size: number; color: number }
export class Overlay {
  readonly group = new Group();
  private readonly layers = new Map<string, Points | LineSegments>();
  constructor() { this.group.name = 'editor-overlay'; }

  private slot(name: string, make: () => Points | LineSegments): Points | LineSegments {
    let o = this.layers.get(name);
    if (!o) { o = make(); o.renderOrder = RENDER_ORDER; o.frustumCulled = false; o.name = name; this.layers.set(name, o); this.group.add(o); }
    return o;
  }
  private fill(o: Points | LineSegments, flat: number[]): void {
    const g = o.geometry as BufferGeometry;
    g.setAttribute('position', new Float32BufferAttribute(flat, 3));   // (new attribute: a size change reallocates, and the counts here are small)
    g.computeBoundingSphere(); o.visible = flat.length > 0;
  }
  /** Round-ish dots (square points) of `size` px. */
  dots(name: string, d: Dots): void {
    const o = this.slot(name, () => new Points(new BufferGeometry(), mat(new PointsMaterial({ size: d.size, sizeAttenuation: false, color: d.color }))));
    const m = (o as Points).material as PointsMaterial; m.size = d.size; m.color.setHex(d.color);
    this.fill(o, d.pos.flatMap((p) => [p[0], p[1], p[2]]));
  }
  /** A polyline through `pts`, drawn as segments. */
  line(name: string, pts: readonly V3[], color: number): void {
    const o = this.slot(name, () => new LineSegments(new BufferGeometry(), mat(new LineBasicMaterial({ color }))));
    ((o as LineSegments).material as LineBasicMaterial).color.setHex(color);
    const flat: number[] = [];
    for (let i = 1; i < pts.length; i++) flat.push(...pts[i - 1]!, ...pts[i]!);
    this.fill(o, flat);
  }
  /** The 12 edges of a box. */
  box(name: string, lo: V3, hi: V3, color: number): void {
    const c = (i: number): V3 => [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]];
    const e: [number, number][] = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const o = this.slot(name, () => new LineSegments(new BufferGeometry(), mat(new LineBasicMaterial({ color }))));
    ((o as LineSegments).material as LineBasicMaterial).color.setHex(color);
    this.fill(o, e.flatMap(([a, b]) => [...c(a!), ...c(b!)]));
  }
  clear(name: string): void { const o = this.layers.get(name); if (o) o.visible = false; }
  dispose(): void {
    for (const o of this.layers.values()) { o.geometry.dispose(); (o.material as Material).dispose(); }
    this.layers.clear(); this.group.clear();
  }
  get object(): Object3D { return this.group; }
}
