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
import { leaderGeom } from '../labels/geometry.ts';
import { DIM_ALPHA, labelOpacity } from '../labels/alpha.ts';
import { makeMeasure } from '../labels/LabelLayer.tsx';
import { LS, lookVars, typeVars } from '../labels/type.ts';
import { sinusoidWorld } from '../lobule/frames.ts';
import { SINUSOID_L } from '../lobule/shots.ts';
import { type NameKey, type NamePlacement } from './names.ts';
import { SV_NOTE } from './names.ts';
import { useFootNote } from '../../ui/shell/foot-note.ts';
import { buildSinusoidNames, namesFree, namesOn, placeOf, readingOf, readingsSig } from './captions.ts';
import { type RNode, dotCss, regionClass, regionTree, treeKey } from './region.ts';
import { U } from './view.ts';
import { framePoint } from './portrait.ts';

/** 2D's end arrow (sinusoid's shader, the 3D scene's arrowOutline): a short broad shaft and a wide head, pointing along +x, its size 1 (the head 0.92 tall). */
export const END_ARROW_D = 'M-0.58 -0.17 L0 -0.17 L0 -0.46 L0.52 0 L0 0.46 L0 0.17 L-0.58 0.17 Z';
import { setSinusoidPlaced, useSinusoidNames } from './explain-store.ts';

