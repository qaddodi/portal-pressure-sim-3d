// The Lobule's ONE fade, made structural (Mohammad 20 Nov 2026: the lobule "flashes" going to and from the sinusoid, the lymph first, then the vessels, then the yellow plate before the vessels).
// Root cause each time was the same: a part of the Lobule had a fade of its own (a second scale on the marks, a visibility switch on the neighbours' plate) instead of the lobule's.
// So the rule is now kept in one place and not by memory: every object under the Lobule root (LobuleRoot) takes its fade from the LobuleFade here, whoever built it and whenever it was added.
//   - `detail` (kind 'detail', the default): the lobule's own tiles, tubes, marks and the marks plate. They dissolve by dropping pixels of ONE screen pattern (FADE_GLSL's fadedOut) at this value.
//   - `ground` (kind 'ground'): the neighbours' plate, one alpha-blended draw. It follows the same dive (1 - under) but not the field's own breadth, which is how the field itself widens.
//   - a material that is neither a shader with a `fade` uniform nor patched here cannot be told from outside: `unfaded(root)` lists it, and tests/lobule-one-fade.test.ts fails on any.
// The ONLY writer of either value is `LobuleFade.set`; nothing else scales a lobule layer's alpha or toggles its visibility to hide it during the dive.
import { Group, type Material, type Object3D, type ShaderMaterial } from 'three';

export type FadeKind = 'detail' | 'ground';
export interface FadeValue { value: number }

/** A material says which fade it is on in `userData.fadeKind` (default 'detail'). */
export function fadeKindOf(m: Material): FadeKind { return (m.userData as { fadeKind?: FadeKind }).fadeKind === 'ground' ? 'ground' : 'detail'; }

/** A fragment shader that reads the fade: the shared dither (`fadedOut()`) or the plain `fade` uniform as an alpha. */
export const readsFade = (fragmentShader: string): boolean => /\bfadedOut\s*\(|\bfade\b/.test(fragmentShader.replace(/\/\/.*$/gm, ''));

type Renderable = Object3D & { material?: Material | Material[] };
const materialsOf = (o: Renderable): Material[] => (o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []);
const isShader = (m: Material): m is ShaderMaterial => (m as ShaderMaterial).isShaderMaterial === true;

export class LobuleFade {
  /** The lobule's own dissolve (dither), 1 whole. The one uniform every tile, tube, mark and the marks plate hold. */
  readonly detail: FadeValue = { value: 1 };
  /** The neighbours' ground (alpha), 1 whole. */
  readonly ground: FadeValue = { value: 1 };
  private readonly patched = new WeakSet<Material>();

  /** The one writer. */
  set(detail: number, ground: number): void { this.detail.value = detail; this.ground.value = ground; }

  uniformFor(m: Material): FadeValue { return fadeKindOf(m) === 'ground' ? this.ground : this.detail; }

  /** Gives `root` and everything under it the fade (idempotent: a material already on it is left as it is). Returns how many materials it took. */
  adopt(root: Object3D): number {
    let n = 0;
    root.traverse((o) => {
      for (const m of materialsOf(o as Renderable)) {
        const u = this.uniformFor(m);
        if (isShader(m)) {
          if (m.uniforms.fade === u) continue;
          m.uniforms.fade = u; n++;
        } else if (!this.patched.has(m)) {
          // (a stock material, such as the halo's MeshBasicMaterial: its alpha is scaled by the same value, in its own program)
          this.patched.add(m); n++;
          const was = m.onBeforeCompile;
          m.userData.oneFade = u;
          m.onBeforeCompile = (s, r) => {
            was.call(m, s, r);
            s.uniforms.fade = u;
            s.fragmentShader = `uniform float fade;\n${s.fragmentShader}`.replace('#include <dithering_fragment>', 'gl_FragColor.a *= fade;\n#include <dithering_fragment>');
          };
          m.customProgramCacheKey = () => 'lobule-one-fade';
          m.needsUpdate = true;
        }
      }
    });
    return n;
  }

  /** Everything under `root` that does NOT take its fade from here: [object name, why]. Empty when the rule holds. */
  unfaded(root: Object3D): [string, string][] {
    const bad: [string, string][] = [];
    root.traverse((o) => {
      const mats = materialsOf(o as Renderable);
      if (!mats.length) return;
      const name = o.name || o.type;
      for (const m of mats) {
        const u = this.uniformFor(m);
        if (isShader(m)) {
          if (m.uniforms.fade !== u) bad.push([name, `its fade uniform is not the lobule's ${fadeKindOf(m)} fade`]);
          else if (!readsFade(m.fragmentShader)) bad.push([name, 'its fragment shader never reads the fade']);
        } else if ((m.userData as { oneFade?: FadeValue }).oneFade !== u) bad.push([name, `a ${m.type} that was not given the fade`]);
      }
    });
    return bad;
  }
}

/** The Lobule's root group. Whatever is added under it gets the fade at once, from the one LobuleFade; `set` re-checks the whole graph, so an object added to a child group later is caught on the next frame. */
export class LobuleRoot extends Group {
  readonly fade: LobuleFade;
  constructor(fade: LobuleFade) { super(); this.fade = fade; }
  override add(...objects: Object3D[]): this { super.add(...objects); for (const o of objects) this.fade.adopt(o); return this; }
  /** The fade's one write, after taking in anything added since. */
  setFade(detail: number, ground: number): void { this.fade.adopt(this); this.fade.set(detail, ground); }
}
