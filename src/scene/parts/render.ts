// Drawing: the figure's passes, the shared draw for the split orbit, and tearing down.
// Part of CelScene (scene.ts): these methods are mixed into the class, so `this` is the scene. Moved from scene.ts as they were.
import { lapTimer } from '../any-moving.ts';
import { WebGLRenderer, type WebGLRenderTarget } from 'three';
import { dustTuner } from '../blood/dust.ts';
import { MICRO_DPR } from '../micro3d/cel3d.ts';
import { splitRegions, confine, type Region } from '../twin/region.ts';
import { VESSEL_LAYER } from '../layers.ts';
import { ORGAN_VEIL, vesselZoomK, seeZoomK, veilShare } from '../organ-veil/config.ts';
import { ORGAN_VEIL_U, resetOrganVeil } from '../organ-veil/uniforms.ts';
import { gate } from '../gate.ts';
import type { CelScene } from '../scene.ts';
import { scenePart } from './define.ts';
import { DIVE_IN, _bA, _bB, _bE0, _bE1, _bEnds } from './shared.ts';

export const renderPart = scenePart<CelScene>()({
  /** How often the organ map was drawn and how often it was kept (?perf). */
  get organMapStats(): { drawn: number; kept: number; unkeyed: number } { return this.organMap.stats; },
  /** Until the camera has its first real shot and room only the background is drawn, so the figure's first picture is already in its place. */
  render(gl: WebGLRenderer): void {
    if (!this.rig.placed) { gl.clear(); return; }
    const lap = lapTimer(this.systemMs);   // (the render phase's laps share update()'s record, named 'render: ...': the audit's per-step table names the system that costs a frame)
    gl.setClearColor(this.clearColor(this.post.on));
    const dpr = gl.getPixelRatio?.() ?? 1;
    this.shared.dpr.value = dpr;
    this.blood.shared.dpr.value = dpr;   // (the vessels' line is set in CSS px and converted with it)
    if (!this.twin) dustTuner.setView(this.phone, this.width * this.height * dpr * dpr);   // (the dust's samples a pixel follow the device and the canvas: blood/dust-spec.ts dustBudget)
    this.microDpr = dpr; this.micro?.lobule.setDpr(dpr);
    this.disease.organs.setDpr(dpr);
    MICRO_DPR.value = dpr;   // (the micro parts' lines drawn in the fill are CSS px wide on every screen)
    // Two passes, as the 2D figure paints: the organs first, then the vessels (and what is in them) over the cleared depth, so no organ's relief ever hides a vessel and a joined
    // vessel never looks cut. (The vessels keep their own depth among themselves: their tiers.)
    const cam = this.rig.camera, mask = cam.layers.mask, ac = gl.autoClear;
    const inspectEnd = this.inspectBegin();   // (the inspector's hidden layers and wireframes: null, and nothing done, on every page without the panel)
    // the figure is drawn into a texture of the canvas's size and filtered onto the canvas once (post-aa.ts), unless the pass is off or the device refused it
    // depth of field in the dive (desktop only, post-dof.ts): zero cost unless its strength is above 0; the vessels' pass then keeps the depth the first pass drew (it draws nothing once the body is gone)
    const dofShare = this.post.dof.frame(this.figureView, cam, this.rig.pose.shot.target, cam.position.distanceTo(this.livePoint), this.lobuleRest(), DIVE_IN);
    const into = this.post.target(gl);
    const dof = dofShare > 0 && !!into?.depthTexture;
    // the sinusoid's focus band (every device): its own lumen and plates sharp, the neighbours and whatever drifts off them blurring by distance (post-dof.ts bandFrame)
    // the Anatomy <-> Lobule move: the same one blur over the whole screen, from the camera's distance alone (post-dof.ts diveBlur), in and out, held over a lobule the move only passes through;
    // the sinusoid's own focus pull has the pass when it is drawn, at the stronger of the two (parts/dive.ts focusNow)
    const fk = this.focusNow(), bandK = into ? fk.band : 0;
    this.post.dof.bandOpen = this.microReady ? this.micro!.sinus.focusOpen : 1;
    let band = bandK > 0 && this.post.dof.bandFrame(cam, _bA, _bB, _bE0, _bE1, into!.width, into!.height, Math.max(bandK, fk.whole), _bEnds) > 0;
    if (!band && into && fk.whole > 0) band = this.post.dof.uniformFrame(into.height, fk.whole) > 0;
    if (!band) this.post.dof.bandShare = 0;
    // an organ's glow: its mask and blur are made BEFORE the figure's first pass, because its lay is a quad inside that pass (behind the vessels, at the organ's own place in the organs' order),
    // gated by the sharp mask so the organ itself is never tinted
    const og = this.pins.glowing, ogQuad = this.organGlowFx.figure;
    if (og) { this.organGlowFx.prepare(gl, cam, this.scene, dpr); ogQuad.renderOrder = this.pins.glowOrder; }
    gate(ogQuad, this.pins.glowAmount);   // (the lay quad follows the eased weight of the lit masks, as they do)
    // THE ORGAN VEIL (organ-veil/config.ts): the vessels' veil is whole at the whole-figure framing and gone at twice as close; the organs' show-through starts at 1.5 times and is
    // whole at 3. It is the organs' effect, so it goes WITH the organs, by their own fade (the dive's dissolve, the Circuit's leaving: veilShare), never by a switch on the view.
    // (Before, the view's name turned it off in the dive's first frame, on in the way out's landing frame and off at the Circuit's start: every vessel in the liver changed colour
    // at once, part of the Anatomy to Lobule flicker, Mohammad 26 Nov.) Never in the split orbit or the depth-of-field pass. Nothing is drawn while both are 0; the map is half size.
    {
      const u = ORGAN_VEIL_U, [vk, sk] = this.veilNow(dof);
      const tw = into ? into.width : gl.getDrawingBufferSize(this.veilSize).x, th = into ? into.height : this.veilSize.y;
      u.ovlP.value.set(0, ORGAN_VEIL.gapFrom, ORGAN_VEIL.gapTo, 0); u.seeP.value.set(0, ORGAN_VEIL.seeMax, 1 / tw, 1 / th);   // (off while the map itself is drawn)
      if (vk > 0 || sk > 0) {
        this.organMap.render(gl, cam, this.scene, tw, th, { veil: vk > 0, see: sk > 0 });
        u.ovlP.value.x = vk * ORGAN_VEIL.vesselMax; u.seeP.value.x = sk;
        u.ovlC.value.set(cam.near, cam.far, 1 / tw, 1 / th);
      }
    }
    lap('render: organ veil map');
    if (into) gl.setRenderTarget(into);
    const sp = into ? this.split : null;   // (the split orbit: the twin is drawn into its region of this target first, then this scene's passes are confined to theirs)
    if (sp && into) {
      const r = splitRegions(into.width, into.height, sp.at);
      sp.drawTwin(gl, into, r.twin, dpr); gl.setClearColor(this.clearColor(true));
      confine(into, r.main); gl.setRenderTarget(into);   // (a target's scissor is taken when it is set)
    }
    cam.layers.set(0);
    lap('render: setup (dof, band, blur frame)');
    gl.render(this.scene, cam);
    lap('render: pass 1, layer 0 (organs; the lobule and the sinusoid are drawn here too)');
    gl.autoClear = false;
    if (!dof) { gl.clearDepth(); gl.clearStencil(); }   // (the outlines' stencil goes with the depth: each pass inks a pixel once, vessel-object.ts hullMat)
    cam.layers.set(VESSEL_LAYER);
    gl.render(this.scene, cam);
    lap('render: pass 2, vessel layer');
    if (sp && into) { confine(into, null); gl.setRenderTarget(into); }
    if (this.highlight.glowing) this.glowFx.run(gl, into, cam, this.scene, dpr);   // (the picked vessel's glow: its mask, blurred, over the figure outside it)
    if (into) { if (dof || band) this.post.dof.run(gl, into); gl.setRenderTarget(null); this.post.resolve(gl); }
    lap('render: glow, blur, resolve');
    gl.autoClear = ac;
    cam.layers.mask = mask;
    inspectEnd?.();
  },
  /** The organ veil's two strengths now, each 0..1 of its maximum: the vessels' veil and the organs' show-through (render reads them; tests/dive-nothing-switches.test.ts steps them). */
  veilNow(dof = false): [number, number] {
    const share = ORGAN_VEIL.on && !this.split && !dof ? veilShare(this.fadeNow, this.lastFade) : 0, z = this.rig.zoomOverWhole;
    return share > 0 ? [vesselZoomK(z) * share, seeZoomK(z) * share] : [0, 0];
  },
  /** A twin's picture drawn into the render target the page's scene shares, confined to `region` (docs/approved/split-orbit.md): the organs,
   *  then the vessels over cleared depth; no glow, no blur, no resolve (the page's scene does those once). */
  drawShared(gl: WebGLRenderer, into: WebGLRenderTarget, region: Region, dpr: number): void {
    if (!this.rig.placed) return;
    this.shared.dpr.value = dpr; this.blood.shared.dpr.value = dpr; this.disease.organs.setDpr(dpr); MICRO_DPR.value = dpr;
    const cam = this.rig.camera, mask = cam.layers.mask, ac = gl.autoClear;
    gl.setClearColor(this.clearColor(true));
    confine(into, region); gl.setRenderTarget(into);
    gl.autoClear = true; cam.layers.set(0);
    gl.render(this.scene, cam);
    gl.autoClear = false; gl.clearDepth(); gl.clearStencil();
    cam.layers.set(VESSEL_LAYER);
    gl.render(this.scene, cam);
    gl.autoClear = ac; cam.layers.mask = mask;
    confine(into, null); gl.setRenderTarget(into);
  },
  dispose(): void {
    this.disposed = true; for (const e of this.eases) e.dispose();
    this.unJoins();
    for (const k of [...this.inspectMarks.keys()]) this.putInspectMarks(k, null);
    this.sutures?.dispose();
    this.skins?.dispose();
    this.circuitSkins?.dispose();
    this.micro?.sinus.dispose(); this.micro?.lobule.dispose();
    this.lens.dispose();
    this.cells.dispose();
    this.disease.dispose();
    this.blood.streams.texture.dispose();
    this.blood.chain.texture.dispose();
    this.blood.routes.texture.dispose();
    for (const o of this.objects) o.dispose();
    this.procs.dispose(); this.probes.dispose();
    this.organMap.dispose(); resetOrganVeil();
    this.tubes.dispose(); this.resistors.dispose(); this.post.dispose(); this.glowFx.dispose(); this.organGlowFx.dispose();
  },
});
export type RenderPart = typeof renderPart;
