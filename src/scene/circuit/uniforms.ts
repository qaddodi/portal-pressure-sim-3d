import { DataTexture, FloatType, NearestFilter, RGBAFormat, Vector2, Vector3 } from 'three';
import { MAP_CENTRE } from './map.ts';
import { N_TRACK } from './course.ts';

/** Uniforms every vessel shares for the morph (shader.ts): the change's eased share, the map's turn, its centre, and the track texture. */
export interface CircuitShared {
  circT: { value: number };
  /** 2D's circBoost, by the zoom (map.ts circBoostOf): the map's lines are drawn wider when it is zoomed out */
  circBoost: { value: number };
  circRot: { value: Vector2 };
  circM: { value: Vector3 };
  circTrack: { value: DataTexture };
  circTrackSize: { value: Vector2 };
}

/** The track texture: N samples wide, two rows to a vessel that needs one (how far each sample stands from the plain lerp, then the centreline's direction). */
export function createTrackTexture(rows: number): DataTexture {
  const t = new DataTexture(new Float32Array(N_TRACK * Math.max(2, rows) * 4), N_TRACK, Math.max(2, rows), RGBAFormat, FloatType);
  t.minFilter = t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

export function createCircuitShared(rows: number): CircuitShared {
  return {
    circT: { value: 0 },
    circBoost: { value: 1 },
    circRot: { value: new Vector2(1, 0) },
    circM: { value: new Vector3(MAP_CENTRE.x, MAP_CENTRE.y, MAP_CENTRE.z) },
    circTrack: { value: createTrackTexture(rows) },
    circTrackSize: { value: new Vector2(N_TRACK, Math.max(2, rows)) },
  };
}
