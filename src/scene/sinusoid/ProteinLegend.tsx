// The sinusoid's one legend: a dot in the albumin's colour and the word "Protein", at the top left under the view's name pill (2D: sinusoid-view.js legend, layoutEnds: lx = free.l + 2, ly = top inset + 12;
// its look is 2D's own .sv-legend rule, copied with the rest of 2D's CSS). It stands only while the sinusoid is the view, goes with it, and is never over the names: they keep below it in a portrait room.
import { useEffect, useRef } from 'react';
import { clock } from '../../clock/frame.ts';
import { BAR } from '../../ui/layout/plan.ts';
import { useUi } from '../../ui/ui-store.ts';
import { cel } from '../api.ts';
import { Vector3 } from 'three';
import { sinusoidWorld } from '../lobule/frames.ts';
import { FACE_UM, legendBox, legendOn } from './legend.ts';
import { framePoint } from './portrait.ts';
import { U } from './view.ts';
import { namesFree } from './captions.ts';

export function ProteinLegend() {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = el.current!;
    let tx = '', op = '', mw = '';
    const v3 = new Vector3(), pt = { x: 0, y: 0 }, f3: [number, number, number] = [0, 0, 0];
    /** where the hepatocytes' face on the left of a tall sinusoid lands on the screen (CSS px) */
    const faceX = () => { const w = sinusoidWorld(framePoint(0, FACE_UM, U, cel.sinus.turn, f3)); cel.rig.project(v3.set(w[0], w[1], w[2]), pt); return pt.x; };
    const tick = () => {
      const on = legendOn(cel.view, cel.sinus.group.visible);
      const { vp } = useUi.getState();
      const free = namesFree(cel.rig.targetRoom, { w: vp.w, h: vp.h });
      const b = legendBox(free, (vp as { safe?: { top: number } }).safe?.top ?? 0, BAR, cel.sinus.isPortrait ? faceX() - 8 : vp.w - 12);
      const t = `translate(${b.x}px, ${b.y}px)`, o = on ? '1' : '0', m = `${b.maxW}px`;
      if (t !== tx) { tx = t; root.style.transform = t; }
      if (o !== op) { op = o; root.style.opacity = o; }
      if (m !== mw) { mw = m; root.style.maxWidth = m; }
    };
    const off = clock.on('tags', tick, 1);
    const wake = () => clock.invalidate('sinusoid-legend');
    const offUi = useUi.subscribe(wake);
    wake();
    return () => { off(); offUi(); };
  }, []);
  // (inside a layer of its own, the same as the names': the one coordinate space the figure's words stand in)
  return <div className="lb-layer cc-layer sv-layer" aria-hidden="true"><div ref={el} className="sv-legend" style={{ opacity: 0 }}><span><i className="alb" />Protein</span></div></div>;
}
