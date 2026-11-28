import { Chart } from '../Chart.tsx';
import { pendingFrame } from '../pending.ts';
import { traceFrame, type TraceSpec } from './frame.ts';
import { talkHeight, milesHeight, type TalkPoint } from './model.ts';
import '../charts.css';

/**
 * The course on one chart (2D: tool { kind: 'trace', range: 'talk' }, talk-trace.js): the portal, wedged and free hepatic pressures at every state of the talk so far, one point each.
 * chain: the states up to the slide (talkChain(...) in ./model.ts, or talkChainOf in ./data.ts: each { n, title, tick, mile?, when, day, fp, params }). bands: the treatments the slide
 * shades (tool.bands: 'carvedilol', 'tips' …). gap: the name of the band between PV and WHVP (tool.gap, e.g. 'clot'). style: 'milestones' draws the HVPG alone (tool.style).
 * height: the box's height; leave it out for the height the chart wants. A new chain glides in from the old one.
 */
export function TraceCard({ chain, bands = null, gap = null, style = null, cited = null, height }: { chain: readonly TalkPoint[] } & Omit<TraceSpec, 'pts'>) {
  const pts = chain.filter((p) => p.fp);
  const label = style === 'milestones' ? 'HVPG over the talk so far' : 'Pressures over the talk so far';
  const memo = `trace|${style ?? ''}`;
  const empty = (c: { w: number; type: { sm: number } }) => {
    const W = Math.max(160, c.w);
    return pendingFrame(memo, c.w, height ?? (style === 'milestones' ? milesHeight([], W, c.type.sm) : talkHeight([], W, c.type.sm)), label);
  };
  return (
    <div className="pz-talk">
      <Chart
        tag="chart:trace" memo={memo} label={label} deps={[chain, bands?.join(), gap, style, cited?.join(), height]}
        build={(c) => (pts.length ? traceFrame({ pts, bands, gap, style, cited, height }, c) : empty(c))}
      />
    </div>
  );
}
