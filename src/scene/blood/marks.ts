// Moving blood: which vessels carry the 2D app's flow heads. The Blood menu gates it: chevrons off shows none, "key chevrons only" keeps the portal story (blood.js keyChevron), and a vessel that
// is not drawn (a closed collateral) carries none. Amounts fade at the highlight's 180 ms, so nothing pops.
import type { CelObject } from '../materials/cel.ts';
import { FLOW_FADE_MS } from '../flow.ts';
import { EDGES } from '../../engine/hales/portal/topology.js';

/** The vessels that keep their chevrons under "Key chevrons only" (blood.js KEY_CHEV_IDS): the portal inflow, the hepatic veins, the liver's beds. */
export const KEY_CHEV_IDS: ReadonlySet<string> = new Set(['V_INT', 'V_COL', 'V_IMV', 'V_SPL', 'SV_MID', 'V_STO', 'SMV_CONF', 'SV_CONF', 'LGV_CONF', 'PV_TRUNK_1', 'PV_TRUNK', 'PVH_R', 'PVH_R_1', 'PVH_R_2', 'PVH_L', 'PVH_L_1', 'V_INT_1', 'RHV_IVC', 'RHV_IVC_1', 'MHV_IVC', 'LHV_IVC']);
/** A vein that carries an open collateral's blood on keeps its chevrons while that collateral is open (the azygos beside the ascending lumbar collateral). */
export const KEY_CHEV_LANES: Readonly<Record<string, readonly string[]>> = { AZY_SVC: ['C9'] };

const kindOf = new Map((EDGES as { id: string; kind: string }[]).map((e) => [e.id, e.kind]));

/** Whether vessel `id` keeps its chevrons under Key chevrons only; `open(id)`: whether a collateral is drawn open. */
export function keyChevron(id0: string, open: (id: string) => boolean = () => false): boolean {
  // (a branch drawn as a tributary of a vein (`PVH_R_2~F:b`, the liver branches; `C3~F:caput`) carries its vein's blood and is its vein's story: it is not an engine edge, so asking the tables for it by its own name found nothing and it lost its chevrons under "Key chevrons only" and in a presentation; Mohammad, 20 Nov)
  const id = id0.includes('~F') ? id0.slice(0, id0.indexOf('~F')) : id0;
  const kind = kindOf.get(id);
  if (KEY_CHEV_IDS.has(id) || kind === 'liver' || kind === 'collateral' || kind === 'shunt') return true;
  return (KEY_CHEV_LANES[id] ?? []).some(open);
}

/** `quiet`: a procedure is on the figure (the HVPG, TIPS, BRTO, EUS, a shunt's surgery…): no chevrons and no streaks while it runs (Mohammad, 20 Nov), easing out as it starts and back as it ends. */
export interface BloodOptions { chevrons: boolean; keyChevrons: boolean; presenting: boolean; quiet?: boolean }

/** Whether a vessel carries heads (1) or not (0), before fading: the 2D app has one style of flow head and the Blood menu's two choices (Chevrons, Key
 *  chevrons only, which is always on while presenting); a vessel that is not drawn (a closed collateral) carries none. */
export function markGoal(o: BloodOptions, key: boolean, drawn: boolean): number {
  if (!o.chevrons || !drawn || o.quiet) return 0;
  return o.keyChevrons || o.presenting ? (key ? 1 : 0) : 1;
}

interface Track { obj: CelObject; id: string; amount: number; key: boolean; drawn: boolean }

export class BloodMarks {
  options: BloodOptions = { chevrons: true, keyChevrons: false, presenting: false };
  private tracks = new Map<string, Track>();

  constructor(vessels: readonly CelObject[]) {
    for (const o of vessels) if (o.edge) this.tracks.set(o.edge.id, { obj: o, id: o.edge.id, amount: 0, key: keyChevron(o.edge.id), drawn: true });
  }

  /** Whether vessel `id` is drawn now: it takes part in the parcels carried through junctions (chain.ts) whether or not the Blood menu shows its heads, as in the 2D app. */
  carriesHeads(id: string): boolean { return this.tracks.get(id)?.drawn ?? false; }

  setOptions(o: Partial<BloodOptions>): void { this.options = { ...this.options, ...o }; }
  /** The scene says which vessels are drawn now (a closed collateral is not), and which collaterals are open, for the key rule. */
  setDrawn(drawn: (id: string) => boolean, open: (id: string) => boolean): void {
    for (const t of this.tracks.values()) { t.drawn = drawn(t.id); t.key = keyChevron(t.id, open); }
  }

  /** Fades each vessel's heads toward its goal at the highlight's 180 ms (the 2D app's 0.15 s). Returns true only while a fade runs: heads moving along a vessel are the streams' business (streams.ts). */
  step(dtMs: number): boolean {
    const k = Math.min(1, dtMs / FLOW_FADE_MS);
    let active = false;
    for (const t of this.tracks.values()) {
      const goal = markGoal(this.options, t.key, t.drawn);
      if (t.amount !== goal) {
        t.amount = Math.abs(goal - t.amount) <= k ? goal : t.amount + Math.sign(goal - t.amount) * k;
        t.obj.setFlow(t.amount, false);
        active = true;
      }
    }
    return active;
  }
}
