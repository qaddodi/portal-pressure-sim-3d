// The sinusoid view (batch B8): public face. Shared parts (model targets, wash timing, tones, shots) live in ../lobule/. See docs/lobule-sinusoid.md.
export { SinusoidView, diveShare } from './view.ts';
export type { SinusoidViewOptions } from './view.ts';
export { sinusoidTargets } from '../lobule/model.ts';
export { sinusoidShot, sinusoidBox, SINUSOID_L, SINUSOID_ORIGIN } from '../lobule/shots.ts';
export { SINUSOID_PARTS } from '../lobule/parts.ts';
export type { SinusoidPartName } from '../lobule/parts.ts';
export { PORTRAIT_ANGLE, acrossUm, shownUm, endsFor, isPortrait, restScale } from './portrait.ts';
