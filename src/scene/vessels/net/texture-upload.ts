// The partial upload of a data texture (the edge-state and the bone tables). three allocates a data texture's storage at its FIRST upload (zeros) and then writes ONLY the update ranges when it has any: a range added before that first
// upload (a frame's state changes land between the figure's construction and its first draw) leaves every other row of the table ZERO, so every vessel has no radius, no presence, no bones, and the whole figure draws nothing.
// Ranges are therefore added only once three has uploaded the texture once (`onUpdate`); until then the whole table is still pending and one full upload covers every write.
import type { DataTexture } from 'three';

/** The `flush` of a table's texture: marks it for upload, with the range [start, start + count) once the first upload has happened. */
export function rangedUpload(t: DataTexture): (start: number, count: number) => void {
  let uploaded = false;
  t.onUpdate = () => { uploaded = true; };
  return (start, count) => {
    if (uploaded) t.addUpdateRange(start, count);
    t.needsUpdate = true;
  };
}
