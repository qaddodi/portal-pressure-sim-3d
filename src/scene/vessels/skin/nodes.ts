// The nodes whose junctions get a skin once every phase is on (a leaf file: shape.ts reads it to fit a thin branch's end, and inventory.ts, which imports shape.ts, re-exports it).
export const PHASE_2_NODES: ReadonlySet<string> = new Set(['CONF', 'PVT_L', 'SV', 'PVH', 'HA', 'CV_R', 'SIN_R', 'SIN_L', 'IVCI', 'SVC_E', 'SVC', 'IVCS']);
