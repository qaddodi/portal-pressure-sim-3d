// What the figure shows of the patient's disease, as numbers: the same rules as the 2D figure (stage-diaphragm.js updateOrgans and easeLiver,
// stage-tubes.js, stage-clamps.js, varix-look.js), read from the engine's frame and parameters. Pure: no three.js, so the tests run it for every preset.
// The 2D rules that carry a memory (a held step, a breath low-pass, an ease) live in follow.ts; this file is the raw target each of them chases.
import { NODES } from '../../engine/hales/portal/topology.js';
import { clamp } from './copied/num.js';
import { varixSize } from './copied/varix-look.js';
import { liverShrink, liverSurface } from './copied/liver-morph.js';
import { fluidLevel, poolFade } from './copied/fluid-step.js';

const NI: Record<string, number> = Object.fromEntries((NODES as unknown as { id: string }[]).map((n, i) => [n.id, i]));

/** The engine frame fields this file reads (EngineFrame has them; the host's frame carries `slow`, `bleed` and `bands` beside the typed ones). */
export interface DiseaseFrame {
  P: ArrayLike<number>; Pf?: ArrayLike<number>;
  slow?: { spleen?: number; ascites?: number };
  bleed?: { active?: boolean; site?: string | null; total?: number; G?: number; clot?: number };
  bands?: number;
  metrics?: { varix?: { d?: number }; gastricVarix?: { d?: number }; bleeding?: { rate?: number } } & Record<string, unknown>;
}
/** The patient's parameters this file reads (scenario.js defaultParams). */
export interface DiseaseParams {
  cirrhosis?: number; splenicRx?: number; thrombus?: Record<string, number>; stenosis?: Record<string, number>; occluded?: Record<string, boolean>;
  spontaneous?: Record<string, boolean>; dips?: { on?: boolean };
}

export interface BodyTargets {
  /** cirrhosis 0..1 (params.cirrhosis, held to 1) */
  cirrhosis: number;
  /** congestion 0..1, the rise of the hepatic veins' pressure over the healthy patient's, (cvUp - 4) / 10 (stage-diaphragm.js easeLiver) */
  congestion: number;
  /** the dusk the congested liver takes, 0..0.5, from the sinusoidal pressure: clamp((psin - 8) / 16) * 0.5 */
  tint: number;
  liverScale: number;
  /** the spleen's scale about its centre: slow.spleen / 11 */
  spleenScale: number;
  /** 0 none, 1 partial embolization (the lower part fades), 2 splenectomy (the organ is a ghost, 14% of itself) */
  splenicRx: 0 | 1 | 2;
  /** ascites volume, mL, and how high the pool stands (fluid-step.js) */
  ascites: number;
  /** each varix's size 0 (a resting vein) .. 1 (full), from the model's own varix and gastricVarix diameters */
  varix: { VAR: number; GV: number };
  thrombus: Record<string, number>;
  bleed: { active: boolean; site: 'VAR' | 'GV'; rate: number; total: number };
  /** whole bands on the oesophageal varices (the count drawn follows it in a moment) */
  bands: number;
}

export const SPLEEN_BASE_ML = 11;
export const SPLENIC_GHOST = 0.14;

/** The 2D figure's raw targets for one frame. `healthyP` is the healthy patient's node pressures (the congestion is the rise over them). */
export function bodyTargets(f: DiseaseFrame, p: DiseaseParams, healthyP: ArrayLike<number> | null): BodyTargets {
  const PA = f.Pf ?? f.P;
  const psin = Math.max(PA[NI.SIN_R]!, PA[NI.SIN_L]!);
  const hp = healthyP;
  const cvUp = hp ? Math.max(PA[NI.CV_R]! - hp[NI.CV_R]!, PA[NI.CV_L]! - hp[NI.CV_L]!) : 0;
  const c = Math.min(1, p.cirrhosis ?? 0), g = clamp((cvUp - 4) / 10, 0, 1);
  const m = f.metrics ?? {};
  return {
    cirrhosis: c, congestion: g, tint: clamp((psin - 8) / 16, 0, 1) * 0.5,
    liverScale: liverShrink(c, g),
    spleenScale: (f.slow?.spleen ?? SPLEEN_BASE_ML) / SPLEEN_BASE_ML,
    splenicRx: (p.splenicRx === 2 ? 2 : p.splenicRx === 1 ? 1 : 0),
    ascites: f.slow?.ascites ?? 0,
    varix: { VAR: varixSize('VAR', m.varix?.d as number), GV: varixSize('GV', m.gastricVarix?.d as number) },
    thrombus: { ...(p.thrombus ?? {}) },
    bleed: { active: !!f.bleed?.active, site: f.bleed?.site === 'GV' ? 'GV' : 'VAR', rate: m.bleeding?.rate ?? 50, total: f.bleed?.total ?? 0 },
    bands: f.bands ?? 0,
  };
}


/** How full the bleed's pool is (0..1) for the blood lost so far: a puddle at once, full by 1.5 L (blood.js poolFill). */
export const poolFill = (total: number): number => Math.min(1, Math.max(0.12, Math.sqrt(Math.max(0, total || 0) / 1500)));

export { liverSurface };
