// The pieces the Tests devices (the Doppler probe, the FibroScan probe, the endoscope) are made of: a device part that can wear a colour of its own (the FibroScan's orange and violet, the
// scope's black polymer) and the straight or curved tubes they are drawn from. Every part is a DeviceObject (cel shaded, drawn over the anatomy, with the look's ink as its hairline).
import { Color, Vector3, type BufferGeometry } from 'three';
import { rawColor, type CelShared } from '../../materials/cel.ts';
import type { Palette } from '../../palette.ts';
import { PALETTES, type LookId } from '../../palette.ts';
import { DEVICE_TOKENS, type DeviceTokens } from '../../procedures/copied/device-tokens.copied.ts';
import { DeviceObject, type DeviceOptions, type DeviceTone } from '../device-object.ts';
import { allocTube, makeRings, writeRings, type Ring } from '../tube-rings.ts';

/** The colour a part wears when it is not one of the device table's: a hex, or a function of the look's device tokens. */
export type PartColour = string | ((t: DeviceTokens, look: LookId) => string);

const lookOf = (p: Palette): LookId => ((Object.keys(PALETTES) as LookId[]).find((id) => PALETTES[id] === p) ?? 'light');

export class ProbePart extends DeviceObject {
  private colour: PartColour | null;
  private pal: Palette | null = null;
  constructor(geometry: BufferGeometry, tone: DeviceTone, shared: CelShared, colour: PartColour | null = null, o: DeviceOptions = {}) {
    super(geometry, tone, shared, o, 'ink');
    this.colour = colour;
    this.group.visible = false;
  }
  /** Changes the colour the part wears (a ring that is the portal vein's, then the hepatic vein's) and paints it in the look it is in. */
  recolour(c: PartColour): void { if (c === this.colour) return; this.colour = c; if (this.pal) this.applyPalette(this.pal); }
  override applyPalette(p: Palette): void {
    super.applyPalette(p);
    this.pal = p;
    if (!this.colour) return;
    const look = lookOf(p), hex = typeof this.colour === 'function' ? this.colour(DEVICE_TOKENS[look], look) : this.colour;
    const base = rawColor(hex);
    (this.toon.uniforms.color!.value as Color).copy(base);
    (this.toon.uniforms.shade!.value as Color).copy(base).multiplyScalar(p.shade);
  }
}

const RADIAL = 8;

/** A tube of `n` rings whose centres, directions and radii the caller writes (`rings`), then `commit()`s into the geometry. */
export class TubeBuf {
  readonly rings: Ring[];
  readonly geometry: BufferGeometry;
  readonly n: number;
  readonly radial: number;
  constructor(n: number, radial = RADIAL) { this.n = n; this.radial = radial; this.rings = makeRings(n); this.geometry = allocTube(n, radial); this.rings.forEach((r, i) => r.c.set(0, 0, 0.0001 * i)); this.commit(); }
  commit(): void { writeRings(this.geometry, this.rings, this.radial); }
  /** A straight tube from a to b, radius r at both ends (a taper: r0 to r1). */
  line(a: Vector3, b: Vector3, r0: number, r1 = r0): this {
    const n = this.n;
    const t = new Vector3().subVectors(b, a).normalize();
    for (let i = 0; i < n; i++) { const u = i / (n - 1), g = this.rings[i]!; g.c.lerpVectors(a, b, u); g.t.copy(t); g.r = r0 + (r1 - r0) * u; }
    this.commit();
    return this;
  }
}

/** A straight tube part from a to b. Two rings do for a line; more give a taper's shading. */
export function linePart(shared: CelShared, tone: DeviceTone, colour: PartColour | null, rings = 2, px = 0.8, order = 0): { part: ProbePart; buf: TubeBuf } {
  const buf = new TubeBuf(rings);
  const part = new ProbePart(buf.geometry, tone, shared, colour, { px, order });
  return { part, buf };
}
