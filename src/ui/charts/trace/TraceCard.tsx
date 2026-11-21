import { useContext } from 'react';
import { Chart } from '../Chart.tsx';
import { ToolRoom } from '../../talk/tool-room.ts';
import { traceFrame, type TraceSpec } from './frame.ts';
import type { TalkPoint } from './model.ts';
import '../charts.css';

/**
 * The course on one chart (2D: tool { kind: 'trace', range: 'talk' }, talk-trace.js): the portal, wedged and free hepatic pressures at every state of the talk so far, one point each.
 * chain: the states up to the slide (talkChain(...) in ./model.ts, or talkChainOf in ./data.ts: each { n, title, tick, mile?, when, day, fp, params }). bands: the treatments the slide
 * shades (tool.bands: 'carvedilol', 'tips' …). gap: the name of the band between PV and WHVP (tool.gap, e.g. 'clot'). style: 'milestones' draws the HVPG alone (tool.style).
 * height: the box's height; leave it out for the height the chart wants. A new chain glides in from the old one.
 */
export function TraceCard({ chain, bands = null, gap = null, style = null, height }: { chain: readonly TalkPoint[] } & Omit<TraceSpec, 'pts'>) {
  const room = useContext(ToolRoom);
  const pts = chain.filter((p) => p.fp);
  if (!pts.length) return null;
  const label = style === 'milestones' ? 'HVPG over the talk so far' : 'Pressures over the talk so far';
  return (
    <div className="pz-talk">
      <Chart tag="chart:trace" deps={[chain, bands?.join(), gap, style, height, room]} label={label} build={(c) => traceFrame({ pts, bands, gap, style, height, room }, c)} />
    </div>
  );
}
