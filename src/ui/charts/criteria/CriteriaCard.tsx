import { Fragment, useMemo } from 'react';
import { Chart } from '../Chart.tsx';
import { criteriaCaseHead, criteriaGauge, criteriaHasCase, criteriaMet, criteriaReading, criteriaRows, cutParts, keyLine, verdictParts, type Row } from './rows.ts';
import { ZONES, zonesFrame } from './zones.ts';
import type { Fingerprint } from '../fmt.ts';
import { fadeAttrs } from '../../fade.tsx';
import '../charts.css';

export interface CriteriaTool {
  rows?: unknown; title?: string; lead?: string; rule?: string; ticks?: boolean; ordered?: boolean; verdict?: string; key?: unknown[]; zones?: keyof typeof ZONES | string;
}

const bold = (parts: string[]) => parts.map((t, i) => (i % 2 ? <b key={i}>{t}</b> : <Fragment key={i}>{t}</Fragment>)).filter((x) => x.key !== null);

function Cut({ r }: { r: Row }) {
  const c = cutParts(r.cut);
  if (!c) return <span className="pzc-c" aria-hidden="true" />;
  // (hidden from a screen reader when the row's words say the same; a second condition is only here, so it is read)
  return <span className="pzc-c" {...(r.and ? {} : { 'aria-hidden': true })}>{c.sign ? <span className="pzc-s">{c.sign}</span> : null}{c.num}{c.unit ? <span className="pzc-u">{c.unit}</span> : null}{r.and ? <span className="pzc-and">+ {r.and}</span> : null}</span>;
}

function End({ r, ticks, fp }: { r: Row; ticks: boolean; fp: Fingerprint | null | undefined }) {
  if (r.key) {
    const t = criteriaReading(r, fp);
    return <span className="pzc-end"><span className="pzc-v">{t}</span>{ticks ? <span className="pzc-m" aria-hidden="true"><i className="y">{r.says ? `${r.says} met ✓` : 'meets it ✓'}</i><i className="n">{r.says ? `${r.says} not met` : 'not met'}</i></span> : null}</span>;
  }
  if (!r.note) return <span className="pzc-end" />;
  const sub = r.met === true ? <span className="pzc-m"><i className="y">meets it ✓</i></span> : r.met === false ? <span className="pzc-m"><i className="n">not met</i></span> : null;
  return <span className="pzc-end pzc-note"><span className="pzc-v">{r.note}</span>{sub}</span>;
}

/** A live row's gauge, on the tile bar's own marks (TilesCard Tile: .pzt-bar > .pzb-track, its band, its tick and its dot): the reading's scale, the side that does not meet the row
 *  shaded, the row's cut-off as a line across the track, and the patient's dot, which eases along the track as a slider or a compare button moves the reading (.pzc-g in the stylesheet).
 *  Hidden from a screen reader: the row's label already reads the number and whether it is met. */
function Gauge({ r, fp }: { r: Row; fp: Fingerprint | null | undefined }) {
  const g = criteriaGauge(r, fp);
  if (!g) return null;
  const state = g.met == null ? 'none' : g.met ? 'yes' : 'no';
  return (
    <span className="pzt-bar pzc-g" data-met={state} aria-hidden="true">
      <span className="pzb-track">
        <span className="pzb-zs"><i className="pzb-z" style={{ left: `${g.fail.left}%`, width: `${g.fail.width}%` }} /></span>
        <i className="pzb-t" style={{ left: `${g.cut}%` }} />
        <i className="pzb-now" {...fadeAttrs(g.now != null)} style={{ translate: `clamp(6px, ${g.now ?? g.cut}%, calc(100% - 6px)) 0` }} />
      </span>
    </span>
  );
}

/** The criteria card: a guideline's rule list (up to four rows, live rows read from the model) or its zones graph, a lead, the rule's source and a verdict. */
export function CriteriaCard({ tool, fp }: { tool: CriteriaTool; fp?: Fingerprint | null }) {
  const rows = useMemo(() => criteriaRows(tool), [tool]);
  const ticks = tool.ticks !== false;
  const hasCase = criteriaHasCase(tool), hasCut = rows.some((r) => r.cut), hasLit = rows.some((r) => r.lit);
  const fig = tool.zones ? ZONES[tool.zones] ?? null : null;
  const keys = (Array.isArray(tool.key) ? tool.key : []).map(keyLine).filter((x): x is NonNullable<typeof x> => !!x);
  const v = verdictParts(tool.verdict);
  const lead = tool.lead?.trim(), rule = tool.rule?.trim();
  const cls = ['pz-crit', !ticks && 'no-ticks', hasCase && 'has-case', hasCut && 'has-cut', hasLit && 'has-lit', tool.ordered && 'ordered', fig && 'has-zones'].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      {(lead || rule) && <div className="pzc-top">{lead && <p className="pzc-lead">{lead}</p>}{rule && <span className="pzc-rule">{rule}</span>}</div>}
      {rows.length > 0 && (
        <ul className="pzc-list" role="list">
          {hasCase && <li className="pzc-row pzc-hrow" aria-hidden="true"><span className="pzc-c" /><span className="pzc-t" /><span className="pzc-end">{criteriaCaseHead(rows)}</span></li>}
          {rows.map((r, i) => {
            const met = r.key ? criteriaMet(r, fp) : r.met;
            const state = r.key ? (met == null ? 'none' : met ? 'yes' : 'no') : met === true ? 'yes' : met === false ? 'no' : undefined;
            return (
              <li key={i} className={r.key ? 'pzc-row pzc-live' : 'pzc-row'} {...(r.lit ? { 'data-lit': '' } : {})} {...(r.note && !r.lit && r.met == null ? { 'data-quiet': '' } : {})}
                {...(state ? { 'data-met': state } : {})}
                {...(r.key ? { 'aria-label': `${r.text}: ${criteriaReading(r, fp)}, ${met == null ? 'no reading' : met ? 'met' : 'not met'}` } : {})}>
                <Cut r={r} />
                <span className="pzc-t">{r.bold ? bold(r.bold) : r.text}</span>
                <End r={r} ticks={ticks} fp={fp} />
                <Gauge r={r} fp={fp} />
              </li>
            );
          })}
        </ul>
      )}
      {fig && <div className="pzc-zones"><Chart tag="chart:criteria" label={tool.title ?? 'Stiffness and platelets zones'} deps={[fig, tool.title, fp?.lsm, fp?.plt]} build={(c) => zonesFrame(fig, c, tool.title ?? 'Stiffness and platelets zones', { lsm: fp?.lsm, plt: fp?.plt })} /></div>}
      {keys.length > 0 && <div className="pzc-key">{keys.map((k, i) => <p key={i} className="pzc-kl">{k.swatch ? <span className="pzc-sw" aria-hidden="true" /> : null}<span>{bold(k.parts)}</span></p>)}</div>}
      {v && <p className="pzc-verdict">{v.bold ? <b>{v.bold}</b> : null}{v.bold ? ' ' : null}{v.rest}</p>}
    </div>
  );
}
