// The scope view on the figure (2D scope-lens.js, mock C1: "C1 is perfect"), for every slide the 2D rule picks (scope-want.ts), in every deck. The ring on the varices is the scene's (disease/scope-ring.ts,
// the GPU, in world units: it eases in and out and moves with every zoom, pan and turn); this is its tap and its lens. A tap on the ring opens a round lens in the nearest free space beside it (never over
// the cards, the bar or the bleed), joined to it by a faint cone, with the existing endoscopic view in it (the Tests card's own scope: its GPU field, its bleed and bands, the slide's own numbers) and a
// caption of the grade. The lens is kept to its ring: on every frame the layer is moved by one `transform` to the same offset from the ring, so ring and lens move as one, never eased behind the figure. The cone
// is taken down while the camera moves and laid again once it has held still, when the lens is also looked at once more and glides clear of a card it has gone under. Any tap on the figure shuts it.
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clock, type TimerId } from '../../clock/frame.ts';
import { latest, onFrame } from '../../engine/index.ts';
import { gastricUp } from '../../engine/hales/portal/scenario.js';
import { sceneApi } from '../../scene/api.ts';
import type { ScopeRingScreen } from '../../scene/disease/scope-ring.ts';
import { placeLens, coneLines, lensFits, lensCentre, LENS_GAP } from '../../scene/disease/copied/scope-lens-rule.js';
import { useUi } from '../ui-store.ts';
import { lazyRetry } from '../../boot/lazy-retry.ts';
import { useScopeWant } from './scope-want.ts';
import { scopeClaims, circleBox, unionBox } from '../../scene/labels/scope-claims.ts';
import { newGate, stepGate, type Gate } from './scope-gate.ts';
import { scopeOptions } from '../tests/endo/readings.ts';
import { captionOf } from './scope-caption.ts';
import { D_SMALL } from '../motion.ts';

const ScopeView = lazyRetry(() => import('../tests/endo/EndoPane.tsx').then((m) => ({ default: m.ScopeView })));
/** How long the camera must hold still before the cone is laid again and the lens is looked at once more, ms (a settle wait, not a move). */
const STILL_MS = 160;
/** The ring's tap: at least 44 px across (2D ringHit's reach: the ring's radius and 8 px, never under 22). */
const HIT = 44;
const OPT = scopeOptions({});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

interface Anchor { cx: number; cy: number; ux: number; uy: number; R: number; gap: number }
interface Placed { x: number; y: number; r: number; ox: number; oy: number }
const newRing = (): ScopeRingScreen => ({ x: 0, y: 0, r: 0, bx: 0, by: 0, br: 0, bleed: { l: 0, t: 0, r: 0, b: 0 } });

