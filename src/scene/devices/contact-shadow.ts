// A soft contact shadow under a device (Mohammad, 21 Nov 2026: "a soft shadow under the catheter and the scopes onto the tissue so it gives it some depth": his own spec, a deliberate step beyond 2D).
// No shadow map and no second scene: the device's own tube is drawn once more, before the devices, as a blurred strip pushed away from the figure's one light (upper left front, so down and to the right) and
// grown a little, painted in the look's own shadow colour (2D's --shadow-rgb) at a low alpha that is strongest along the tube's middle and falls to nothing at its edge (n.v), so no hard shape is ever drawn.
// A device draws with no depth test (it reads at its vessel's own place), and so does its shadow: it lands on whatever the figure holds just beneath it, vessel wall or organ, and never on the page.
// It shares the device's own tail fade, balloon hole, reveal and dissolve uniforms, so it ends where the device ends and goes with it; its alpha follows the device's fade (set with setAlpha) and the
// Settings switch (Figure depth > Device shadows), which glides (shared.shadow) so nothing pops.
import { Color, Mesh, ShaderMaterial, Vector2, type BufferGeometry } from 'three';
import type { CelShared } from '../materials/cel.ts';
import { LOOKS, type LookId } from '../../looks/looks.ts';

/** How far the strip is pushed from the tube's middle, and how much wider it is, as a share of the tube's radius; and the least a thin tube is pushed and blurred on screen (device px). */
export const SHADOW_PUSH = { x: 0.3, y: -0.45 }, SHADOW_GROW = 0.3, SHADOW_MIN_PX = 0.7, SHADOW_BLUR_PX = 1.6;
/** The strength at the middle of the strip, per scheme: a shade on the light grounds, a little more on the dark ones, where the same alpha of black reads less. */
export const SHADOW_ALPHA = { light: 0.1, dark: 0.15 };

const VS = /* glsl */ `
uniform vec2 res;
uniform vec2 push;       // view-space push (scene units): the tube's radius times SHADOW_PUSH
uniform float grow;      // scene units the hull grows by along its normals
uniform vec2 minPx;
uniform float blurPx;
varying float vNV;
varying float vU;
void main() {
  vec3 p = position + normal * grow;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  vNV = abs(dot(n, normalize(-mv.xyz)));
  vU = uv.x;
  mv.xy += push;
  vec4 gp = projectionMatrix * mv;
  vec2 fatN = (projectionMatrix * vec4(n, 0.0)).xy;
  float fatL = length(fatN);
  fatN = fatL > 1e-5 ? fatN / fatL : vec2(0.0);
  gp.xy += (fatN * blurPx + minPx) * 2.0 / res * gp.w;
  gl_Position = gp;
}`;

// (the device's own tail fade and balloon hole, one function: the part and its shadow end together)
// (`holeU`: a stretch of the device that is left clear, x..y in uv.x, z how much of it is gone (0..1), w how softly its ends ramp: the shaft inside a balloon, so the glass reads as glass. A gradient at both ends, never a cut.)
export const TAIL_GLSL = 'uniform float tailFade;\nuniform vec4 holeU;\nfloat tailK(float u) { float t = tailFade > 0.0 ? smoothstep(0.0, tailFade, u) : 1.0; if (holeU.z > 0.0) { float w = max(holeU.w, 1e-5); t *= 1.0 - holeU.z * smoothstep(holeU.x - w, holeU.x, u) * (1.0 - smoothstep(holeU.y, holeU.y + w, u)); } return t; }\n';

const FS = /* glsl */ `
${TAIL_GLSL}
uniform vec3 shadowCol;
uniform float shadowA;
uniform float shadowAmt;
uniform float alpha;
uniform float fade;
uniform float reveal;
varying float vNV;
varying float vU;
void main() {
  float soft = pow(clamp(vNV, 0.0, 1.0), 2.2);
  float cut = reveal < 0.9999 ? 1.0 - smoothstep(reveal - 0.02, reveal, vU) : 1.0;
  float a = shadowA * shadowAmt * alpha * fade * tailK(vU) * soft * cut;
  if (a < 0.003) discard;
  gl_FragColor = vec4(shadowCol, a);
}`;

/** The shadow colour of a look: 2D's --shadow-rgb ('46 22 34') as a colour the scene's shaders write. */
export function shadowColour(look: LookId, out = new Color()): Color {
  const [r, g, b] = LOOKS[look].shadowRgb.split(/\s+/).map(Number) as [number, number, number];
  return out.setRGB(r / 255, g / 255, b / 255);
}

export const GL_PROGRAMS = [{ name: 'device contact shadow', vs: VS, fs: FS }] as const;

export class ContactShadow {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  radius: number;
  constructor(geometry: BufferGeometry, shared: CelShared, radius: number, order: number, own: { tailFade: { value: unknown }; holeU: { value: unknown }; reveal: { value: unknown }; fade: { value: unknown } }) {
    this.radius = radius;
    this.material = new ShaderMaterial({ name: 'contact shadow',
      vertexShader: VS, fragmentShader: FS, transparent: true, depthTest: false, depthWrite: false,
      uniforms: {
        res: shared.res, shadowAmt: shared.shadow,
        push: { value: new Vector2() }, grow: { value: 0 }, minPx: { value: new Vector2(SHADOW_MIN_PX * SHADOW_PUSH.x, SHADOW_MIN_PX * SHADOW_PUSH.y) }, blurPx: { value: SHADOW_BLUR_PX },
        shadowCol: { value: new Color(0, 0, 0) }, shadowA: { value: SHADOW_ALPHA.light }, alpha: { value: 1 },
        tailFade: own.tailFade, holeU: own.holeU, reveal: own.reveal, fade: own.fade,
      },
    });
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.renderOrder = order; this.mesh.frustumCulled = false;
    this.setRadius(radius);
  }
  /** The tube's radius (scene units): the push and the width follow it, so the shadow keeps its proportions at any zoom. */
  setRadius(r: number): void {
    this.radius = r;
    const u = this.material.uniforms;
    (u.push!.value as Vector2).set(r * SHADOW_PUSH.x, r * SHADOW_PUSH.y);
    u.grow!.value = r * SHADOW_GROW;
  }
  setAlpha(a: number): void { this.material.uniforms.alpha!.value = a; this.mesh.visible = a > 0.002; }
  paint(look: LookId, dark: boolean): void {
    shadowColour(look, this.material.uniforms.shadowCol!.value as Color);
    this.material.uniforms.shadowA!.value = dark ? SHADOW_ALPHA.dark : SHADOW_ALPHA.light;
  }
  dispose(): void { this.material.dispose(); }
}
