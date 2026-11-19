// The fixed frame the morph builds a tube's section in: given the centreline's direction T, N is the world axis least along T made square to it, B = T x N. Written here as the shader
// writes it (shader.ts circFrameN), so the CPU can encode a vertex in it and the GPU can place it again.
export type V3 = readonly [number, number, number];

export function frameN(T: V3): [number, number, number] {
  const ref: V3 = Math.abs(T[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const d = ref[0] * T[0] + ref[1] * T[1] + ref[2] * T[2];
  const x = ref[0] - T[0] * d, y = ref[1] - T[1] * d, z = ref[2] - T[2] * d, l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}
export const cross = (a: V3, b: V3): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A vertex's offset from the centre (in units of the radius) in the frame of direction T: [along N, along B, along T]. */
export function encode(off: V3, T: V3): [number, number, number] {
  const N = frameN(T), B = cross(T, N);
  return [dot(off, N), dot(off, B), dot(off, T)];
}
/** The offset again, for a direction T. */
export function decode(fr: V3, T: V3): [number, number, number] {
  const N = frameN(T), B = cross(T, N);
  return [fr[0] * N[0] + fr[1] * B[0] + fr[2] * T[0], fr[0] * N[1] + fr[1] * B[1] + fr[2] * T[1], fr[0] * N[2] + fr[1] * B[2] + fr[2] * T[2]];
}