export function ScopeLens() {
  const want = useScopeWant((s) => s.want), grows = useScopeWant((s) => s.grows), key = useScopeWant((s) => s.key);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const [on, setOn] = useState(false);
  const [cap, setCap] = useState('');
  const [nth, setNth] = useState(0);   // (a scope of its own for each opening: it is drawn first from the frame now, never from one kept from an earlier opening)
  const hit = useRef<HTMLButtonElement>(null), layer = useRef<HTMLDivElement>(null), cone = useRef<SVGSVGElement>(null);
  const live = useRef({ want, grows, open: false, gate: newGate() as Gate, ring: newRing(), A: null as Anchor | null, lastMove: 0, wake: null as TimerId | null, still: null as TimerId | null, shut: null as TimerId | null, pushed: '', claimDirty: true, dx: NaN, dy: NaN, rx: NaN, ry: NaN, rr: NaN });
  const L = live.current;
  L.want = want; L.grows = grows;
  scopeClaims.setWants(want);   // (a caliper across the varices keeps clear of the ring for the whole slide, whether or not the ring stands yet)

  // ── the ring: stands while the slide wants it and the patient has varices (scope-gate.ts), eased by the scene ──
  const look = useRef<() => void>(() => undefined);
  look.current = () => {
    const f = latest.frame as Any, r = stepGate(L.gate, { want: L.want, grows: L.grows, present: !!f?.metrics?.varix?.present, gastric: gastricUp(f?.params ?? {}), open: L.open }, clock.now());
    L.gate = r.gate;
    if (r.close) closeRef.current();
    const ringOn = L.want && L.gate.has, k = `${ringOn ? 1 : 0}${L.open ? 1 : 0}`;
    if (k !== L.pushed) { L.pushed = k; sceneApi.setScopeRing(ringOn, L.open && ringOn); }
    clock.cancel(L.wake); L.wake = null;
    if (r.wake != null) L.wake = clock.after(() => { L.wake = null; look.current(); }, r.wake + 8, 'scope-gate');
  };
  const closeRef = useRef<(now?: boolean) => void>(() => undefined);

  // a new slide: a lens left open shuts, the gate starts again for it
  useEffect(() => {
    closeRef.current(true);
    L.gate = newGate(); L.pushed = '';
    look.current();
  }, [key, want, grows]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onFrame(() => look.current()), []);
  useEffect(() => () => { clock.cancel(L.wake); clock.cancel(L.still); clock.cancel(L.shut); sceneApi.setScopeRing(false, false); scopeClaims.setWants(false); scopeClaims.set([]); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── open and shut ──
  const place = () => {
    const ring = L.ring, ui = useUi.getState(), vp = ui.vp;
    if (!sceneApi.scopeRingScreen(ring)) return null;
    const { bounds, rects } = fieldOf(ring, ui);
    const size = Math.round(Math.min(150, Math.max(70, Math.min(vp.w, vp.h) * 0.18)));
    const P = placeLens({ x: ring.x, y: ring.y, r: ring.r }, bounds, rects, size) as { x: number; y: number; r: number } | null;
    if (!P) return null;
    const d = Math.hypot(P.x - ring.x, P.y - ring.y) || 1;
    L.A = { cx: P.x, cy: P.y, ux: (P.x - ring.x) / d, uy: (P.y - ring.y) / d, R: P.r, gap: d - ring.r - P.r };
    L.dx = NaN; L.dy = NaN;
    return { ...P, ox: Math.round(ring.x - (P.x - P.r)), oy: Math.round(ring.y - (P.y - P.r)) };
  };
  const open = () => {
    if (L.open || !L.want || !L.gate.has) return;
    const P = place();
    if (!P) return;
    clock.cancel(L.shut); L.shut = null;
    L.claimDirty = true; L.open = true; setNth((n) => n + 1); setPlaced(P); setOn(false); setCap(captionOf(latest.frame));
    clock.after(() => { if (L.open) setOn(true); }, 30, 'scope-lens');
    layCone(true);
    look.current();
  };
  const close = (now = false) => {
    if (!L.open) return;
    L.claimDirty = true; L.open = false; L.A = null;
    clock.cancel(L.still); L.still = null;
    setOn(false); layCone(false);
    clock.cancel(L.shut);
    // (it glides shut as it opened, back into the ring, by its own opacity and transform; taken down once that is over)
    if (now) setPlaced(null); else L.shut = clock.after(() => { L.shut = null; if (!L.open) setPlaced(null); }, D_SMALL + 20, 'scope-lens');
    look.current();
  };
  closeRef.current = close;

  // ── the camera moving: ring, hit and lens on one transform each frame; the cone down while it moves ──
  const layCone = (show: boolean) => {
    const el = cone.current;
    if (!el) return;
    const A = L.A, ring = L.ring;
    if (!show || !A || !sceneApi.scopeRingScreen(ring)) { el.style.opacity = '0'; return; }
    const c = { x: 0, y: 0 };
    lensCentre(c, ring, A);
    const lines = coneLines({ x: ring.x, y: ring.y, r: ring.r }, { x: c.x, y: c.y, r: A.R + 5 }) as number[][] | null;
    if (!lines) { el.style.opacity = '0'; return; }
    el.querySelectorAll('line').forEach((ln, i) => {
      // (each line starts a little off the ring's edge and stops short of the lens's rim: it joins them, it never runs over either)
      const q = lines[i % 2]!, dx = q[2]! - q[0]!, dy = q[3]! - q[1]!, n = Math.hypot(dx, dy) || 1, a = 4 / n, b = 9 / n;
      if (n < 24) { ln.setAttribute('x1', '0'); ln.setAttribute('y1', '0'); ln.setAttribute('x2', '0'); ln.setAttribute('y2', '0'); return; }
      ln.setAttribute('x1', (q[0]! + dx * a).toFixed(1)); ln.setAttribute('y1', (q[1]! + dy * a).toFixed(1)); ln.setAttribute('x2', (q[2]! - dx * b).toFixed(1)); ln.setAttribute('y2', (q[3]! - dy * b).toFixed(1));
    });
    el.style.opacity = '1';
  };
  const settle = () => {
    L.still = null;
    const A = L.A, ring = L.ring;
    if (!L.open || !A) return;
    if (!sceneApi.scopeRingScreen(ring)) { close(); return; }
    const ui = useUi.getState(), { bounds, rects } = fieldOf(ring, ui), c = { x: 0, y: 0 };
    lensCentre(c, ring, A);
    L.claimDirty = true;
    if (!lensFits(c.x, c.y, A.R, bounds, rects)) {
      const P = placeLens({ x: ring.x, y: ring.y, r: ring.r }, bounds, rects, A.R, true) as { x: number; y: number; r: number } | null;
      if (P) {
        // (it glides to the nearest spot that is free, its size kept: the layer's transform is eased for this one move)
        const d = Math.hypot(P.x - ring.x, P.y - ring.y) || 1;
        layer.current?.classList.add('glide');
        A.ux = (P.x - ring.x) / d; A.uy = (P.y - ring.y) / d; A.gap = d - ring.r - A.R;
        L.dx = NaN; follow();
        clock.after(() => layer.current?.classList.remove('glide'), D_SMALL + 80, 'scope-lens');
      }
    }
    layCone(true);
  };
  const follow = () => {
    const A = L.A, ring = L.ring, el = layer.current;
    if (!A || !el) return;
    const c = { x: 0, y: 0 };
    lensCentre(c, ring, A);
    const tx = c.x - A.cx, ty = c.y - A.cy;
    if (tx === L.dx && ty === L.dy) return;
    L.dx = tx; L.dy = ty;
    el.style.transform = `translate3d(${tx.toFixed(2)}px,${ty.toFixed(2)}px,0)`;
  };
  useEffect(() => clock.on('tags', () => {
    const ring = L.ring, b = hit.current;
    const shown = (L.want && L.gate.has) || L.open;
    if (!shown || !sceneApi.scopeRingScreen(ring)) { scopeClaims.set([]); L.claimDirty = true; if (b && !b.hidden) b.hidden = true; if (L.open) close(); return; }
    if (b) {
      if (b.hidden) b.hidden = false;
      if (ring.x !== L.rx || ring.y !== L.ry || ring.r !== L.rr) {
        const k = Math.max(ring.r + 8, HIT / 2) / (HIT / 2);
        b.style.transform = `translate3d(${(ring.x - HIT / 2).toFixed(2)}px,${(ring.y - HIT / 2).toFixed(2)}px,0) scale(${k.toFixed(3)})`;
      }
    }
    const moved = ring.x !== L.rx || ring.y !== L.ry || ring.r !== L.rr;
    L.rx = ring.x; L.ry = ring.y; L.rr = ring.r;
    // (the room the ring, its badge and an open lens take: the names and the callouts keep off it; written when something moved, never built per frame at rest)
    if (moved || L.claimDirty) {
      L.claimDirty = false;
      const claim = unionBox(circleBox(ring.x, ring.y, ring.r, 5), circleBox(ring.bx, ring.by, ring.br, 5)), A = L.A;
      if (L.open && A) {
        const c = { x: 0, y: 0 };
        lensCentre(c, ring, A);
        scopeClaims.set([claim, circleBox(c.x, c.y, A.R, 9), { x0: c.x - 80, y0: c.y + A.R + 6, x1: c.x + 80, y1: c.y + A.R + 30 }]);
      } else scopeClaims.set([claim]);
    }
    if (L.open && moved) {
      follow();
      if (cone.current && cone.current.style.opacity !== '0') cone.current.style.opacity = '0';
      L.lastMove = clock.now();
      if (!L.still) L.still = clock.after(() => { const w = L.lastMove + STILL_MS - clock.now(); if (w > 8) { L.still = clock.after(() => { L.still = null; settle(); }, w, 'scope-lens'); } else settle(); }, STILL_MS, 'scope-lens');
    }
  }, 5), []);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── the caption follows the model while the lens is up ──
  useEffect(() => (placed ? onFrame((f) => setCap((o) => { const c = captionOf(f); return c === o ? o : c; })) : undefined), [placed]);

  // ── any tap on the figure shuts it (a drag that pans it does not) ──
  useEffect(() => {
    if (!placed) return;
    let down: { x: number; y: number } | null = null;
    const pd = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const ck = (e: MouseEvent) => {
      if (!L.open) return;
      const t = e.target as Element | null;
      if (t?.closest?.('.dk-card, .pz-bar, .pz-lens-disc, .pz-lens-x, .pz-lens-hit')) return;
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
      close();
    };
    window.addEventListener('pointerdown', pd, true); window.addEventListener('click', ck, true);
    return () => { window.removeEventListener('pointerdown', pd, true); window.removeEventListener('click', ck, true); };
  }, [placed]);   // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => { if (placed && layer.current) { layer.current.style.transform = ''; } }, [placed]);

  return (
    <>
      <svg ref={cone} className="pz-lens-cone" aria-hidden="true" style={{ opacity: 0 }}>
        <g className="halo"><line /><line /></g>
        <g className="ink"><line /><line /></g>
      </svg>
      {placed && (
        <div ref={layer} className={`pz-lens${on ? ' on' : ''}`} data-scope-lens="">
          <div className="pz-lens-disc" role="img" aria-label="Endoscopic view of the esophagus, live"
            style={{ left: placed.x - placed.r, top: placed.y - placed.r, width: placed.r * 2, height: placed.r * 2, ['--lens-ox' as string]: `${placed.ox}px`, ['--lens-oy' as string]: `${placed.oy}px` }}
            onClick={() => close()}>
            <div className="pz-lens-inst" key={nth}>
              <Suspense fallback={null}><ScopeView square={placed.r * 2} opt={OPT} slide /></Suspense>
            </div>
          </div>
          <button type="button" className="pz-lens-x" aria-label="Close the endoscopic view" onClick={(e) => { e.stopPropagation(); close(); }}
            style={{ left: Math.round(placed.x + placed.r * Math.cos(-Math.PI / 4) - 14), top: Math.round(placed.y + placed.r * Math.sin(-Math.PI / 4) - 14) }}>×</button>
          <span className="pz-lens-cap" style={{ left: placed.x, top: placed.y + placed.r + 12 }}>{cap}</span>
        </div>
      )}
      <button ref={hit} type="button" className="pz-lens-hit" hidden aria-label="Open the endoscopic view of the esophagus" onClick={() => (L.open ? close() : open())} />
    </>
  );
}

/** The stage's room for the lens, and the rectangles it keeps clear of (the bleed, the cards, the bar), in CSS px. */
function fieldOf(ring: ScopeRingScreen, ui: ReturnType<typeof useUi.getState>) {
  const { vp, boxes } = ui;
  const rects: { l: number; t: number; r: number; b: number }[] = [ring.bleed];
  const add = (q: { x: number; y: number; w: number; h: number } | null) => { if (q && q.w > 2 && q.h > 2) rects.push({ l: q.x, t: q.y, r: q.x + q.w, b: q.y + q.h }); };
  add(boxes.words); add(boxes.data); add(boxes.strip); for (const b of boxes.bars) add(b);
  return { bounds: { l: vp.safe.left, t: 0, r: vp.w - vp.safe.right, b: vp.h }, rects };
}
void LENS_GAP;
