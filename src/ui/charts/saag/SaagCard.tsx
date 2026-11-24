import { useMemo } from 'react';
import { Chart } from '../Chart.tsx';
import { saagFrame } from './frame.ts';
import { pointsOf, readingOf, saagWords, type Row } from './model.ts';
import '../charts.css';

/** The SAAG plane for a slide: the slide's patients (rows with their fingerprints) as points, the one the slide is about in full ink, and what it reads. */
export function SaagCard({ rows, extra = [], own = null, room = 0 }: { rows: readonly Row[]; extra?: { id?: string; name: string; saag: number; tp: number }[]; own?: string | null; room?: number }) {
  const pts = useMemo(() => pointsOf(rows, extra, own), [rows, extra, own]);
  const o = pts.find((p) => p.own), read = o ? readingOf(o.saag, o.tp) : null, whys = !o && pts.length > 1;
  const key = pts.map((p) => `${p.name}:${p.saag.toFixed(1)}:${p.tp.toFixed(1)}:${p.own ? 1 : 0}`).join(',');
  return (
    <div className="pz-saag">
      <Chart tag="chart:saag" deps={[key, read, room, whys]} label={saagWords(pts)} build={(c) => saagFrame(pts, c, { read, room, whys })} />
    </div>
  );
}
