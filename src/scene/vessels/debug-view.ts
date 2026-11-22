// The inspector's view of the vessels (the on-screen panel of `?inspect`, or `?joins=debug`: src/ui/debug/inspect). Two parts of the figure are told apart, the TUBES (every vessel's own draw, vessels/shaders.ts) and the junction SKINS
// (the welded meshes, vessels/skin/shaders.ts), and each has its own set of uniforms here, shared BY REFERENCE by every material of that part: the panel writes a number once and the next frame shows it, with no rebuild.
//   shade  0 as drawn, 1 flat (the body colour, no cel bands), 2 the surface normal as colour, 3 the lens colour alone
//   dust, heads, ink  the flow marks (the dust, the chevrons) and the outline, on or off (a part left out is CLEARED, never multiplied by 0: a NaN times nothing is still NaN, and a NaN is the speck being hunted)
//   tint  a colour per vessel (a hash of its row in the vessel data), so one tube can be told from the next; skins a shifted hue
//   colour + amount  a colour laid over the whole part (the end of the fragment shader)
// NORMAL MODE COSTS NOTHING: the shaders carry the hooks only inside `#ifdef VDBG`, and the define (and the uniforms) are put on the materials only when the address asks for the inspector (`inspectOn`, read once at load), so
// the programs of a page without the flag are exactly what they were. The two copies of GLSL here are the declarations and the two helpers every hook calls.
import { Color, Vector4, type IUniform } from 'three';
import { inspectRequested } from '../../ui/debug/flags.ts';

/** Whether the page asks for the inspector: `?inspect`, or `?joins=debug` (which grew into it). Read from the address; a test passes its own search string. */
export const inspectOn = (search?: string): boolean => inspectRequested(search);
/** The answer for this page, fixed at load: the materials are built (and the program cache keyed) with it. */
export const INSPECT: boolean = inspectOn();

export type ShadeMode = 0 | 1 | 2 | 3;
export const SHADE_NAMES: readonly string[] = ['As drawn', 'Flat colour', 'Normals', 'Lens colour only'];
export type PartId = 'tube' | 'skin';

/** One part's view: what the panel shows and sets. */
export interface PartView {
  shade: ShadeMode;
  dust: boolean; heads: boolean; ink: boolean;
  tint: boolean;
  /** paint the pixel a tube drops, in the colour of the reason (tubes only: shaders.ts DROP) */
  why: boolean;
  /** the colour laid over the part, '#rrggbb', and how much of it (0 none, 1 solid) */
  colour: string; amount: number;
}
export const partDefault = (): PartView => ({ shade: 0, dust: true, heads: true, ink: true, tint: false, why: false, colour: '#ff00ff', amount: 0 });

const uniformsOf = (): Record<string, IUniform> => ({
  dbgShade: { value: 0 }, dbgDust: { value: 1 }, dbgHeads: { value: 1 }, dbgInk: { value: 1 }, dbgTint: { value: 0 }, dbgWhy: { value: 0 }, dbgCol: { value: new Vector4(1, 0, 1, 0) },
});
const U: Record<PartId, Record<string, IUniform>> = { tube: uniformsOf(), skin: uniformsOf() };
const STATE: Record<PartId, PartView> = { tube: partDefault(), skin: partDefault() };

/** The uniforms a part's materials spread into theirs: none on a page without the inspector (the shader has no such uniform then). */
export const vdbgUniforms = (part: PartId): Record<string, IUniform> => (INSPECT ? U[part] : {});
/** The define a part's programs carry (VDBG), none without the inspector. */
export const vdbgDefines = (): Record<string, number> => (INSPECT ? { VDBG: 1 } : {});

/** The uniforms of a part whether or not the page carries them (the panel writes them either way; a test reads them). */
export const partUniformValues = (part: PartId): Record<string, IUniform> => U[part];
/** A part's view now (a copy). */
export const partView = (part: PartId): Readonly<PartView> => ({ ...STATE[part] });

