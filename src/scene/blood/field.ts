// What the vessels' shader reads of the blood: the streams' texture (distance, display speed, reversed flag per edge) and the projection scale the heads'
// size follows (a head is 4 to 8 CSS px wide wherever the camera is). The scene steps it from its update(); nothing here loops.
import type { Texture } from 'three';
import { Streams } from './streams.ts';
import { StreamChain } from './chain.ts';

export interface BloodShared { streamTex: { value: Texture }; chainTex: { value: Texture }; projY: { value: number }; /** device pixels to a CSS pixel: the vessels' line is set in CSS px and converted with it (cel-ink.ts) */ dpr: { value: number }; /** how much of the streak layer shows (the streaks are part of the tube, vessels/shaders.ts): the cells layer's eased amount, set by blood/cells/cells.ts */ streakAmt: { value: number } }

export class BloodField {
  readonly streams = new Streams();
  /** The parcels carried through junctions (chain.ts): each vessel's heads run on from its parent's. */
  readonly chain = new StreamChain();
  readonly shared: BloodShared = { streamTex: { value: this.streams.texture }, chainTex: { value: this.chain.texture }, projY: { value: 1 }, dpr: { value: 1 }, streakAmt: { value: 0 } };
}
