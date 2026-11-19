// The lobule's words over the canvas: the zone names and the stations (portal venule, sinusoids, central vein with their pressures, the arteriole, the ductule, the lymph), as DOM in the figure's one
// label type (labels/labels.css), placed by the one label solver from the items captions.ts builds, moved by the clock (transform and opacity only). As every figure label they come in once the
// picture is still and go the moment anything moves.
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import '../labels/labels.css';
import '../circuit/captions.css';
import { clock } from '../../clock/frame.ts';
import { useSettings } from '../../state/settings.ts';
import { resolveLook } from '../../looks/looks.ts';
import { BAR } from '../../ui/layout/plan.ts';
import { useUi } from '../../ui/ui-store.ts';
import { useShell } from '../../ui/shell/store.ts';
import { cel } from '../api.ts';
import { type Box, leaderGeom, rectToBox } from '../labels/geometry.ts';
import { makeMeasure } from '../labels/LabelLayer.tsx';
import { type Placement, solve } from '../labels/solver.ts';
import { LS, baselineAt, fontPx, lookVars, typeVars } from '../labels/type.ts';
import { type CapMeta, buildLobuleCaptions, readingText } from './captions.ts';

const SETTLE_MS = 180, FADE_MS = 180;
interface El { root: HTMLElement; name: HTMLElement; val: HTMLElement | null; lead: HTMLElement | null; ring: HTMLElement | null; ringTx: string; tx: string; text: string; valText: string; size: string }
const boxKey = (b: Box): string => `${Math.round(b.x0)},${Math.round(b.y0)},${Math.round(b.x1)},${Math.round(b.y1)}`;

