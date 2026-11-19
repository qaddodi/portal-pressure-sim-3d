// The quintic smoothstep the 2D app calls easeMove (src/ui/ease.js there), for a change of patient.
export const easeMove = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (6 * t - 15) + 10));
