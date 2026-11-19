// The swap-in point for the artist's model (stage 4 of the rebuild: the lobule and the sinusoid are modelled last).
// Each view is a set of NAMED PARTS. Today every part is placeholder geometry built here from the model's numbers; the artist's glTF replaces a
// part by name (`view.swap('sinusoids', node)`) and nothing else changes: the view's states, the wash, the chevrons and the shots keep working
// because they address parts, never meshes. The names and the node-naming rule are in docs/lobule-sinusoid.md.
import { Group, type Object3D } from 'three';
import type { CelObject } from '../materials/cel.ts';
import type { Palette } from '../palette.ts';

/** Parts of the lobule view. Node names in the artist's file are `lobule/<part>`. */
export const LOBULE_PARTS = [
  'cords',          // hepatocyte plates, three zones (cords-1, cords-2, cords-3)
  'sinusoids',      // the three generations and the cross-links (sinusoids-0, -1, -2, -links)
  'inlets',         // inlet venules along the edges
  'portal-tracts',  // the six triads: portal venule, hepatic arteriole (and its twig), bile ductule
  'central-vein',
  'lymph',          // each tract's lymphatic, the terminal lymphatics and the space of Disse beside each sinusoid
  'bile',           // the Bile layer: canaliculi between the plates, canals of Hering along the edges, the ductules (arrowheads run out toward the tract)
  'stellate',       // stellate cells in the space of Disse
  'septa',          // portal-central septa of advanced cirrhosis
  'cuffs',          // collagen collars round the tracts and the central vein
  'wash',           // the wedged column's amber over the sinusoids and the central vein
  'field',          // the neighbouring lobules round this one (the dive's field): flat hexagons with their veins, softer with distance
] as const;
export type LobulePartName = (typeof LOBULE_PARTS)[number];

/** Parts of the sinusoid view. Node names are `sinusoid/<part>`. */
export const SINUSOID_PARTS = [
  'lumen',          // the blood's channel, with the Kupffer cell's bump
  'wall',           // endothelium: fenestrae (sieve plates), basement membrane
  'disse',          // the space of Disse, its collagen and the lymph it fills
  'hepatocytes',    // the two plates either side, their cells and nuclei
  'canaliculi',     // the bile canaliculi between neighbouring cells, mid-plate, with their tight junctions
  'stellate',       // the stellate cell, with its squeeze
  'kupffer',
  'lymph-duct',     // the lymph's way out toward the portal tract (no flow marks here)
  'wash',
] as const;
export type SinusoidPartName = (typeof SINUSOID_PARTS)[number];

/** What drives a part: colours for a look, the phone's thinner ink, one step of its own motion. */
export interface PartDriver {
  objects: readonly CelObject[];
  palette(p: Palette): void;
  phone(on: boolean): void;
  /** Steps the part by dtMs; true while it still moves. */
  step(dtMs: number): boolean;
  dispose(): void;
}

export class Part<N extends string> {
  readonly group = new Group();
  placeholder = true;
  driver: PartDriver | null = null;
  /** The artist's node while one has replaced the placeholder. */
  art: Object3D | null = null;
  readonly name: N;
  constructor(name: N) { this.name = name; this.group.name = name; }

  get visible(): boolean { return this.group.visible; }
  set visible(v: boolean) { this.group.visible = v; if (this.art) this.art.visible = v; }
}

/** A set of parts under one group: build placeholders into them, swap them for art later. */
export class PartSet<N extends string> {
  readonly group = new Group();
  readonly parts = new Map<N, Part<N>>();
  constructor(names: readonly N[]) {
    for (const n of names) { const p = new Part(n); this.parts.set(n, p); this.group.add(p.group); }
  }
  get(name: N): Part<N> { const p = this.parts.get(name); if (!p) throw new Error(`no part ${name}`); return p; }
  /** Fills a part with a placeholder driver (its objects are added to the part's group). */
  fill(name: N, driver: PartDriver): void {
    const p = this.get(name);
    p.driver = driver;
    for (const o of driver.objects) p.group.add(o.group);
  }
  /** Replaces a placeholder with the artist's node. The placeholder's drivers keep running unseen only if `keepPlaceholder`; by default they are disposed. */
  swap(name: N, node: Object3D, keepPlaceholder = false): void {
    const p = this.get(name);
    if (!keepPlaceholder) {
      p.driver?.dispose(); p.driver = null;
      p.group.clear();
    } else p.group.visible = false;
    p.art = node;
    this.group.add(node);
    p.placeholder = false;
  }
  /** Every part that is still a placeholder (what the artist has left to do). */
  remaining(): N[] { return [...this.parts.values()].filter((p) => p.placeholder).map((p) => p.name); }
  drivers(): PartDriver[] { return [...this.parts.values()].map((p) => p.driver).filter((d): d is PartDriver => !!d); }
}
