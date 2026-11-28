// The junction table: where a shunt, a collateral or a tributary meets a host vein part-way along it, and how the engine cuts the graph there.
//
// (15 Nov 2026, Mohammad: "the TIPS starts in the middle of the right portal vein and ends in the middle of the right hepatic vein, but the blood behaves as if it
// runs to the END of the portal vein, jumps into the TIPS and comes out at the START of the hepatic vein". Root cause: a shunt's ends were nodes, and a node is where a
// vein ENDS, so a stent drawn onto the middle of a vein took its blood from the vein's far end and gave it back at the vein's near end. This table does it for every
// vein that a shunt or collateral is drawn onto.)
//
// Each row puts a node on its host vein at `at` (0 to 1 of the drawn course from the host's `from`), cuts the host there into vessels in series and joins the shunt or
// collateral end that is drawn there to the new node, so the engine solves the cut graph itself (27 Nov 2026): the node is a real node with its own pressure, each piece
// a real vessel with its own flow, drop, direction, origin and dye, and the shunt is driven by the pressure where it really leaves or joins the vein.
// A junction's resting pressure is interpolated along the host from its start (`bedP` on the host: where it leaves an organ's bed, else its `from` node's) to its `to`
// node's, so each piece's calibrated resistance is its share of the host's. That is exact where the joiner carries no blood at rest; where it does (the coronary vein
// carries 1.6 mL/s into the portal trunk) the pieces take the host's resting flow and the settled readings move by a few tenths of a mmHg, as the readings of the cases
// that have one do (engine-numbers report, 27 Nov).
//
// THE ONE SOURCE (27 Nov 2026, Mohammad: "the flow lens, pressure, flow direction and everything else must know where vessel junctions really are"): this table is the only
// place a take-off is placed. The app's drawing cuts each host at `at` and lands each listed end there; moving a take-off is an edit here. The `at` values were read off
// the placed 3D network on 27 Nov. test/junction-table.mjs holds the table's rules.

/**
 * @typedef {{
 *   node: string,                           the junction's node id
 *   host: string,                           the vein it is on (an edge id of the uncut graph)
 *   at: number,                             0 to 1 along the host's drawn course from its `from` node
 *   label: string,
 *   short: string,                          the node's short name in a stent's course ("RPV → RHV", topology.js stentCourse)
 *   ends: [string, 'from' | 'to'][],        the shunt or collateral ends that meet the host here
 *   clotOn: 'first' | 'last',               which piece of the host (in order from its `from` node) a clot or a narrowing of the host sits on; every row of a host agrees
 * }} JunctionRow
 */

/** @type {readonly JunctionRow[]} */
export const JUNCTION_ROWS = Object.freeze([
  { node: 'RPV_T', host: 'PVH_R', at: 0.407, label: 'Right portal vein (where the TIPS leaves it)', short: 'RPV', ends: [['TIPS', 'from']], clotOn: 'first' },
  { node: 'RHV_T', host: 'RHV_IVC', at: 0.529, label: 'Right hepatic vein (where the TIPS joins it)', short: 'RHV', ends: [['TIPS', 'to']], clotOn: 'last' },
  { node: 'LRV_S', host: 'V_KID_L', at: 0.42, label: 'Left intrarenal veins (where the splenorenal shunts join them)', short: 'LRV', ends: [['C6', 'to'], ['S_DSR', 'to']], clotOn: 'first' },
  { node: 'IVC_P', host: 'IVC_IS', at: 0.135, label: 'IVC (where the portocaval shunt joins it)', short: 'IVC', ends: [['S_PC', 'to']], clotOn: 'last' },
  { node: 'IVC_D', host: 'IVC_IS', at: 0.604, label: 'IVC (where the DIPS joins it)', short: 'IVC', ends: [['DIPS', 'to']], clotOn: 'last' },
  { node: 'IVC_C', host: 'IVC_IS', at: 0.079, label: 'IVC (where the ascending lumbar veins leave it)', short: 'IVC', ends: [['C9', 'from']], clotOn: 'last' },
  { node: 'ILI_R', host: 'ILI_IVC', at: 0.47, label: 'Common iliac veins (where the retroperitoneal veins join them)', short: 'ILI', ends: [['C7', 'to']], clotOn: 'first' },
  { node: 'IVC_M', host: 'ILI_IVC', at: 0.814, label: 'IVC (where the mesocaval shunt joins it)', short: 'IVC', ends: [['S_MC', 'to']], clotOn: 'first' },
  { node: 'SMV_R', host: 'V_INT', at: 0.318, label: 'Mesenteric veins (where the retroperitoneal veins leave them)', short: 'SMV', ends: [['C7', 'from']], clotOn: 'first' },
  { node: 'SV_S', host: 'V_SPL', at: 0.456, label: 'Splenic vein (where the spontaneous splenorenal shunt leaves it)', short: 'SVD', ends: [['C6', 'from']], clotOn: 'last' },
  { node: 'SVC_E', host: 'SVC_RA', at: 0.532, label: 'SVC (where the epigastric veins join it)', short: 'SVC', ends: [['EPI_SVC', 'to']], clotOn: 'last' },
  { node: 'PVT_L', host: 'PV_TRUNK', at: 0.384, label: 'Portal vein (where the coronary vein joins it)', short: 'PV', ends: [['LGV_CONF', 'to']], clotOn: 'last' },
  { node: 'LPV_U', host: 'PVH_L', at: 0.28, label: 'Left portal vein (where the paraumbilical vein leaves it)', short: 'LPV', ends: [['C3', 'from']], clotOn: 'first' },
  { node: 'LPV_X', host: 'PVH_L', at: 0.426, label: 'Left portal vein (where the Meso-Rex bypass joins it)', short: 'LPV', ends: [['REX', 'to']], clotOn: 'first' },
  { node: 'LPV_A', host: 'PVH_L', at: 0.64, label: 'Left portal vein (where the arterioportal shunt joins it)', short: 'LPV', ends: [['AP_L', 'to']], clotOn: 'first' },
  { node: 'RPV_A', host: 'PVH_R', at: 0.2, label: 'Right portal vein (where the arterioportal shunt joins it)', short: 'RPV', ends: [['AP_R', 'to']], clotOn: 'first' },
]);

