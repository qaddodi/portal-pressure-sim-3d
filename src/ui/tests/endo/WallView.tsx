// Wall mechanics, the Endoscopy tab's second view (2D instruments.js createVarixWall): a cross-section of the esophagus with the varix in its wall, and Laplace's law as readings in the
// same tiles and meter as the scope view. The picture is a frame on the charts' shared GPU drawer (wall.ts, laid out by the 2D wall-geometry.js by the names' ink); the tiles are the 2D markup,
// styled by its rules (wall.copied.css). It follows the model: each frame of the engine draws the picture again where a number moved, and a tile's words change only when they print differently.
import { useEffect, useMemo, useRef } from 'react';
import './endo.css';
import './wall.copied.css';
import { latest, onFrame, useEngine } from '../../../engine/index.ts';
import { NODES } from '../../../engine/hales/portal/topology.js';
import { Chart, useLookId, type ChartCtx } from '../../charts/Chart.tsx';
import type { ChartPainter } from '../../charts/painter.ts';
import type { Frame } from '../../charts/scene.ts';
import { ENDO_WORDS } from '../copied/endo-words.copied.js';
import { createWallGeometry } from '../copied/wall-geometry.copied.js';
import { metricsOf } from '../frame.ts';
import { useSlidePin, pinnedWall } from '../slide/pin.ts';
import { wallFontSize, wallFrame, wallReadings, wallShare, WALL_NOTE, type WallVarix } from './wall.ts';

const W = ENDO_WORDS.wall;
const VAR = (NODES as { id: string }[]).findIndex((n) => n.id === 'VAR');
const none: Frame = { w: 0, h: 0, shapes: [], label: W.aria };

/** A tile's name with its short form for a narrow tile (a name never breaks inside a word). */
const Name = ({ long, short }: { long: string; short: string }) => <dt><span className="wall-long">{long}</span><span className="wall-short">{short}</span></dt>;
const Num = ({ v, unit }: { v: string; unit: string }) => <dd className="endo-num"><span>{v}</span><small>{unit ? ` ${unit}` : ''}</small></dd>;

export function WallView({ square, slide = false }: { square: number; slide?: boolean }) {
  useSlidePin((s) => s.n);   // (a slide's own state: the stress it shows is the settled one, eased as the slide's state changes)
  const json = useEngine((s) => { void s.frames; const v = metricsOf(latest.frame)?.varix; return v ? JSON.stringify(wallReadings(v as WallVarix, slide ? pinnedWall() : NaN)) : ''; });
  const r = useMemo(() => (json ? JSON.parse(json) as ReturnType<typeof wallReadings> : null), [json]);
  const painter = useRef<ChartPainter | null>(null), ctx = useRef<ChartCtx | null>(null);
  const geom = useRef(createWallGeometry()), key = useRef('');
  const look = useLookId();

  const frameNow = (c: ChartCtx, force: boolean): Frame | null => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = latest.frame as any, v = metricsOf(f)?.varix as WallVarix | undefined;
    if (!f || !v) return null;
    const pVar = (f.Pf || f.P)[VAR] as number, share = wallShare(v) as number, size = Math.round(c.w), fs = wallFontSize(c.type.sm);
    const k = [size, fs, c.look, v.r, v.w, v.ptm, v.ratio, pVar, share].map((x) => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : x)).join('|');
    if (!force && k === key.current) return null;
    key.current = k;
    return wallFrame({ v, pVar, share }, size, fs, c.pal, c.look, geom.current).frame;
  };
  useEffect(() => onFrame(() => { const c = ctx.current, p = painter.current; if (!c || !p) return; const fr = frameNow(c, false); if (fr) p.show(fr, false); }), []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { key.current = ''; }, [look, square]);

  return (
    <div className="en-view en-wall" data-view="wall">
      <div className="endo-stage en-stage">
        <div className="en-pic" style={{ ['--en-sq' as string]: `${square}px` }}>
          <Chart tag="endo-wall" painter={painter} deps={[square, look]} label={W.aria} glide={false} build={(c) => { ctx.current = c; return frameNow(c, true) ?? { ...none, w: c.w, h: c.w }; }} />
        </div>
        <span className="endo-pos"><span className="wall-cap">{W.cap}</span>{W.formula}</span>
      </div>
      <div className="en-side chart-side">
        <dl className="endo-read">
          <div className="endo-g wall-law"><dt>{W.lawName}</dt><dd className="wall-formula">{W.formula}</dd></div>
          <div className="endo-stress">
            <Name long={W.stress[0]!} short={W.stress[1]!} />
            <dd className="endo-stress-v">{r?.stress ?? ''}</dd>
            <b className="wall-big" data-sev={r?.state}><span>{r?.pct ?? ''}</span><small>%<span className="wall-of">{W.of}</span></small></b>
            <span className="wall-sev" data-sev={r?.state}>{r?.word ?? ''}</span>
            <span className="endo-bar" aria-hidden="true" data-sev={r?.state}><i style={{ translate: r?.fill }} /></span>
          </div>
          <div className="endo-tile"><Name long={W.dp[0]!} short={W.dp[1]!} /><Num v={r?.ptm ?? ''} unit={W.units[0]!} /></div>
          <div className="endo-tile"><dt>{W.radius}</dt><Num v={r?.r ?? ''} unit={W.units[1]!} /></div>
          <div className="endo-tile"><dt>{W.wall}</dt><Num v={r?.w ?? ''} unit={W.units[2]!} /></div>
          <div className="endo-tile"><Name long={W.index[0]!} short={W.index[1]!} /><Num v={r?.index ?? ''} unit="" /></div>
        </dl>
        <div className="ctl-sub">{WALL_NOTE}</div>
      </div>
    </div>
  );
}
