// Live edits while dragging (the editor only). An organ built with the loaded edit L is shown with the draft N by one transform of its meshes, G = N after L inverse, about the
// organ's reference centre: the same arithmetic as organ-apply.ts (scale, turn about Y, move), so what shows is what Save will build. Liquify strokes are not in it: they go into the geometry (strokes.ts).
import type { OrganEdit, V3 } from '../../../editor/types.ts';
import { clampEdit } from '../../../editor/organ-apply.ts';

export interface LiveTransform { position: V3; rotY: number; scale: number }
const NONE: LiveTransform = { position: [0, 0, 0], rotY: 0, scale: 1 };

/** Vertices (3 numbers each) as the mesh shows them under the transform: scale, then the turn about Y, then the position (three's order). */
export function throughTransform(pos: ArrayLike<number>, t: LiveTransform): Float32Array {
  const out = new Float32Array(pos.length), cs = Math.cos(t.rotY), sn = Math.sin(t.rotY);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i]! * t.scale, y = pos[i + 1]! * t.scale, z = pos[i + 2]! * t.scale;
    out[i] = x * cs + z * sn + t.position[0]; out[i + 1] = y + t.position[1]; out[i + 2] = -x * sn + z * cs + t.position[2];
  }
  return out;
}
/** The mesh transform (a three Object3D's position, rotation.y, scale) that turns the organ built with `loaded` into the organ the draft `now` describes. */
export function liveTransform(loaded: OrganEdit | undefined, now: OrganEdit | undefined, c: V3): LiveTransform {
  const l = clampEdit(loaded ?? {}), n = clampEdit(now ?? {});
  const s = n.scale / l.scale, a = n.rotY - l.rotY, cs = Math.cos(a), sn = Math.sin(a);
  if (s === 1 && a === 0 && n.move.every((v, i) => v === l.move[i])) return NONE;
  // p_N = A'(p_L - c - m_L) + c + m_N with A' = s R(a), so as a transform of p_L: position = c + m_N - A'(c + m_L)
  const x = c[0] + l.move[0], z = c[2] + l.move[2];
  return {
    position: [c[0] + n.move[0] - (x * cs + z * sn) * s, c[1] + n.move[1] - s * (c[1] + l.move[1]), c[2] + n.move[2] - (-x * sn + z * cs) * s],
    rotY: a, scale: s,
  };
}
