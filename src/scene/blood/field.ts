// What the vessels' shader reads of the blood: the streams' texture (distance, display speed, reversed flag per edge) and the projection scale the heads'
// size follows (a head is 4 to 8 CSS px wide wherever the camera is). The scene steps it from its update(); nothing here loops.
import type { Texture } from 'three';
import { Streams } from './streams.ts';
import { StreamChain } from './chain.ts';
import { dustTuner } from './dust.ts';
import { StreamRoutes } from './routes.ts';

export interface BloodShared { streamTex: { value: Texture }; chainTex: { value: Texture }; /** the dust's lanes and roots through the network (routes.ts) */ routeTex: { value: Texture }; projY: { value: number }; /** device pixels to a CSS pixel: the vessels' line is set in CSS px and converted with it (cel-ink.ts) */ dpr: { value: number }; /** how much of the streak layer shows (the streaks are part of the tube, vessels/shaders.ts): the cells layer's eased amount, set by blood/cells/cells.ts */ streakAmt: { value: number }; /** the dust's numbers, one vec4 array every vessel reads (dust.ts, dust-glsl.ts) */ dustP: { value: Float32Array } }

export class BloodField {
  readonly streams = new Streams();
  /** The parcels carried through junctions (chain.ts): each vessel's heads run on from its parent's. */
  readonly chain = new StreamChain();
  /** The dust's routes (routes.ts): which root's particles each lane of a vessel carries, so a particle runs on through every junction. */
  readonly routes = new StreamRoutes();
  readonly shared: BloodShared = { streamTex: { value: this.streams.texture }, chainTex: { value: this.chain.texture }, routeTex: { value: this.routes.texture }, projY: { value: 1 }, dpr: { value: 1 }, streakAmt: { value: 0 }, dustP: dustTuner.uniform };
}
