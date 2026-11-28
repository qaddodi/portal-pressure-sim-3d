// An edge as a reader holds it: the predicates below read one or two fields, so a partial edge (an id and a kind) is enough.
export type EdgeLike = Partial<NetEdge>;
// Types for topology.js (hand-checked against `tsc --declaration` of it). The graph (NODES, EDGES) is the base graph cut at the junction table, built once at load.
import type { JunctionRow } from './junctions.js';
export type { JunctionRow } from './junctions.js';
export type NetNode = {
    id: string;
    label: string;
    P: number;
    C: number;
    ext: string;
    kind: string;
    junction?: string;
};
export type NetEdge = {
    id: string;
    from: string;
    to: string;
    kind: string;
    label?: string;
    Q?: number;
    tone?: string;
    d?: number;
    vd?: number;
    lobar?: string;
    R?: number;
    lobe?: string;
    zone?: string;
    G?: number;
    role?: string;
    w?: string;
    route?: [string, string];
    dMax?: number;
    Ropen?: number;
    dMinRatio?: number;
    code?: string;
    open?: number;
    variant?: boolean;
    spontaneous?: boolean;
    systemic?: boolean;
    shunt?: string;
    len?: number;
    portal?: boolean;
    bedP?: number;
    part?: string;
    share?: number;
    clot?: boolean;
    junction?: string;
};
export declare const NODES: NetNode[];
export declare const EDGES: NetEdge[];
/** The table's rows as tuples [node, host, at, label, ends]: the shape the app's readers had before the rows were objects (they move to JUNCTION_ROWS; this view goes when none is left). */
export declare const JUNCTIONS: (readonly [node: string, host: string, at: number, label: string, ends: [string, 'from' | 'to'][]])[];
/** The junction table: one row per node a shunt, collateral or tributary meets a host vein at (junctions.js). */
export declare const JUNCTION_ROWS: readonly JunctionRow[];
/** The ids of the pieces a host is cut into, from its `from` end, for each host that is cut (a vein that is whole is not a key). */
export declare const JUNCTION_PIECES: Record<string, string[]>;
/** For a piece: its host's id (a vein cut in pieces is one vein: a name given to it reaches every piece, and its clot or narrowing is read on it). */
export declare const PART_OF: Record<string, string>;
/** For a cut vein: [the node its whole course starts at, the node it ends at]. */
export declare const JUNCTION_HOST_ENDS: Record<string, [string, string]>;
/** How each cut host is made: { host, ids (the pieces in order), nodes (the junction nodes between consecutive pieces), at (their share of the vein's length), taps (per junction: [shunt id, +1 | -1], +1 into the junction) }. */
export declare const JUNCTION_CHAINS: { host: string; ids: string[]; nodes: string[]; at: number[]; taps: [string, 1 | -1][][] }[];
/** The host vein of an edge: its own id, or the vein it is a piece of (a vein with a shunt joining it part-way along is split into pieces). */
export declare const partOf: (id: string) => string;
export declare const SHUNT_PORTAL: string[];
export declare const SHUNT_SYSTEMIC: string[];
export declare const LIVER_STENT_FROM: string[];
export declare const LIVER_STENT_TO: string[];
export declare const isLiverStent: (e: EdgeLike | undefined) => boolean;
export declare const isCoveredStent: (e: EdgeLike | undefined) => boolean;
export declare const stentCourse: (e: NetEdge) => string;
export declare const customShuntId: (p: string, q: string) => string;
export declare const SHUNT_PORTAL_VEINS: string[];
/** A custom shunt between two portal-system veins (its blood never leaves the portal system). */
export declare const isPortalLink: (e: EdgeLike | undefined) => boolean;
export declare const COLLATERAL_DMIN_RATIO: number;
/** How far the periportal collaterals (C8, the cavernoma's route) are open the day a portal trunk clots, as the engine shows it: recruitFrac = (D - dMin)/(dMax - dMin) at the acute preset
 *  (COLLATERAL.acuteClot opens the small preformed veins at once, to hold the portal vein near 30 mmHg). It is not a cavernoma: that forms over weeks, on the disease clock, above this floor.
 *  The figure draws the cavernoma's extra channels only from recruitment above it. The app's tests/pathology-spec.test.ts reads the acute preset and fails if this value drifts from it. */
export declare const ACUTE_CLOT_RECRUITMENT = 0.27;
/** Resting (unrecruited) diameter of a collateral; a route may set its own ratio (dMinRatio). */
export declare const dMinOf: (e: NetEdge) => number;
/** Whether a collateral exists in this patient: a spontaneous shunt only when present, an
 *  anatomical variant unless absent, any other collateral always. */
/** BRTO plugs the shunt (outflow) and the short gastric feeder (inflow) of the fundal varices.
 *  Isolated fundal varices (IGV1) have no communication with the coronary vein: the coronary-to-oesophageal route (C1a) and its run on to the azygos (C1b)
 *  are shut for as long as the gastrorenal shunt (C5) is open; plugging the shunt (BRTO) lets them recruit again, as `occluded.C1a` shuts them by hand. */
export declare const isOccluded: (p: any, id: string) => boolean;
/** Whether a placed device (a stent, a surgical shunt, a shunt of the learner's own) is in the patient: the params key that places it (params.tips.on, params.dsrs,
 *  params.customShunts[id]…). Every other edge is in the patient whatever the params say (its own flow, or its variant, is edgePresent's business). */
export declare const deviceInPlace: (e: EdgeLike, p: any) => boolean;
export declare const edgePresent: (e: EdgeLike, p: any) => boolean;
export declare const TARGETS: {
    MAP: number;
    CO_Lmin: number;
    RA: number;
    IVC: number;
    FHVP: number;
    HVPG: number;
    PV: number;
    hepaticFlow_Lmin: number;
    pvFlow_Lmin: number;
    haFlow_Lmin: number;
};
/** The coronary vein a Warren shunt ties off, and its station: they read "—", not a pressure (7 Nov: nothing flows in it, and the stomach drains by the short gastric veins). */
export declare const tiedOff: (p: any, id: string) => boolean;
export declare const PORTAL_TERRITORY: Set<string>;
export declare const PORTOSYSTEMIC_EDGES: string[];
export declare const SPLANCHNIC_ARTERIES: string[];
export declare const STENT_DOPPLER_K = 3.4;
export declare const dopplerK: (e: EdgeLike | undefined) => number;
export declare const STENT_SITES: {
    proximal: number;
    mid: number;
    distal: number;
};
export declare const isStent: (e: EdgeLike | undefined) => boolean;
export declare const stentSite: (p: any, id: any) => "distal" | "proximal";
export declare const tightSite: (p: any, id: any) => "distal" | "mid" | "proximal";
export declare const STENT_SPANS: {
    proximal: number[];
    mid: number[];
    distal: number[];
};
export declare const stentGate: (gate: any, p: any, id: any) => any;
export declare const STENT_GRADIENT: {
    proximal: number;
    mid: number;
    distal: number;
};
export declare const stentSegments: (v: any, s?: number, site?: string, out?: null, g?: null) => null;
/** A stent's three gate velocities from params: its end stenosis (stenosis × thrombus) at its end, its waist and its geometry, for the stent `id`. */
export declare const stentReadsOf: (params: any, id: any, v: any, out?: null) => null;
/** An edge by its id (a map made on the first ask, once every edge, the drawn stents' included, is in EDGES). */
export declare const edgeById: (id: string) => NetEdge | undefined;