const _c = new Color();
/** Changes a part's view; writes the uniforms. Returns the keys that changed. */
export function setPart(part: PartId, patch: Partial<PartView>): (keyof PartView)[] {
  const s = STATE[part], u = U[part], changed: (keyof PartView)[] = [];
  for (const k of Object.keys(patch) as (keyof PartView)[]) {
    const v = patch[k];
    if (v === undefined || s[k] === v) continue;
    (s as unknown as Record<string, unknown>)[k] = v; changed.push(k);
  }
  u.dbgShade!.value = s.shade; u.dbgDust!.value = s.dust ? 1 : 0; u.dbgHeads!.value = s.heads ? 1 : 0; u.dbgInk!.value = s.ink ? 1 : 0; u.dbgTint!.value = s.tint ? 1 : 0; u.dbgWhy!.value = s.why ? 1 : 0;
  _c.set(s.colour);
  (u.dbgCol!.value as Vector4).set(_c.r, _c.g, _c.b, Math.min(1, Math.max(0, s.amount)));
  return changed;
}
/** Every part back to as drawn. */
export function resetParts(): void { for (const p of ['tube', 'skin'] as const) setPart(p, partDefault()); }

/** The chunk below is spliced into the vessel and skin programs when the inspector is on; those are compiled as 'vessel (inspector)' and the 'skin (inspector…)' variants (debug/gl-registry.ts). */
export const GL_ON_SCENE_GRAPH = 'the inspector hooks spliced into the vessel and skin programs (gl-registry.ts: vessel (inspector), skin (inspector))';
/** The declarations and helpers of the hooks (both fragment shaders; after CEL_TUBE_GLSL, which has celTubeBase). `dbgBody` replaces the cel tone, `dbgEnd` is the last word on the colour. */
export const VDBG_GLSL = /* glsl */ `
#ifdef VDBG
uniform float dbgShade;
uniform float dbgDust;
uniform float dbgHeads;
uniform float dbgInk;
uniform float dbgTint;
uniform float dbgWhy;
// WHY A PIXEL IS DROPPED (a tube's discards, shaders.ts DROP(n)): with the switch on the pixel is painted in the reason's colour instead of dropped. 1 reveal front blue, 2 fade dither green, 3 map dither light green, 4 vFade yellow, 5 skin cut cyan,
// 6 map skin cut teal, 7 round cap orange, 8 back face red, 9 dotted white, 10 cava cut purple, 11 final alpha pink, 12 inside the other lumen (ink band cut) magenta
vec3 dbgWhyCol(float n) {
  if (n < 1.5) return vec3(0.1, 0.2, 1.0); if (n < 2.5) return vec3(0.0, 0.8, 0.0); if (n < 3.5) return vec3(0.6, 1.0, 0.5); if (n < 4.5) return vec3(1.0, 0.9, 0.0);
  if (n < 5.5) return vec3(0.0, 1.0, 1.0); if (n < 6.5) return vec3(0.0, 0.5, 0.5); if (n < 7.5) return vec3(1.0, 0.5, 0.0); if (n < 8.5) return vec3(1.0, 0.0, 0.0);
  if (n < 9.5) return vec3(1.0); if (n < 10.5) return vec3(0.6, 0.2, 0.9); if (n < 11.5) return vec3(1.0, 0.4, 0.7); return vec3(1.0, 0.0, 1.0);
}
#define DROP(n) { if (dbgWhy > 0.5) { gl_FragColor = vec4(dbgWhyCol(float(n)), 1.0); return; } discard; }
uniform vec4 dbgCol;
vec3 dbgBody(vec3 c, vec3 base, vec3 n) {
  if (dbgShade < 0.5) return c;
  if (dbgShade < 1.5) return celTubeBase(base);
  if (dbgShade < 2.5) return n * 0.5 + 0.5;
  return base;
}
vec3 dbgEnd(vec3 c, float id) {
  if (dbgTint > 0.5) c = mix(c, 0.5 + 0.5 * cos(6.2831853 * (fract(id * 0.61803399) + vec3(0.0, 0.33, 0.67))), 0.65);
  return mix(c, dbgCol.rgb, dbgCol.a);
}
#else
#define DROP(n) discard;
#endif
`;
