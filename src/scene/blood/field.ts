// What the vessels' shader reads of the blood: the streams' texture (distance, display speed, reversed flag per edge) and the projection scale the heads'
// size follows (a head is 4 to 8 CSS px wide wherever the camera is). The scene steps it from its update(); nothing here loops.
import type { Texture } from 'three';
import { Streams } from './streams.ts';

export interface BloodShared { streamTex: { value: Texture }; projY: { value: number } }

export class BloodField {
  readonly streams = new Streams();
  readonly shared: BloodShared = { streamTex: { value: this.streams.texture }, projY: { value: 1 } };
}
