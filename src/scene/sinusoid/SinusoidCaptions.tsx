// The sinusoid's words over the canvas: the two ends' names with their pressures, the sinusoid, the Kupffer cell, the stellate cell, the fenestrae, the space of Disse, the lymph, the hepatocyte (and the
// bile canaliculus when a slide points at it), in 2D's own layout (sinusoid/names.ts: wide across the screen, tall top to bottom with every name level) and the figure's one label type. They come in once
// the picture is still and go the moment anything moves, as every figure label does; only transform and opacity are written per frame. A tap on one, in a talk, explains it (explain-store.ts).
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import '../labels/labels.css';
import '../circuit/captions.css';
import './names.css';
import { clock } from '../../clock/frame.ts';
import { useSettings } from '../../state/settings.ts';
import { resolveLook } from '../../looks/looks.ts';
import { BAR } from '../../ui/layout/plan.ts';
import { useUi } from '../../ui/ui-store.ts';
import { useShell } from '../../ui/shell/store.ts';
import { cel } from '../api.ts';
import { type Box, leaderGeom, rectToBox } from '../labels/geometry.ts';
import { DIM_ALPHA, labelOpacity } from '../labels/alpha.ts';
import { makeMeasure } from '../labels/LabelLayer.tsx';
import { LS, baselineAt, lineSize, lookVars, nameRun, typeVars, valueRun } from '../labels/type.ts';
import { sinusoidWorld } from '../lobule/frames.ts';
import { SINUSOID_L } from '../lobule/shots.ts';
import { type NamePlacement } from './names.ts';
import { buildSinusoidNames, linesOf, namesOn, placeOf } from './captions.ts';
import { U } from './view.ts';
import { framePoint } from './portrait.ts';
import { setSinusoidPlaced, useSinusoidNames } from './explain-store.ts';

const SETTLE_MS = 180, FADE_MS = 180;
interface El { root: HTMLElement; rows: HTMLElement[]; lead: HTMLElement | null; tx: string; size: string; words: string }

