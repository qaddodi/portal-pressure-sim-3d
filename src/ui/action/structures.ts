// The structure kinds the 2D app's card gallery lists (Structure cards: each kind's card and its Details face), and the selection each stands for in the 3D app's catalogue.
// The 2D gallery's own list is not in the 2D checkout the app is built from, so the kinds are the inventory's ids (parity/inventory.json, card:structure/*) and the structure
// each opens is the one the name says (a "collateral-umbilical" is C3, the paraumbilical vein). `reach` says how a person gets to it in the scene: a tap on the figure and the keyboard walk.
import { NETWORK_BY_ID } from '../../scene/vessels/network.ts';
import type { Sel } from './selection.ts';
import { LOBULE_NEAR, LOBULE_TAP, ORGAN_TAP } from './tap-map.ts';
import { cardFor } from './cards.ts';
import { detailsFor } from './details.ts';
import { labelHit } from './label-tap.ts';
import { STATIONS } from '../../scene/labels/stations.ts';

const edge = (id: string): Sel => ({ type: 'edge', id });
const organ = (id: string): Sel => ({ type: 'organ', id });
const lobule = (part: string): Sel => ({ type: 'lobule', part });

/** In the gallery's order. */
export const STRUCTURES: readonly { id: string; sel: Sel }[] = [
  { id: 'portal-vein', sel: edge('PV_TRUNK') }, { id: 'mesenteric-vein', sel: edge('SMV_CONF') }, { id: 'splenic-vein', sel: edge('SV_CONF') },
  { id: 'hepatic-vein', sel: edge('RHV_IVC') }, { id: 'ivc', sel: edge('IVCS_RA') }, { id: 'hepatic-artery', sel: edge('A_HEP') },
  { id: 'small-artery', sel: edge('A_HR') }, { id: 'liver-bed', sel: edge('SIN_RR') }, { id: 'valve', sel: edge('V_LOW') },
  { id: 'collateral-varix', sel: edge('C1a') }, { id: 'collateral-umbilical', sel: edge('C3') }, { id: 'collateral-gastrorenal', sel: edge('C5') },
  { id: 'shunt-surgical', sel: edge('S_PC') }, { id: 'shunt-rex', sel: edge('REX') }, { id: 'shunt-crossing', sel: edge('X_SMV_RHV') },
  { id: 'tips', sel: edge('TIPS') }, { id: 'tips-offered', sel: edge('TIPS') }, { id: 'dips', sel: edge('DIPS') },
  { id: 'organ-liver', sel: organ('liver') }, { id: 'organ-heart', sel: organ('heart') }, { id: 'organ-varices', sel: organ('varices') },
  { id: 'organ-gastric', sel: organ('gastric') }, { id: 'organ-spleen', sel: organ('spleen') },
  { id: 'lobule-zone1', sel: { type: 'lobule', zone: 1 } }, { id: 'lobule-zone2', sel: { type: 'lobule', zone: 2 } }, { id: 'lobule-zone3', sel: { type: 'lobule', zone: 3 } },
  { id: 'lobule-sinusoid', sel: lobule('sin') }, { id: 'lobule-central-vein', sel: lobule('cv') }, { id: 'lobule-triad', sel: lobule('triad') },
  { id: 'lobule-artery', sel: lobule('ha') }, { id: 'lobule-bile-duct', sel: lobule('bd') },
];

/** Whether a station's label (the figure's names for its stations: a tap on one opens what it stands for, label-tap.ts) is the way to this structure: the varices and the fundus have no mesh to tap. */
export const labelReaches = (sel: Sel): boolean => STATIONS.some((s) => {
  const h = s.kind !== 'organ' && s.node ? labelHit(s.node) : null;
  return !!h && h.type === sel.type && 'id' in sel && h.id === sel.id;
});

/** Whether a tap on the figure (and the keyboard walk) reaches this structure now: a vessel the scene draws, an organ it picks or whose station's label opens it, a lobule part the lobule view picks. */
export function reachable(sel: Sel): boolean {
  if (sel.type === 'edge') return NETWORK_BY_ID.has(sel.id);
  if (sel.type === 'organ') return Object.values(ORGAN_TAP).includes(sel.id) || labelReaches(sel);
  if (sel.type === 'lobule') return sel.zone ? 'cords' in LOBULE_TAP : [...Object.values(LOBULE_TAP), ...Object.values(LOBULE_NEAR)].includes(sel.part ?? '');
  return false;
}

export interface StructureRow { id: string; card: boolean; details: boolean; /** a card whose name is plain text, as 2D's lobule parts: its "-details" specimen in the gallery is the card itself */ plain: boolean; reach: boolean }
/** What the app has for each kind: a card, a Details face, and a way to it from the figure. */
export const structureRows = (): StructureRow[] => STRUCTURES.map((s) => ({ id: s.id, card: !!cardFor(s.sel), details: !!cardFor(s.sel) && !cardFor(s.sel)!.noDetails && !!detailsFor(s.sel), plain: !!cardFor(s.sel)?.noDetails, reach: reachable(s.sel) }));
