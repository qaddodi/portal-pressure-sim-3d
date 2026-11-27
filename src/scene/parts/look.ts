// The look (palette, clear colour), the phone layout, the patient data bound to the figure, and the colour lens.
// Part of CelScene (scene.ts): these methods are mixed into the class, so `this` is the scene. Moved from scene.ts as they were.
import { Color, type DataTexture } from 'three';
import { groundFor } from '../ground.ts';
import type { LensId } from '../lenses/model.ts';
import { type LookId, type Palette, PALETTES } from '../palette.ts';
import { TEXTURE_WIDTH } from '../../engine/vessel-data.ts';
import { clock, AMBIENT_FPS_PHONE, AMBIENT_FPS } from '../../clock/frame.ts';
import { mapRamp } from '../circuit/map-layer.ts';
import { MAP_LOOKS } from '../circuit/data.copied.ts';
import type { CelScene } from '../scene.ts';
import { scenePart } from './define.ts';

export const lookPart = scenePart<CelScene>()({
  // ---- looks ---------------------------------------------------------------------------------

  get currentLook(): LookId { return this.look; },
  get palette(): Palette { return PALETTES[this.look]; },
  applyLook(look: LookId): void {
    this.look = look;
    const p = PALETTES[look];
    this.mapLayer.applyLook(look, p.ink, MAP_LOOKS[look]?.ground ?? p.bg);
    for (const o of this.objects) { o.applyPalette(p); o.setPhone(this.phone); }
    this.procs.applyPalette(p); this.probes.applyPalette(p);
    this.tubes.applyPalette(p); this.resistors.setLook(look);
    this.disease.applyLook(look, p); this.disease.setPhone(this.phone);
    this.lens.setLook(look);
    this.lobule.applyLook(look); this.sinus.applyLook(look); this.feedSinusInk();
    this.moving = true;
  },
  /** The canvas ground, for the renderer's clear colour. */
  get background(): Color { return new Color(PALETTES[this.look].bg); },
  clearColor(intoTexture = false): Color {
    const ground = MAP_LOOKS[this.look]?.ground;
    this.clear.set(PALETTES[this.look].bg);
    if (ground) this.clear.lerp(this.mapGround.set(ground), mapRamp(this.circuit.t));
    // Into the anti-aliasing pass's texture (post-aa.ts) three clears in its linear working space and the pass writes the canvas the picture's own numbers (every shader of the figure writes sRGB
    // numbers as they are), so the ground would land as the LINEAR value of the page's colour: #F1EBE0 as #E0D4BE and Dark's #1A1917 as near black, a visible plate behind the figure against the
    // chrome. The ground is therefore stored as its own numbers there (rawColor's rule); straight to the canvas three converts it itself.
    return groundFor(this.clear, intoTexture);
  },
  setPhone(phone: boolean): void {
    this.phone = phone;
    if (!this.twin) clock.setAmbientFps(phone ? AMBIENT_FPS_PHONE : AMBIENT_FPS);   // (the page's one clock: the split orbit's twin leaves it alone)
    for (const o of this.objects) o.setPhone(phone);
    this.procs.setPhone(phone); this.probes.setPhone(phone); this.tubes.setPhone(phone);
    this.disease.setPhone(phone);
    this.sinus.setPhone(phone);
    this.moving = true;
  },
  // ---- engine data ---------------------------------------------------------------------------

  /** Reads flow, pressure and diameter from the engine's per-vessel texture (src/engine/vessel-data.ts) from now on; null goes back to the stub. */
  bindData(texture: DataTexture | null): void {
    for (const o of this.vessels) o.setUseData(!!texture);
    this.tubes.setUseData(!!texture);
    if (texture) {
      this.shared.vdata.value = texture;
      this.shared.vdataSize.value.set(TEXTURE_WIDTH, 1);
    }
    this.moving = true;
  },
  /** Call after the texture's data changed, so the next frame draws. */
  dataChanged(): void {
    const f = this.src.frame();
    this.lens.setParams(this.src.shown());
    this.lens.onFrame(f, !!f?.jump && this.sawFrame, clock.now());   // (a new patient: the colours glide from the old patient's)
    this.blood.streams.onFrame(f);
    if (f) { this.syncPresence(f, !this.sawFrame); this.feedDisease(f, !this.sawFrame); }
    if (this.procs.setLive((f as { D?: ArrayLike<number> } | null)?.D ?? null)) this.moving = true;   // (the catheters follow the veins' live width)
    this.procs.syncStents(f, this.src.shown(), f ? !this.sawFrame : false);
    this.procs.syncBands((f as { bands?: number } | null)?.bands ?? 0, f ? !this.sawFrame : false);
    this.procs.syncTamponade(this.src.shown() as never, f ? !this.sawFrame : false);
    this.sawFrame = !!f;
    this.syncCircuitData(f);
    // A new patient's numbers that arrive while the camera is in flight (the slide's zoom into the lobule or the sinusoid) are laid at once: the views are dissolved or far then, and an ease
    // made every 1/32 of a step of it rebuild the cells and repaint the 2048 px marks plate on the main thread inside the zoom (HVPG talk, slide 6 to 7, iPhone: "significant lag").
    if (this.figureView !== 'body') this.feedViews(this.rig.isMoving);
    this.moving = true;
  },
  // ---- lens and blood ------------------------------------------------------------------------

  /** Colour the veins by a lens (the Layers menu's ten, a deck's 'system' and 'since', or 'neutral' for the plain anatomy). */
  setLens(lens: LensId, now: number, instant = false): void { this.lens.setLens(lens, now, instant); this.lobule.setLens(lens); this.feedLobuleRef(); this.feedSinusInk();
    this.disease.setLensGrey(lens !== 'pressure' && lens !== 'neutral'); this.moving = true; },
  /** The healthy patient at rest (the engine's `healthyProfile`): the reference the change, congestion, velocity and direction lenses compare to. */
  setHealthy(h: { P: ArrayLike<number>; Q: ArrayLike<number>; D: ArrayLike<number> }): void {
    this.lens.setContext({ healthy: { Q: h.Q, D: h.D, P: h.P }, ref: Float32Array.from(h.P) });
    this.blood.streams.setHealthy(h);
    this.healthyP = Float32Array.from(h.P); this.lobule.setReference(this.healthyP); this.feedSinusInk();
    this.healthyQ = h.Q;
    { const f = this.src.frame(); if (f) this.syncPresence(f, false); }
    this.moving = true;
  },
  /** Count Change and Congestion from a pinned moment's node pressures (Compare > Change), or from the healthy patient again (null). */
  setLensRef(P: ArrayLike<number> | null): void { this.lens.setRef(P); this.moving = true; },
  /** A "change since" slide's reference (2D: stage.changeRef): the node pressures the Since lens counts from, a slide's own state; null takes the arrival state again. The lobule counts from the same one. */
  setSinceRef(P: ArrayLike<number> | null): void { this.lens.setSinceRef(P); this.feedLobuleRef(); this.moving = true; },
  /** The lobule's colours count from the Since reference while that lens is on, from the healthy patient otherwise (2D: lobule-model.js sinceOf). */
  feedLobuleRef(): void { this.lobule.setReference(this.lens.lens === 'since' ? this.lens.sinceReference : this.healthyP); },
});
export type LookPart = typeof lookPart;