const SETTLE_MS = 180, FADE_MS = 180;
interface El { root: HTMLElement; lead: HTMLElement | null; ring: HTMLElement | null; ringTx: string; tx: string; words: string }

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
      { const d = dotCss(); root.style.setProperty('--sv-dot', `${d.size}px`); root.style.setProperty('--sv-dot-w', `${d.ring}px`); root.style.setProperty('--sv-dot-halo', `${d.halo}px`); }
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
    /** an end's arrow, pointing toward its vessel off the view on the screen as it stands (the portal venule's back upstream, the central vein's on downstream) */
    const endArrow = (k: 'in' | 'out'): 'l' | 'r' | 'u' | 'd' => {
      const a = proj(0, 0), b = proj(1, 0), d = k === 'in' ? -1 : 1, dx = (b[0] - a[0]) * d, dy = (b[1] - a[1]) * d;
      return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : (dy > 0 ? 'd' : 'u');
    };
    /** 2D's end arrow (arrowOutline: shaft and head), pointing along `dir`, placed outside the name on that side (names.css .sv-end-arrow) */
    const arrowEl = (dir: string): Element => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', `sv-end-arrow sv-end-arrow-${dir}`); svg.setAttribute('viewBox', '-0.66 -0.54 1.26 1.08'); svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', END_ARROW_D);
      svg.appendChild(path);
      return svg;
    };
    const make = (id: string): El => {
      const r = document.createElement('div');
      r.className = regionClass(id as NameKey);   // (2D's own caption: its stylesheet sets the type, the case and the colour)
      r.dataset.target = `sinusoid:${id}`;
      root.appendChild(r);
      const lead = document.createElement('i'); lead.className = 'lb-lead'; root.appendChild(lead);
      // (no ring at the leader's end: 2D's paper-and-ink dot read as a white circle on the cell it names, mistaken for a nucleus, Mohammad 20 Nov 2026 "there is a white circle in it ... not
      //  sure what that circle is"; the leader simply ends on the part)
      const e: El = { root: r, lead, ring: null, ringTx: '', tx: '', words: '' };
      els.set(id, e);
      return e;
    };

    const node = (n: RNode | string): Node => {
      if (typeof n === 'string') return document.createTextNode(n);
      const e = document.createElement(n.tag);
      if (n.cls) e.className = n.cls;
      e.append(...n.kids.map(node));
      return e;
    };
    /** a caption's words written as 2D's pageRun writes them (only when they changed), and its element returned */
    const fill = (e: El, name: string, value: string, key: NameKey, explain: NameKey | null): El => {
      const tree = regionTree(name, value, explain === key ? SV_NOTE[key] ?? null : null);
      // the ends' arrows are 2D's (sinusoid-view.js layoutEnds and its shader's end arrow: a short broad shaft and a wide head, 22 px, in the name's ink on its halo), part of the name and
      // moving with it, outside it toward its vessel: left of the portal venule and right of the central vein on a wide screen, above the one and below the other on a tall one
      // (Mohammad 20 Nov 2026: "the arrow should not be a 3D thing; just make it part of the label", "should still be like the 2D version")
      const arrow = key === 'in' || key === 'out' ? endArrow(key) : '';
      const words = treeKey(tree) + arrow;
      if (e.words !== words) {
        e.words = words;
        e.root.replaceChildren(...tree.map(node));
        if (arrow) e.root.appendChild(arrowEl(arrow));
        e.root.setAttribute('aria-label', [name.replace(/\n/g, ' '), ...value.split(' · ').map((l) => l.replace('~', ' '))].join(' '));
      }
      return e;
    };
    /** a caption's size as the page sets it (2D: the stylesheet's type, read once when its words change; never in a frame) */
    const size = (key: NameKey, name: string, value: string, note: string | null): readonly [number, number] => {
      const e = fill(els.get(key) ?? make(key), name, value, key, note ? key : null);
      return [e.root.offsetWidth, e.root.offsetHeight];
    };

    const solveNow = () => {
      const { vp } = useUi.getState();
      const level = useShell.getState().figure.labelLevel;
      const m = cel.lobule.inkContext()?.model ?? null;
      const st = useSinusoidNames.getState();
      const free = namesFree(cel.rig.targetRoom, { w: vp.w, h: vp.h }, useFootNote.getState().rect);
      const built = buildSinusoidNames({
        view: cel.sinus, proj, vp, measure, size, stage: { w: vp.w, h: vp.h }, free, insTop: vp.safe.top + BAR,
        model: m ? { P1: m.P1, P2: m.P2, P3: m.P3, lymph: m.lymph, lyProt: m.lyProt } : null, explain: st.explain, lit: st.lit,
      });
      placed = level === 'none' ? [] : built;
      setSinusoidPlaced(placed);
      const stand = new Set<string>(placed.map(key));
      for (const [id, e] of els) if (!stand.has(id)) { e.root.removeAttribute('data-on'); e.lead?.removeAttribute('data-on'); e.ring?.removeAttribute('data-on'); }
      for (const p of placed) {
        const e = els.get(p.key) ?? make(p.key);
        fill(e, p.name, p.value, p.key, st.explain);
      }
    };

    /** The readings as the model has them now, written in place into the names that stand (no solve, no jump): the numbers move with the pulse and the treatments, the places do not. */
    const refreshReadings = () => {
      const m = cel.lobule.inkContext()?.model, cm = m ? { P1: m.P1, P2: m.P2, P3: m.P3, lymph: m.lymph, lyProt: m.lyProt } : null;
      for (const p of placed) {
        const v = readingOf(p.key, cm, cel.sinus.porosity, cel.sinus.isPortrait);
        if (v === null || v === p.value || !p.value) continue;
        p.value = v;
        const e = els.get(p.key);
        if (e) fill(e, p.name, v, p.key, useSinusoidNames.getState().explain);
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
        const { vp } = useUi.getState(), st = useSinusoidNames.getState();
        const m = cel.lobule.inkContext()?.model;
        const fr = namesFree(cel.rig.targetRoom, { w: vp.w, h: vp.h }, useFootNote.getState().rect);
        const s = [vp.w, vp.h, refs, cel.sinus.isPortrait, useShell.getState().figure.labelLevel, [fr.l, fr.t, fr.r, fr.b].join(','), lookRef.current, st.explain, [...st.lit].join(' '),
          Math.round(cel.sinus.porosity * 100), readingsSig(m ? { P1: m.P1, P2: m.P2, P3: m.P3, lymph: m.lymph, lyProt: m.lyProt } : null)].join('|');
        if (s !== sig) { sig = s; solveNow(); } else refreshReadings();
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
          if (e.ring) {
            if (p.leader) {
              const rt = `translate(${Math.round(p.leader.x2 * 100) / 100}px,${Math.round(p.leader.y2 * 100) / 100}px)`;
              if (rt !== e.ringTx) { e.ring.style.transform = rt; e.ringTx = rt; }
              e.ring.style.opacity = String(Math.round(o * 1000) / 1000); e.ring.setAttribute('data-on', '');
            } else e.ring.removeAttribute('data-on');
          }
        }
        if (alpha === 0) for (const e of els.values()) { e.root.removeAttribute('data-on'); e.lead?.removeAttribute('data-on'); e.ring?.removeAttribute('data-on'); }
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
    const offFoot = useFootNote.subscribe(wake);
    const offUi2 = useUi.subscribe((s, p) => { if (s.boxes !== p.boxes) wake(); });   // (the room itself is read each frame in the signature: it moves with the camera's room, which the cards and the shell set)
    const offEx = useSinusoidNames.subscribe((s, p) => { if (s.explain !== p.explain || s.lit !== p.lit) wake(); });
    void document.fonts?.ready.then(wake);
    void DIM_ALPHA; void SINUSOID_L;
    return () => { off(); offShell(); offFoot(); offUi(); offUi2(); offEx(); hold?.release(); for (const e of els.values()) { e.root.remove(); e.lead?.remove(); e.ring?.remove(); } };
  }, []);

  return <div ref={layer} className="lb-layer cc-layer sv-layer" aria-hidden="true" />;
}