/** A junction node's compliance (mL/mmHg): a hair, so a node on a vein holds no blood worth the circulation's volume (the systemic numbers do not move). */
const JUNCTION_C = 0.05;

/**
 * Cuts the graph at the table's rows. Pure: the arrays and edges it is given are not changed; it returns new ones.
 * The piece ids: `host` for the piece that keeps the host's id (the one the vein's own readings, Doppler and labels mean) and `host_<n>` for the others, in order from the
 * host's `from` node. The keeper is the end of the vein the shunts were listed at (read before the table moves them): the last piece where they join its `from` node
 * (the TIPS into the hepatic vein's start, the DIPS into the cava's), the first where they join its `to` node. A clot or a narrowing sits on the piece the row's `clotOn`
 * names (`clot: true` on that piece), and adds the whole host's resistance there (engine.js computeG).
 * @param {readonly any[]} baseNodes @param {readonly any[]} baseEdges @param {readonly JunctionRow[]} rows
 */
export function cutGraph(baseNodes, baseEdges, rows) {
  const nodes = baseNodes.map((n) => ({ ...n }));
  let edges = baseEdges.map((e) => ({ ...e }));
  /** @type {Record<string, string[]>} */ const pieces = {};
  /** @type {Record<string, string>} */ const partOf = {};
  /** @type {Record<string, [string, string]>} */ const hostEnds = {};
  const chains = [];
  const listedEnds = new Map(edges.map((e) => [e.id, [e.from, e.to]]));
  const byHost = new Map();
  for (const r of rows) { if (!byHost.has(r.host)) byHost.set(r.host, []); byHost.get(r.host).push(r); }
  const pos = (id) => nodes.find((n) => n.id === id);
  for (const [host, list] of byHost) {
    list.sort((a, b) => a.at - b.at);
    const hi = edges.findIndex((e) => e.id === host);
    if (hi < 0) throw new Error(`Junction host ${host} is not an edge`);
    const h = edges[hi], n = list.length + 1;
    for (const r of list) if (!(r.at > 0 && r.at < 1)) throw new Error(`Junction ${r.node}: at ${r.at} must lie inside ${host} (use the host's own node for an end)`);
    const clotOn = new Set(list.map((r) => r.clotOn));
    if (clotOn.size !== 1 || ![...clotOn][0] || !['first', 'last'].includes([...clotOn][0])) throw new Error(`Junctions on ${host}: every row must name the same clotOn, 'first' or 'last' (${[...clotOn]})`);
    const listed = new Set(list.flatMap((r) => r.ends.map(([sid, end]) => { const s = edges.find((e) => e.id === sid); return s ? s[end] : null; })));
    if (listed.size !== 1 || ![h.from, h.to].includes([...listed][0])) throw new Error(`Junctions on ${host}: the shunts must all be listed at one end of it (${[...listed]})`);
    const keeper = [...listed][0] === h.to ? 0 : n - 1;
    const clotAt = [...clotOn][0] === 'first' ? 0 : n - 1;
    const ids = Array.from({ length: n }, (_, i) => (i === keeper ? host : `${host}_${i < keeper ? i + 1 : i}`));
    const stops = [h.from, ...list.map((r) => r.node), h.to], cuts = [0, ...list.map((r) => r.at), 1];
    const a = pos(h.from), b = pos(h.to);
    const P0 = h.bedP ?? a.P, kind = a.kind === 'bed' ? b.kind : a.kind;
    for (const r of list) nodes.push({ id: r.node, label: r.label, P: P0 - r.at * (P0 - b.P), C: JUNCTION_C, ext: a.ext, kind, junction: host });
    const cutPieces = ids.map((id, i) => ({ ...h, id, from: stops[i], to: stops[i + 1], part: host, share: cuts[i + 1] - cuts[i], ...(i === clotAt ? { clot: true } : {}) }));
    edges.splice(hi, 1, ...cutPieces);
    pieces[host] = ids;
    hostEnds[host] = [h.from, h.to];
    for (const id of ids) partOf[id] = host;
    const taps = list.map(() => []);
    list.forEach((r, i) => {
      for (const [sid, end] of r.ends) {
        const s = edges.find((e) => e.id === sid);
        if (!s) throw new Error(`Junction ${r.node}: no shunt ${sid}`);
        s[end] = r.node; s.junction = r.node;
        taps[i].push([sid, end === 'to' ? 1 : -1]);
      }
    });
    chains.push({ host, ids, nodes: list.map((r) => r.node), at: list.map((r) => r.at), taps });
  }
  return { nodes, edges, pieces, partOf, hostEnds, chains, listedEnds };
}
