// An organ's glow mask (glow-fx.ts says how the glow is made): the organ drawn as the organ draws it, one flat weight over its silhouette, for the screen-space blur to turn into a true distance fall-off.
//
// ROOT CAUSE of the stepped look the five stacked hulls (ORGAN_GLOW, removed) gave: a hull fragment has no distance value. Five shells each a flat alpha, however many, are five steps; a hop count's screen derivative
// (e7f98289, reverted) is not a distance beyond the outline's own pixel. The vessels' glow already has a distance by construction (the mask, blurred); the organs now use the very same pipeline, at the same sigma.
//
// The mask draws only what the organ draws (the organ-shader.ts discards, as smooth weights): the organ's own positions (not the outline's pushed hull), the organ's fade, the dive's cutaway window, and the tail fade (`reveal`).
// Premultiplied colour and weight, painted by MAX into the organ glow's own texture (ORGAN_GLOW_LAYER), so two lit organs that overlap never add up.
import { CustomBlending, DoubleSide, MaxEquation, Mesh, OneFactor, ShaderMaterial } from 'three';
import type { CelObject } from '../materials/cel.ts';
import { FADE_UNIFORM_GLSL } from '../materials/shaders.ts';
import { ORGAN_GLOW_LAYER } from '../glow.ts';
import { gate } from '../gate.ts';

// The organs that wear no glow (owner, 25 Nov: "remove the heart glow"): the heart and its right atrium (the atrium is part of the heart).
// They keep their outline when tapped or pinned; only the halo is gone.
// ROOT: every organ's glow is made in one place (highlight.ts `OrganPins.glowOf`, through `organMask`), so this is the one list:
// a tap, a slide's pin and a deck link on the heart all reach it, on every deck and view.
export const NO_GLOW_ORGANS: ReadonlySet<string> = new Set(['heart', 'heart-ra']);
/** Whether an organ (by the organ layer's id) takes a glow when lit. */
export const organTakesGlow = (id: string): boolean => !NO_GLOW_ORGANS.has(id);

/** The dive's window as organ-shader.ts ORGAN_FS writes it (these two lines are the twin of its `q` and `win`; tests/organ-glow-mask.test.ts holds the two together). */
export const ORGAN_WINDOW_Q = 'vec2 q = vClip.xy / vClip.w - cut.xy;';
export const ORGAN_WINDOW_WIN = 'float win = smoothstep(cut.z, cut.z + 0.3, length(vec2(q.x * cut.w, q.y)));';

export const ORGAN_MASK_VS = /* glsl */ `varying vec4 vClip;
varying float vU;
void main() {
  vU = uv.x;
  vec4 c = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vClip = c;
  gl_Position = c;
}`;

export const ORGAN_MASK_FS = /* glsl */ `${FADE_UNIFORM_GLSL}
uniform vec3 hiColor;   // the organ's own highlight colour (the outline's: layer.ts), shared with its ink so a look change reaches it
uniform float amt;      // the pick's eased weight, 0..1
uniform float reveal;   // the tail fade (organ-shader's ink: frontOut), a soft front a tenth of the length
uniform vec4 cut;       // the dive's window, one for every organ (layer.ts ORGAN_CUT)
varying vec4 vClip;
varying float vU;
void main() {
  ${ORGAN_WINDOW_Q}
  ${ORGAN_WINDOW_WIN}
  float tail = clamp((reveal * 1.1 - vU) / 0.1, 0.0, 1.0);
  float w = amt * clamp(fade, 0.0, 1.0) * win * tail;
  gl_FragColor = vec4(hiColor * w, w);
}`;

/** What the mask is drawn with (the program stand-in, materials/prototypes.ts, wears the same): both faces, MAX into the mask, no depth. */
export const ORGAN_MASK_FLAGS = { side: DoubleSide, transparent: true, depthTest: false, depthWrite: false, blending: CustomBlending, blendEquation: MaxEquation, blendSrc: OneFactor, blendDst: OneFactor } as const;

/** The mask's two programs, compiled by the GLSL compile test (src/debug/gl-auto.ts reads GL_PROGRAMS of glow-fx.ts; scripts/glsl-compile-list.mjs lists this one). */
export const GL_PROGRAMS = [{ name: 'organ glow mask', vs: ORGAN_MASK_VS, fs: ORGAN_MASK_FS }] as const;

/** The organ's mask mesh: the organ's own geometry, the organ's own fade, window, tail and highlight colour (the same uniform objects, so nothing is copied and nothing can drift), on the organ glow's layer. Hidden until lit. */
export function organMask(id: string, o: CelObject): Mesh {
  if (!organTakesGlow(id)) throw new Error(`organMask: ${id} takes no glow (NO_GLOW_ORGANS)`);
  const mat = new ShaderMaterial({ name: 'organ glow mask', vertexShader: ORGAN_MASK_VS, fragmentShader: ORGAN_MASK_FS, ...ORGAN_MASK_FLAGS,
    uniforms: { fade: o.toon.uniforms.fade!, cut: o.toon.uniforms.cut!, reveal: o.ink.uniforms.reveal!, hiColor: o.ink.uniforms.hiColor!, amt: { value: 0 } } });
  const m = new Mesh(o.toonMesh.geometry, mat);
  m.frustumCulled = false; gate(m, 0); m.name = `highlight/glow/${id}`;
  m.raycast = () => {};
  m.layers.set(ORGAN_GLOW_LAYER);   // (not the figure's passes: the organ glow's own mask pass draws it)
  return m;
}

