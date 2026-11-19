// The engine's public face for the rest of the app. Import from here, not from ./hales or ./host.
export { bootEngine, engine, SLICE_PRESET } from './boot.ts';
export { useEngine, latest, live, holdFrame, patient, onFrame } from './store.ts';
export type { HealthyRef } from './store.ts';
export { VesselData, indexOf, hasVessel, EDGE_IDS, EDGE_COUNT, fillVesselData } from './vessel-data.ts';
export type { EngineFrame, Metrics, ToWorker, FromWorker } from './protocol.ts';
