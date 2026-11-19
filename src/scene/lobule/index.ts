// The lobule view (batch B8): public face. See docs/lobule-sinusoid.md.
export { LobuleView, litParts, TERM_PARTS, ZONE_NAMES } from './view.ts';
export type { LobuleLayers, LobuleViewOptions } from './view.ts';
export { buildLobule, zoneOf, hexFrac, N as COURSE_SAMPLES } from './geometry.ts';
export type { Course, LobuleNet, TubeKind } from './geometry.ts';
export { lobuleModel, sinusoidTargets, lymphRate, lymphSeal, lymphProtein, disseProfile, easeToward, LOBE } from './model.ts';
export type { HealthyRef, LobuleFrame, LobuleModel, SinusoidTargets } from './model.ts';
export { washProgress, washFront, washSpan, washAmount, WASH_DELAY_MS, WASH_MS } from './wash.ts';
export { LOBULE_CAMS, LOBULE_ORIGIN, LOBULE_R, LOBULE_T, SINUSOID_L, SINUSOID_ORIGIN, lobuleShot, sinusoidShot, sinusoidBox, lobuleToScene, slabZ } from './shots.ts';
export type { LobuleCam } from './shots.ts';
export { LOBULE_PARTS, SINUSOID_PARTS, PartSet } from './parts.ts';
export type { LobulePartName, SinusoidPartName } from './parts.ts';
export { lobuleHit, lobuleSel } from './pick.ts';
export type { LobuleHit } from './pick.ts';
export { useLobulePick } from './pick-store.ts';
export { LOBULE_PALETTES, extendPalette, EXTRA_TONES } from './tones.ts';
