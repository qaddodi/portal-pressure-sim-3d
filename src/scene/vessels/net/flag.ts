// `?geom=net` (WP4): the vessels drawn from the skeleton's network meshes (net/network-object.ts) instead of the tubes and skins. Off by default: with no flag the scene builds and draws exactly what it did before, and no byte of net/ is fetched or run.
// The page flag is read once through the debug flag table (ui/debug/flags.ts: gate 'local', so the preview copy and a local run only, never the live site).
import { flagValue } from '../../../ui/debug/flags.ts';

/** Whether the address asks for the network vessels. A test passes its own search string. */
export const geomNet = (search?: string): boolean => flagValue('geom', search ?? undefined) === 'net';

// ---- THE TEMPORARY HAND-OVER (plan owner, "Rulings on WP2 (50664a4d)", 3) -----------------------------------------------------------------------------------------------------------------------------------------------
// The Circuit's change (junction peel) does not yet pass for the network mesh, so under ?geom=net the switch to the Circuit draws TODAY'S tubes and skins: over the first `NET_HANDOVER_T` of the change's t the old figure comes in by the
// screen dither (materials/shaders.ts SCREEN_DITHER_GLSL, the pattern the old program's own fades use) while the network mesh goes out by the complementary pattern, so every pixel is drawn by exactly one of them and the hand-over shows nothing;
// on the way back it is the same thing reversed. THIS STEP IS TEMPORARY: it goes the day the junction-peel fix passes (then `oldShare` is 0 for every t and this file's hand-over with it), it exists only behind ?geom=net, and it must never
// reach the default (tests/net-wiring.test.ts holds the old path byte-for-byte unchanged without the flag).
export const NET_HANDOVER_T = 0.1;
/** The share of the OLD figure drawn at the Circuit's change `t` under ?geom=net: 0 at rest, 1 from `NET_HANDOVER_T` on, a smoothstep between (the same easing the old program's own fades use: nothing snaps). The network mesh draws the complement. */
export function oldShare(t: number): number {
  const x = Math.min(1, Math.max(0, t / NET_HANDOVER_T));
  return x * x * (3 - 2 * x);
}
