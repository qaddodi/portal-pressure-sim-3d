// The lite figure: a calmer figure for a machine that cannot run the full one (a software renderer, a browser with no GPU, a very old phone). Same app,
// same numbers; the figure draws at 1x, at about 20 frames a second,
// with no glass blur, no organ shade, no depth of field, tilt, living fluid or device shadows (docs/approved/lite-figure.md). It is chosen by
// the device when it can tell (boot/webgl.ts softwareRenderer, FrameProbe
// below) and the person can turn it on or off in Settings > Display; a person's choice is never undone by the device.
//
// The switches it quiets are the person's own choices and are kept as they are: `withLite` is the view the figure reads while lite is on, and turning lite off gives the person's own values back.

/** The figure's switches that lite turns off while it stands (the person's own values are kept underneath). */
export const LITE_KEYS = ['blur', 'organDepth', 'tilt', 'dof', 'fluidSurface', 'deviceShadow'] as const;
export type LiteKey = (typeof LITE_KEYS)[number];
export type LiteOwn = Record<LiteKey, boolean>;

/** Who turned lite on or off: the device (chosen for this device) or the person (Settings). Null: nobody yet, the device may still decide. */
export type LiteBy = 'device' | 'person' | null;
export const liteBy = (v: unknown): LiteBy => (v === 'device' || v === 'person' ? v : null);

/** The switches as the figure reads them: all off while lite stands, the person's own otherwise. */
export function withLite(own: LiteOwn, lite: boolean): LiteOwn {
  if (!lite) return { ...own };
  const out = { ...own };
  for (const k of LITE_KEYS) out[k] = false;
  return out;
}

/** The frame rate lite aims for: one frame in this many ms (about 20 a second). Between 15 and 20 a second reads as calm motion on a slow machine and leaves it room to breathe. */
export const LITE_FRAME_MS = 50;
/** Lite draws at this pixel ratio, never more. */
export const LITE_DPR = 1;

/** The renderer's own name says there is no GPU behind it (WEBGL_debug_renderer_info). Names seen on Chrome, Edge, Firefox and Safari without a graphics card or driver. */
const SOFTWARE_NAMES = /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render|microsoft basic|warp\b|mesa offscreen|gdi generic/i;
export const isSoftwareRenderer = (name: string | null | undefined): boolean => typeof name === 'string' && SOFTWARE_NAMES.test(name);

/** The first frames of the first figure: when the first five average over this many ms, the machine cannot keep up and the device picks lite (a laptop with a GPU draws these in 16 to 40 ms). */
export const SLOW_FIRST_MS = 250;
/** Five frames, timed from the one before each (so the first frame is the starting line). */
export const PROBE_FRAMES = 5;
/** A gap longer than this is a pause (a hidden tab, a long task before the figure), not a slow frame: the count starts again. */
export const PROBE_PAUSE_MS = 5000;

/**
 * Judges the first five drawn frames of the figure. `note(t)` takes the page time of each drawn frame; it answers true (too slow), false (fine) or null
 * (not yet). Pure: Stage feeds it the clock's times.
 */
export class FrameProbe {
  private last = -1; private n = 0; private sum = 0; done = false;
  note(t: number): boolean | null {
    if (this.done) return null;
    const dt = this.last < 0 ? -1 : t - this.last;
    this.last = t;
    if (dt < 0) return null;
    if (dt > PROBE_PAUSE_MS) { this.n = 0; this.sum = 0; return null; }
    this.n++; this.sum += dt;
    if (this.n < PROBE_FRAMES) return null;
    this.done = true;
    return this.sum / this.n > SLOW_FIRST_MS;
  }
}