export function SinusoidCaptions() {
  const layer = useRef<HTMLDivElement>(null);
  const look = useSettings((s) => s.look);
  const dark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  const lookId = resolveLook(look, dark);
  const lookRef = useRef(lookId); lookRef.current = lookId;
  const retype = useRef<() => void>(() => {});
  useEffect(() => { retype.current(); }, [lookId]);

  useEffect(() => {
    const root = layer.current!;
    const measure = makeMeasure();
    const els = new Map<string, El>();
    const v3 = new Vector3(), pt = { x: 0, y: 0 }, f3: [number, number, number] = [0, 0, 0];
    let placed: NamePlacement[] = [], sig = '', lastMove = -1e9, lastRefs = '', alpha = 0, last = -1, hold: { release(): void } | null = null;

    const putVars = () => {
      const { vp } = useUi.getState();
      for (const [k, v] of Object.entries({ ...typeVars(vp), ...lookVars(lookRef.current, vp) })) root.style.setProperty(k, v);
      root.style.setProperty('--cc-ink', (LS.LOOKS as Record<string, Record<string, string>>)[lookRef.current]!['text-3']!);
      sig = '';
    };
    putVars();
    retype.current = putVars;
    const offUi = useUi.subscribe((s, p) => { if (s.vp !== p.vp) putVars(); });

    /** a place of the plane (µm along, µm across, y down as the shader has it) on the canvas, CSS px */
    const proj = (x: number, y: number): [number, number] => {
      framePoint(x, y, U, cel.sinus.turn, f3);
      const w = sinusoidWorld(f3);
      cel.rig.project(v3.set(w[0], w[1], w[2]), pt);
      return [pt.x, pt.y];
    };
    const key = (p: NamePlacement) => p.key;
    const make = (id: string): El => {
      const r = document.createElement('div');
      r.className = `lb cc sv-name sv-${id === 'in' || id === 'out' ? 'end' : id}`;
      r.dataset.target = `sinusoid:${id}`;
      root.appendChild(r);
      const lead = document.createElement('i'); lead.className = 'lb-lead'; root.appendChild(lead);
      const e: El = { root: r, rows: [], lead, tx: '', size: '', words: '' };
      els.set(id, e);
      return e;
    };

    const solveNow = () => {
      const { vp, boxes } = useUi.getState();
      const level = useShell.getState().figure.labelLevel;
      const m = cel.lobule.inkContext()?.model ?? null;
      const st = useSinusoidNames.getState();
      const free = rectToBox(boxes.free);
      const built = buildSinusoidNames({
        view: cel.sinus, proj, vp, measure, stage: { w: vp.w, h: vp.h }, free: { l: free.x0, t: free.y0, r: free.x1, b: free.y1 }, insTop: vp.safe.top + BAR,
        model: m ? { P1: m.P1, P2: m.P2, P3: m.P3, lymph: m.lymph, lyProt: m.lyProt } : null, explain: st.explain, lit: st.lit,
      });
      placed = level === 'none' ? [] : built;
      setSinusoidPlaced(placed);
      const stand = new Set<string>(placed.map(key));
      for (const [id, e] of els) if (!stand.has(id)) { e.root.removeAttribute('data-on'); e.lead?.removeAttribute('data-on'); }
      for (const p of placed) {
        const e = els.get(p.key) ?? make(p.key);
        const ln = linesOf(p.name, p.value, p.key, st.explain);
        const words = JSON.stringify(ln), size = `${Math.round(p.w * 10)}x${Math.round(p.hh * 10)}`;
        if (e.words !== words) {
          e.words = words;
          const rows: [string, string][] = [...ln.name.map((t): [string, string] => [t, 'lb-name']), ...ln.value.map((t): [string, string] => [t, 'lb-val']), ...(ln.note ? [[ln.note, 'sv-note'] as [string, string]] : [])];
          while (e.rows.length > rows.length) e.rows.pop()!.remove();
          rows.forEach(([t, cls], i) => {
            const r = e.rows[i] ?? (e.rows[i] = e.root.appendChild(document.createElement('span')));
            r.className = `sv-row ${cls}`; r.textContent = t;
            r.style.height = `${Math.round(lineSize([cls === 'lb-val' ? valueRun(t) : nameRun(t)], vp, measure).h * 100) / 100}px`;
          });
          e.root.setAttribute('aria-label', [...ln.name, ...ln.value].join(' '));
        }
        if (e.size !== size) { e.size = size; e.root.style.width = `${Math.round(p.w * 100) / 100}px`; e.root.style.height = `${Math.round(p.hh * 100) / 100}px`; e.root.style.setProperty('--b', `${Math.round(baselineAt(p.hh, LS.PAD.y) * 100) / 100}px`); }
      }
    };

    const tick = () => {
      const now = performance.now(), dt = last < 0 ? 16 : Math.min(100, now - last);
      last = now;
      const on = namesOn(cel.view, cel.sinus.group.visible);
      const a = on ? proj(0, 0) : [0, 0], b = on ? proj(1, 0) : [0, 0];
      const refs = `${Math.round(a[0]! * 2)},${Math.round(a[1]! * 2)},${Math.round(b[0]! * 2)},${Math.round(b[1]! * 2)}`;
      if (cel.rig.isMoving || cel.sinus.diveShareNow != null || refs !== lastRefs) lastMove = now;
      lastRefs = refs;
      const still = on && now - lastMove >= SETTLE_MS;
      if (still) {
        const { vp, boxes } = useUi.getState(), st = useSinusoidNames.getState();
        const m = cel.lobule.inkContext()?.model;
        const fr = rectToBox(boxes.free);
        const s = [vp.w, vp.h, refs, cel.sinus.isPortrait, useShell.getState().figure.labelLevel, [fr.x0, fr.y0, fr.x1, fr.y1].map(Math.round).join(','), lookRef.current, st.explain, [...st.lit].join(' '),
          Math.round(cel.sinus.porosity * 100), m ? [m.P1, m.P2, m.P3].map((x) => x.toFixed(1)).join(',') + Math.round(m.lymph * 100) + Math.round(m.lyProt * 100) : '-'].join('|');
        if (s !== sig) { sig = s; solveNow(); }
      }
      const to = still ? 1 : 0, wasAlpha = alpha;
      if (alpha !== to) alpha = Math.abs(to - alpha) <= dt / FADE_MS ? to : alpha + Math.sign(to - alpha) * (dt / FADE_MS);
      if (alpha > 0 || wasAlpha > 0) {
        const ex = useSinusoidNames.getState().explain;
        for (const p of placed) {
          const e = els.get(p.key);
          if (!e) continue;
          const box = placeOf(p);
          // (the name's end arrows follow it: a name that is dimmed or gone takes its arrow with it)
          const o = labelOpacity(alpha, ex && ex !== p.key ? 1 : 0);
          const tx = `translate3d(${Math.round(box.x * 100) / 100}px,${Math.round(box.y * 100) / 100}px,0)`;
          if (tx !== e.tx) { e.root.style.transform = tx; e.tx = tx; }
          e.root.style.opacity = String(Math.round(o * 1000) / 1000);
          e.root.setAttribute('data-on', '');
          if (e.lead) {
            if (p.leader) {
              const g = leaderGeom(p.leader.x2, p.leader.y2, { x0: box.x, y0: box.y, x1: box.x + box.w, y1: box.y + box.h });
              e.lead.style.transform = `translate(${Math.round(g.x * 100) / 100}px,${Math.round(g.y * 100) / 100}px) rotate(${g.angle.toFixed(4)}rad) scaleX(${Math.round(g.len * 100) / 100})`;
              e.lead.style.opacity = String(Math.round(o * 1000) / 1000); e.lead.setAttribute('data-on', '');
            } else e.lead.removeAttribute('data-on');
          }
        }
        if (alpha === 0) for (const e of els.values()) { e.root.removeAttribute('data-on'); e.lead?.removeAttribute('data-on'); }
      }
      // the end arrows follow their names (2D: a presenter slide that is not about an end dims both; outside a talk, 1)
      const endA = on ? Math.max(0, Math.min(1, alpha)) : 0;
      cel.sinus.setEndShown(alpha > 0 || !on ? 1 : endA, alpha > 0 || !on ? 1 : endA);
      const busy = alpha !== to || (on && !still);
      if (busy && !hold) hold = clock.hold('sinusoid-captions');
      else if (!busy && hold) { hold.release(); hold = null; }
    };
    const off = clock.on('tags', tick, 1);
    const wake = () => { sig = ''; clock.invalidate('sinusoid-captions'); };
    const offShell = useShell.subscribe(wake);
    const offUi2 = useUi.subscribe((s, p) => { if (s.boxes !== p.boxes) wake(); });
    const offEx = useSinusoidNames.subscribe((s, p) => { if (s.explain !== p.explain || s.lit !== p.lit) wake(); });
    void document.fonts?.ready.then(wake);
    void DIM_ALPHA; void SINUSOID_L;
    return () => { off(); offShell(); offUi(); offUi2(); offEx(); hold?.release(); for (const e of els.values()) { e.root.remove(); e.lead?.remove(); } };
  }, []);

  return <div ref={layer} className="lb-layer cc-layer sv-layer" aria-hidden="true" />;
}
