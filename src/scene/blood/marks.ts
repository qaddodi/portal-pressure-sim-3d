// Moving blood: which vessels carry chevrons and how strongly. The four flow-mark styles (A to D, look-and-feel.md section 11) decide what a vessel
// shows; the Blood menu then gates it: chevrons off shows none, "key chevrons only" keeps the portal story (blood.js keyChevron), and a vessel that
// is not drawn (a closed collateral) carries none. Mark amounts fade at the highlight's 180 ms, so nothing pops.
import type { CelObject } from '../materials/cel.ts';
import { DEFAULT_FLOW_MODE, FLOW_FADE_MS, type FlowMarkMode, PULSE_MS, targetAmount } from '../flow.ts';
import { EDGES } from '../../engine/hales/portal/topology.js';

/** The vessels that keep their chevrons under "Key chevrons only" (blood.js KEY_CHEV_IDS): the portal inflow, the hepatic veins, the liver's beds. */
export const KEY_CHEV_IDS: ReadonlySet<string> = new Set(['V_INT', 'V_COL', 'V_IMV', 'V_SPL', 'SV_MID', 'V_STO', 'SMV_CONF', 'SV_CONF', 'LGV_CONF', 'PV_TRUNK_1', 'PV_TRUNK', 'PVH_R', 'PVH_R_1', 'PVH_R_2', 'PVH_L', 'PVH_L_1', 'V_INT_1', 'RHV_IVC', 'RHV_IVC_1', 'MHV_IVC', 'LHV_IVC']);
/** A vein that carries an open collateral's blood on keeps its chevrons while that collateral is open (the azygos beside the ascending lumbar collateral). */
export const KEY_CHEV_LANES: Readonly<Record<string, readonly string[]>> = { AZY_SVC: ['C9'] };

const kindOf = new Map((EDGES as { id: string; kind: string }[]).map((e) => [e.id, e.kind]));

/** Whether vessel `id` keeps its chevrons under Key chevrons only; `open(id)`: whether a collateral is drawn open. */
export function keyChevron(id: string, open: (id: string) => boolean = () => false): boolean {
  const kind = kindOf.get(id);
  if (KEY_CHEV_IDS.has(id) || kind === 'liver' || kind === 'collateral' || kind === 'shunt') return true;
  return (KEY_CHEV_LANES[id] ?? []).some(open);
}

export interface BloodOptions { chevrons: boolean; keyChevrons: boolean; presenting: boolean }

/** What fraction of a vessel's marks the style and the menu allow (0..1), before fading. */
export function markGoal(mode: FlowMarkMode, named: boolean, pulse: number, o: BloodOptions, key: boolean, drawn: boolean): number {
  if (!o.chevrons || !drawn) return 0;
  const base = targetAmount(mode, named, pulse);
  return o.keyChevrons || o.presenting ? (key ? base : 0) : base;
}

interface Track { obj: CelObject; id: string; named: boolean; amount: number; key: boolean; drawn: boolean }

export class BloodMarks {
  mode: FlowMarkMode = DEFAULT_FLOW_MODE;
  options: BloodOptions = { chevrons: true, keyChevrons: false, presenting: false };
  private tracks = new Map<string, Track>();
  private pulseStart = -Infinity;
  private pulseUntil = -Infinity;

  constructor(vessels: readonly CelObject[]) {
    for (const o of vessels) if (o.edge) this.tracks.set(o.edge.id, { obj: o, id: o.edge.id, named: false, amount: 0, key: keyChevron(o.edge.id), drawn: true });
  }

  setMode(mode: FlowMarkMode): void { this.mode = mode; }
  setOptions(o: Partial<BloodOptions>): void { this.options = { ...this.options, ...o }; }
  setNamed(ids: Iterable<string>): void { const s = new Set(ids); for (const t of this.tracks.values()) t.named = s.has(t.id); }
  /** The scene says which vessels are drawn now (a closed collateral is not), and which collaterals are open, for the key rule. */
  setDrawn(drawn: (id: string) => boolean, open: (id: string) => boolean): void {
    for (const t of this.tracks.values()) { t.drawn = drawn(t.id); t.key = keyChevron(t.id, open); }
  }
  /** Option D: a change happened. */
  trigger(nowMs: number): void { this.pulseStart = nowMs; this.pulseUntil = nowMs + PULSE_MS; }

  /** Fades each vessel's marks toward its goal. Returns true while marks are showing or fading. */
  step(nowMs: number, dtMs: number): boolean {
    const pulse = nowMs >= this.pulseUntil ? 0 : Math.min(1, (this.pulseUntil - nowMs) / 1000, (nowMs - this.pulseStart) / FLOW_FADE_MS);
    const k = Math.min(1, dtMs / FLOW_FADE_MS);
    let active = false;
    for (const t of this.tracks.values()) {
      const goal = markGoal(this.mode, t.named, pulse, this.options, t.key, t.drawn);
      t.amount = Math.abs(goal - t.amount) <= k ? goal : t.amount + Math.sign(goal - t.amount) * k;
      t.obj.setFlow(t.amount, this.mode === 'C');
      if (t.amount > 0.001) active = true;
    }
    return active;
  }
}