export function LobuleCaptions() {
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
    const v3 = new Vector3(), pt = { x: 0, y: 0 }, w3: [number, number, number] = [0, 0, 0];
    let placed = new Map<string, Placement>(), metas = new Map<string, CapMeta>();
    let sig = '', lastMove = -1e9, lastRefs = '', alpha = 0, last = -1, hold: { release(): void } | null = null;

    const putVars = () => {
      const { vp } = useUi.getState();
      for (const [k, v] of Object.entries({ ...typeVars(vp), ...lookVars(lookRef.current, vp) })) root.style.setProperty(k, v);
      root.style.setProperty('--cc-ink', (LS.LOOKS as Record<string, Record<string, string>>)[lookRef.current]!['text-3']!);
      sig = '';
    };
    putVars();
    retype.current = putVars;
    const offUi = useUi.subscribe((s, p) => { if (s.vp !== p.vp) putVars(); });

    const proj = (x: number, y: number): [number, number] => {
      cel.lobule.anchorAt(x, y, w3);
      cel.rig.project(v3.set(w3[0], w3[1], w3[2]), pt);
      return [pt.x, pt.y];
    };
    const view = (): Box => { const { vp } = useUi.getState(); return { x0: vp.safe.left, y0: vp.safe.top + BAR, x1: vp.w - vp.safe.right, y1: vp.h - vp.safe.bottom }; };
    const blockers = (): Box[] => { const b = useUi.getState().boxes; return [b.words, b.data, b.strip].filter((r): r is NonNullable<typeof r> => !!r).map(rectToBox); };

    const make = (id: string, m: CapMeta): El => {
      const r = document.createElement('div');
      r.className = `lb cc cc-${m.kind}`;
      r.dataset.target = m.target;
      const name = document.createElement('span'); name.className = 'lb-name'; r.appendChild(name);
      let val: HTMLElement | null = null, lead: HTMLElement | null = null, ring: HTMLElement | null = null;
      if (m.kind === 'station') {
        val = document.createElement('span'); val.className = 'lb-val'; r.appendChild(val);
        lead = document.createElement('i'); lead.className = 'lb-lead'; root.appendChild(lead);
        ring = document.createElement('i'); ring.className = 'lb-anchor'; root.appendChild(ring);   // (2D draws the dot on what each name names, leader or none)
      }
      root.appendChild(r);
      const e: El = { root: r, name, val, lead, ring, ringTx: '', tx: '', text: '', valText: '', size: '' };
      els.set(id, e);
      return e;
    };

    const solveNow = () => {
      const { vp } = useUi.getState();
      const level = useShell.getState().figure.labelLevel;
      const m = cel.lobule.inkContext()?.model ?? null;
      const L = cel.lobule.currentLayers;
      const vw = view(), bl = blockers();
      const ROOM = 64;   // (a tract takes the names only with room round it for them: the venule at least this far inside the view)
      const inView = (x: number, y: number) => x > vw.x0 + ROOM && x < vw.x1 - ROOM && y > vw.y0 + ROOM && y < vw.y1 - ROOM && !bl.some((b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1);
      const built = buildLobuleCaptions({ proj, vp, measure, net: cel.lobule.net, layers: { zones: L.zones, lymph: L.lymph }, hide: !m, inView });
      const items = level === 'none' ? built.items.filter((it) => it.id.startsWith('z:')) : built.items;
      const out = solve({ items, view: vw, blockers: bl, lines: built.lines, keep: built.keep });
      placed = new Map(out.placed.map((p) => [p.id, p]));
      metas = built.meta;
      itemsNow = new Map(items.map((it) => [it.id, it]));
      const stand = new Set(placed.keys());
      for (const [id, e] of els) if (!stand.has(id)) { e.root.removeAttribute('data-on'); e.lead?.removeAttribute('data-on'); e.ring?.removeAttribute('data-on'); }
      for (const [id, p] of placed) {
        const mt = metas.get(id)!;
        const e = els.get(id) ?? make(id, mt);
        const f = mt.forms[Math.min(p.form, mt.forms.length - 1)]!;
        const size = `${p.w}x${p.h}|${p.form}`;
        if (e.size !== size) {
          e.size = size;
          e.root.style.width = `${Math.round(p.w * 100) / 100}px`; e.root.style.height = `${Math.round(p.h * 100) / 100}px`;
          e.root.dataset.form = f.name ? '0' : '2';
          e.root.style.setProperty('--b', `${Math.round(baselineAt(p.h, LS.PAD.y) * 100) / 100}px`);
          if (mt.kind === 'zone') e.name.style.fontSize = `${fontPx(10.5, vp)}px`;
        }
        if (e.text !== f.name) { e.text = f.name; e.name.textContent = f.name; e.name.style.display = f.name ? '' : 'none'; }
        e.root.setAttribute('aria-label', mt.label);
        if (e.val) {
          const v = !f.value ? '' : m ? readingText(mt.read, m, false) : '?';
          if (e.valText !== v) { e.valText = v; e.val.textContent = v; }
        }
      }
    };
    let itemsNow = new Map<string, import('../labels/solver.ts').Item>();

    const tick = () => {
      const now = performance.now(), dt = last < 0 ? 16 : Math.min(100, now - last);
      last = now;
      const on = cel.view === 'lobule' && cel.lobule.group.visible;
      const a = on ? proj(0, 0) : [0, 0], b = on ? proj(1, 0) : [0, 0];
      const refs = `${Math.round(a[0]! * 2)},${Math.round(a[1]! * 2)},${Math.round(b[0]! * 2)},${Math.round(b[1]! * 2)}`;
      if (cel.rig.isMoving || refs !== lastRefs) lastMove = now;
      lastRefs = refs;
      const still = on && now - lastMove >= SETTLE_MS;
      if (still) {
        const { vp, boxes } = useUi.getState();
        const L = cel.lobule.currentLayers, m = cel.lobule.inkContext()?.model;
        const s = [vp.w, vp.h, refs, L.zones, L.lymph, useShell.getState().figure.labelLevel, boxKey(rectToBox(boxes.free)), blockers().map(boxKey).join(';'), lookRef.current,
          m ? [m.P1, m.P2, m.P3].map((x) => x.toFixed(1)).join(',') + Math.round(m.lymph * 100) : '-'].join('|');
        if (s !== sig) { sig = s; solveNow(); }
      }
      const to = still ? 1 : 0, wasAlpha = alpha;
      if (alpha !== to) alpha = Math.abs(to - alpha) <= dt / FADE_MS ? to : alpha + Math.sign(to - alpha) * (dt / FADE_MS);
      if (alpha > 0 || wasAlpha > 0) {
        for (const [id, e] of els) {
          const p = placed.get(id), it = itemsNow.get(id);
          if (!p || !it) continue;
          const bx = it.ax + p.dx, by = it.ay + p.dy;
          const tx = `translate3d(${Math.round(bx * 100) / 100}px,${Math.round(by * 100) / 100}px,0)`;
          if (tx !== e.tx) { e.root.style.transform = tx; e.tx = tx; }
          e.root.style.opacity = String(Math.round(alpha * 1000) / 1000);
          e.root.setAttribute('data-on', '');
          if (e.ring) {
            const rt = `translate(${Math.round(it.ax * 100) / 100}px,${Math.round(it.ay * 100) / 100}px)`;
            if (rt !== e.ringTx) { e.ring.style.transform = rt; e.ringTx = rt; }
            e.ring.style.opacity = String(Math.round(alpha * 1000) / 1000); e.ring.setAttribute('data-on', '');
          }
          if (e.lead) {
            if (p.leader) {
              const g = leaderGeom(it.ax, it.ay, { x0: bx, y0: by, x1: bx + p.w, y1: by + p.h });
              e.lead.style.transform = `translate(${Math.round(g.x * 100) / 100}px,${Math.round(g.y * 100) / 100}px) rotate(${g.angle.toFixed(4)}rad) scaleX(${Math.round(g.len * 100) / 100})`;
              e.lead.style.opacity = String(Math.round(alpha * 1000) / 1000); e.lead.setAttribute('data-on', '');
            } else e.lead.removeAttribute('data-on');
          }
        }
        if (alpha === 0) for (const e of els.values()) { e.root.removeAttribute('data-on'); e.lead?.removeAttribute('data-on'); e.ring?.removeAttribute('data-on'); }
      }
      const busy = alpha !== to || (on && !still);
      if (busy && !hold) hold = clock.hold('lobule-captions');
      else if (!busy && hold) { hold.release(); hold = null; }
    };
    const off = clock.on('tags', tick, 1);
    const wake = () => { sig = ''; clock.invalidate('lobule-captions'); };
    const offShell = useShell.subscribe(wake);
    const offUi2 = useUi.subscribe((s, p) => { if (s.boxes !== p.boxes) wake(); });
    void document.fonts?.ready.then(wake);
    return () => { off(); offShell(); offUi(); offUi2(); hold?.release(); for (const e of els.values()) { e.root.remove(); e.lead?.remove(); e.ring?.remove(); } };
  }, []);

  return <div ref={layer} className="lb-layer cc-layer" aria-hidden="true" />;
}
