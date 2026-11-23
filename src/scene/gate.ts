// The one place a scene object's `visible` follows an EASED amount (never a boolean that flips): `visible` only says "there is something to draw", and the something is faded by its own weight (a shader alpha, a
// uniform, a tween). Below `floor` the weight is under one 8-bit step, so the object leaves the draw list unseen; above it the object is drawn at its weight, which glides, so nothing pops.
// A scene object shown or hidden by a raw `.visible =` is counted by scripts/visible-ratchet.mjs and may not rise (tests/device-presence.test.ts); a new one goes through here, or through DeviceObject.show / setAlpha.
/** Draws `o` while its eased `amount` is above `floor` (default under one 8-bit step); returns whether it is drawn. */
export function gate(o: { visible: boolean }, amount: number, floor = 0.001): boolean {
  const on = amount > floor;
  if (o.visible !== on) o.visible = on;
  return on;
}
