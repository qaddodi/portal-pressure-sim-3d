// B5 (procedures, catheters, balloons, stents): the eleven Procedures tiles of the Treat card. Each row is claimed while the Treat card has the tile (procedures(), the table the card renders from, with the
// 2D words) and `wired` only while the whole path of the 2D tile is there: the order does what 2D's does to the patient (the params the engine reads, or the engine's own action), and the thing it makes is
// DRAWN on the figure by the scene from that state, as 2D draws it (2D's Treat plays no animation: it edits the settings and the figure shows the result; the catheters' moves are the Tests card's and the slides').
//   Band (EVL)          the engine's `band` action; the frame's count of bands is drawn as platinum rings on the varices (ProcedureLayer.syncBands)
//   Balloon tamponade   params.balloonGas / balloonEso; the tube and its two balloons, marker bands and traction arrow (ProcedureLayer.syncTamponade)
//   TIPS, DIPS          params.tips / dips; the shunt vessel and its stent on it (ProcedureLayer.addStent, syncStents); the vessel's card carries the stent editor (registerPanel('stent'))
//   BRTO                params.occluded.C5; the engine closes the gastrorenal shunt and the figure stops drawing it; the card's own switch undoes it
//   Paracentesis        2D selects the abdomen, which opens the Ascites instrument (selectStructure); its Drain sends the engine's `paracentesis`
//   the five shunts     the params the 2D table sets; each shunt is a vessel of the network, drawn while the engine gives it a diameter (the Meso-Rex bypass under the portal tree)
import { procedures, SURGICAL } from '../ui/treat/orders.ts';
import { actionLabel } from '../ui/action/send.ts';
import { cardFor } from '../ui/action/cards.ts';
import { BUILT_PANES } from '../ui/tests/panes.ts';
import { ProcedureLayer } from '../scene/procedures/layer.ts';
import { NETWORK_BY_ID } from '../scene/vessels/network.ts';
import { rowId, type Claim } from './claim.ts';

const layer = ProcedureLayer.prototype;
const has = (f: unknown) => typeof f === 'function';
/** The shunt's own card lists the stent editor (registered by boot.ts, which imports the panel: tests/b9-stent.test.ts reads both). */
const stentEditor = (id: string) => !!cardFor({ type: 'edge', id })?.verbs.some((v) => v.type === 'panel');
/** Per tile id (orders.ts): is what it makes drawn on the figure by code that is in the app? */
const drawn: Record<string, () => boolean> = {
  band: () => actionLabel({ kind: 'band' }) !== '' && has(layer.syncBands),
  balloon: () => has(layer.syncTamponade),
  tips: () => NETWORK_BY_ID.has('TIPS') && has(layer.addStent) && has(layer.syncStents) && stentEditor('TIPS'),
  dips: () => NETWORK_BY_ID.has('DIPS') && has(layer.addStent) && has(layer.syncStents) && stentEditor('DIPS'),
  brto: () => NETWORK_BY_ID.has('C5'),
  paracentesis: () => (BUILT_PANES as readonly string[]).includes('abdomen') && actionLabel({ kind: 'paracentesis', mL: 1000 }) !== '',
};
for (const s of SURGICAL) drawn[s.id] = () => NETWORK_BY_ID.has(s.edge);

export const claims: readonly Claim[] = procedures()
  .filter((x) => x.id in drawn)
  .map((x) => ({ id: rowId('treat', `procedure/${x.label}`), wired: drawn[x.id]!() }));
