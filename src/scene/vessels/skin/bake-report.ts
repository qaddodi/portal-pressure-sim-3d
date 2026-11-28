// What a skin bake says about itself (J6 and J8, 28 Nov review), so that nobody has to infer it from the meshes: per skin, the seams that stand inside rule 1's
// full clearance (cuts.ts CLEAR_SLACK, recorded on the cut as `slack`), the nodes it merged, the vessels it hides whole and the growing arms it dropped; and any
// bounded loop of the planner that ran out of rounds (`unsettled`). scripts/bake-skins.mjs prints it; tests/skin-bake-report.test.ts pins it.
import type { BakedSkins } from './baked.ts';

/** One seam that stands inside the full clearance: its skin, its vessel and end, its ring and the share of the clearance kept. */
export interface SlackSeam { node: string; vesselId: string; end: 0 | 1; ring: number; slack: number }

/** A skin made of more than one node: planSkins' crowd merge (`merged`) or joinUncuttable's (a `+` in its node). */
const isMerged = (p: BakedSkins['skins'][number]['plan']): boolean => !!p.merged || p.junction.node.includes('+');

/** Every seam of the baked skins that was cut under slack (none: every skin's seams kept the full clearance). */
export function slackSeams(b: BakedSkins): SlackSeam[] {
  return b.skins.flatMap((s) => s.plan.cuts.filter((c) => c.slack !== undefined).map((c) => ({ node: s.plan.junction.node, vesselId: c.vesselId, end: c.end, ring: c.ring, slack: c.slack! })));
}

/** The bake's report, one line each: a header with the counts, one line per skin that merged, hides a vessel or used slack, the dropped arms, the lost nodes and the loops that did not settle. */
export function bakeReport(b: BakedSkins, label = 'skins'): string[] {
  const out: string[] = [];
  const slack = slackSeams(b), unsettled = b.unsettled ?? [];
  const merged = b.skins.filter((s) => isMerged(s.plan)).length;
  const counts = [
    `${b.skins.length} skins`, `${slack.length} seam(s) under clearance slack`, `${merged} merged`,
    `${b.dropped.length} arm(s) dropped`, `${b.lost.length} lost`, `${unsettled.length} loop(s) not settled`,
  ];
  out.push(`${label}: ${counts.join(', ')}`);
  for (const s of b.skins) {
    const p = s.plan, mine = slack.filter((x) => x.node === p.junction.node);
    if (!isMerged(p) && !p.hidden.length && !mine.length) continue;
    const bits = [
      ...(isMerged(p) ? [`merged ${(p.merged ?? p.junction.node.split('+')).join('+')}`] : []),
      ...(p.hidden.length ? [`hides ${p.hidden.join(',')}`] : []),
      ...(mine.length ? [`slack ${mine.map((x) => `${x.vesselId}:${x.end} ring ${x.ring} x${x.slack}`).join(', ')}`] : []),
    ];
    out.push(`  ${p.junction.node}: ${bits.join('; ')}`);
  }
  if (b.dropped.length) out.push(`  dropped: ${b.dropped.join(', ')}`);
  for (const l of b.lost) out.push(`  LOST ${l.node}: ${l.message}`);
  for (const u of unsettled) out.push(`  NOT SETTLED: ${u}`);
  return out;
}
