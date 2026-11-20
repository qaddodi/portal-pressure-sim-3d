// The Circuit's words: zone titles, station names with their readings, lane captions and the resistors' readings, as DOM over the canvas in the one label type (labels.css), moved by the clock.
// What stands where is decided by the one label solver (labels/solver.ts) from the items captions.ts builds; this file only feeds it the map as the camera shows it and writes the answer.
// The words come in once the picture is still (the camera, the change and the turn at rest) and go the moment anything moves, as every figure label does.
import { useEffect, useRef } from 'react';
import '../labels/labels.css';
import './captions.css';
import { clock } from '../../clock/frame.ts';
import { latest } from '../../engine/index.ts';
import { NODES } from '../../engine/hales/portal/topology.js';
import { useSettings } from '../../state/settings.ts';
import { resolveLook } from '../../looks/looks.ts';
import { BAR } from '../../ui/layout/plan.ts';
import { useUi } from '../../ui/ui-store.ts';
import { useShell } from '../../ui/shell/store.ts';
import { fmtPressure } from '../../ui/text/line.ts';
import { cel, usePick } from '../api.ts';
import { rectToBox, leaderGeom, within, hits, crosses, type Box } from '../labels/geometry.ts';
import { makeMeasure } from '../labels/LabelLayer.tsx';
import { useLabels } from '../labels/store.ts';
import { type Placement, solve } from '../labels/solver.ts';
import { LS, baselineAt, fontPx, lookVars, typeVars } from '../labels/type.ts';
import { COURSES } from './course.ts';
import { type CapMeta, buildCaptions } from './captions.ts';
import { CIRCUIT_D, CIRCUIT_LABELS, CIRCUIT_NODES, CIRCUIT_TREES, LIVER_EDGES } from './data.copied.ts';
import { courseOf } from './paths.ts';
import { halfWidthPx } from './cap-width.ts';
import { resText } from './res-model.ts';
import { selectStructure } from '../../ui/action/selection.ts';

const NODE_AT = new Map<string, number>((NODES as unknown as { id: string }[]).map((n, i) => [n.id, i]));
const SETTLE_MS = 180, FADE_MS = 180, VALUE_EVERY_MS = 250;

interface El { root: HTMLElement; name: HTMLElement | null; val: HTMLElement | null; key: HTMLElement | null; lead: HTMLElement | null; tx: string; text: string; valText: string; form: number; size: string }

export function CircuitCaptions() {
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
    const tmp = { x: 0, y: 0 };
    let placed = new Map<string, Placement>();
    let metas = new Map<string, CapMeta>();
    let sig = '', lastMove = -1e9, lastRefs = '', alpha = 0, last = -1, lastValues = 0, hold: { release(): void } | null = null;

    const putVars = () => {
      const { vp } = useUi.getState();
      for (const [k, v] of Object.entries({ ...typeVars(vp), ...lookVars(lookRef.current, vp) })) root.style.setProperty(k, v);
      root.style.setProperty('--cc-ink', (LS.LOOKS as Record<string, Record<string, string>>)[lookRef.current]!['text-3']!);
      sig = '';
    };
    putVars();
    retype.current = putVars;
    const offUi = useUi.subscribe((s, p) => { if (s.vp !== p.vp) putVars(); });

    const make = (id: string, m: CapMeta): El => {
      const kind = m.kind;
      const root_ = document.createElement('div');
      root_.className = `lb cc cc-${kind}`;
      const name = document.createElement('span'); name.className = 'lb-name';
      let val: HTMLElement | null = null, key: HTMLElement | null = null, lead: HTMLElement | null = null;
      if (kind === 'station' || kind === 'res') { val = document.createElement('span'); val.className = 'lb-val'; }
      if (kind === 'res') {
        const row = document.createElement('div'); row.className = 'cc-row'; row.append(name, val!); root_.appendChild(row);
        key = document.createElement('span'); key.className = 'cc-key'; root_.appendChild(key);
      } else { root_.appendChild(name); if (val) root_.appendChild(val); }
      if (kind === 'station') { lead = document.createElement('i'); lead.className = 'lb-lead'; root.appendChild(lead); }
      if (kind === 'zone' && m.link) {
        // the Liver's and the Heart's titles open their cards (2D: there is no organ to click in the Circuit)
        const organ = m.link;
        root_.classList.add('cc-link'); root_.setAttribute('role', 'button'); root_.tabIndex = 0;
        root_.setAttribute('aria-label', `${m.forms[0]!.name}: open its card`);
        root_.addEventListener('click', () => selectStructure({ type: 'organ', id: organ }));
        root_.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectStructure({ type: 'organ', id: organ }); } });
      }
      root.appendChild(root_);
      const e: El = { root: root_, name, val, key, lead, tx: '', text: '', valText: '', form: -1, size: '' };
      els.set(id, e);
      return e;
    };

    const view = (): Box => { const { vp } = useUi.getState(); return { x0: vp.safe.left, y0: vp.safe.top + BAR, x1: vp.w - vp.safe.right, y1: vp.h - vp.safe.bottom }; };
    const blockers = (): Box[] => { const b = useUi.getState().boxes; return [b.words, b.data, b.strip].filter((r): r is NonNullable<typeof r> => !!r).map(rectToBox); };

    const solveNow = () => {
      const { vp, boxes } = useUi.getState();
      const level = useShell.getState().figure.labelLevel;
      const picked = usePick.getState().picked;
      const named = useLabels.getState().named;
      const must = new Set([...named].filter((id) => CIRCUIT_LABELS[id]));
      const zoom = cel.handZoom;
      const upright = cel.circuit.upright;
      const free = rectToBox(boxes.free);
      const laneOf = (id: string): readonly (readonly [number, number])[] | null => COURSES.get(id)?.mapPts ?? (CIRCUIT_D[id] ? courseOf(CIRCUIT_D[id]!) : null);
      // the vessels' centrelines on the canvas, for the soft cost of standing on one (and, by vessel, for a lane's caption to stand clear of every other)
      const lines: [number, number, number, number][] = [];
      const owned: { id: string; s: [number, number, number, number] }[] = [];
      for (const [id, c] of COURSES) {
        if (!cel.vesselDrawn(id)) continue;
        const p = c.mapPts;
        let px = NaN, py = NaN;
        for (let i = 0; i < p.length; i += Math.max(1, Math.floor(p.length / 24))) {
          cel.mapPoint(p[i]![0], p[i]![1], tmp);
          if (!Number.isNaN(px)) { lines.push([px, py, tmp.x, tmp.y]); owned.push({ id, s: [px, py, tmp.x, tmp.y] }); }
          px = tmp.x; py = tmp.y;
        }
      }
      // the liver's branches (the sinusoid bundle) are lines a caption keeps off too, drawn with their parent
      for (const [id, list] of Object.entries(CIRCUIT_TREES)) {
        if (!cel.vesselDrawn(id)) continue;
        for (const b of list) {
          const p = courseOf(b.d);
          let px = NaN, py = NaN;
          for (let i = 0; i < p.length; i += Math.max(1, Math.floor(p.length / 12))) {
            cel.mapPoint(p[i]![0], p[i]![1], tmp);
            if (!Number.isNaN(px)) { lines.push([px, py, tmp.x, tmp.y]); owned.push({ id: `${id}~tree`, s: [px, py, tmp.x, tmp.y] }); }
            px = tmp.x; py = tmp.y;
          }
        }
      }
      const walls = blockers();
      const clear = (box: Box, own: string): boolean => within(box, free) && !walls.some((w) => hits(box, w)) && !owned.some((o) => o.id !== own && crosses(o.s[0], o.s[1], o.s[2], o.s[3], box));
      const built = buildCaptions({
        proj: (x, y) => { cel.mapPoint(x, y, tmp); return [tmp.x, tmp.y]; },
        upright, vp, measure,
        stationOn: (id) => cel.stationOn(id),
        laneDrawn: (id) => cel.vesselDrawn(id),
        view: free,
        liverOpen: zoom >= 1.9 || (!!picked && LIVER_EDGES.includes(picked)),
        zoomed: level === 'all' || zoom > 1.3,
        compact: vp.w < 700,
        laneCourse: laneOf,
        station: (id) => CIRCUIT_NODES[id]?.at ?? null,
        res: cel.resistorsNow,
        scale: cel.mapScale(),
        resWidth: (k) => cel.resistors.widthNow(k),
        resLane: (k) => laneOf(k === 'rGut' ? 'A_SMA' : 'C1b'),
        must: level === 'none' ? new Set([...must]) : must,
        clear,
        halfW: (id) => halfWidthPx(id, cel.mapScale()),
      });
      const out = solve({ items: level === 'none' ? built.items.filter((it) => !it.id.startsWith('lane:') && (it.id.startsWith('res:') || it.id.startsWith('z:') || must.has(it.id))) : built.items, view: view(), blockers: blockers(), lines });
      placed = new Map(out.placed.map((p) => [p.id, p]));
      metas = built.meta;
      itemsNow = new Map(built.items.map((it) => [it.id, it]));
      // what stands: write each element's words and size (while it is invisible: the layer fades in after this)
      const stand = new Set(placed.keys());
      for (const [id, e] of els) if (!stand.has(id)) { e.root.removeAttribute('data-on'); if (e.lead) e.lead.removeAttribute('data-on'); }
      for (const [id, p] of placed) {
        const m = metas.get(id)!, it = itemsNow.get(id)!;
        const e = els.get(id) ?? make(id, m);
        const f = m.forms[Math.min(p.form, m.forms.length - 1)]!;
        const rot = !!m.rot;
        const size = `${p.w}x${p.h}|${p.form}|${rot ? 'r' : ''}`;
        if (e.size !== size) {
          e.size = size;
          // (a turned caption's element is the text's own box, turned about its middle: the placed box is the turned one, so its width and height swap)
          const ow = rot ? p.h : p.w, oh = rot ? p.w : p.h;
          e.root.style.width = `${Math.round(ow * 100) / 100}px`; e.root.style.height = `${Math.round(oh * 100) / 100}px`;
          e.root.dataset.form = f.name ? '0' : '2';
          e.root.style.setProperty('--b', `${Math.round(baselineAt(oh, LS.PAD.y) * 100) / 100}px`);
          if (m.kind === 'zone') { e.name!.style.fontSize = `${fontPx(10.5, vp)}px`; }
          else if (m.kind === 'lane') { e.name!.style.fontSize = `${fontPx(10, vp)}px`; }
          else if (m.kind === 'res') { e.name!.style.fontSize = `${fontPx(11.5, vp)}px`; e.val!.style.fontSize = `${fontPx(11.5, vp)}px`; if (e.key) { e.key.style.fontSize = `${fontPx(9.5, vp)}px`; } }
        }
        if (e.text !== f.name) { e.text = f.name; e.name!.textContent = f.name; e.name!.style.display = f.name ? '' : 'none'; }
        if (m.kind === 'res') {
          if (e.key) { e.key.textContent = f.key ?? ''; e.key.style.display = f.key ? '' : 'none'; }
          const v = resText(cel.resistorsNow[m.res!] ?? 1);
          if (e.valText !== v) { e.valText = v; e.val!.textContent = v; }
          e.root.setAttribute('aria-label', m.label ?? '');
        }
        void it;
      }
      writeValues(true);
    };
    let itemsNow = new Map<string, import('../labels/solver.ts').Item>();

    /** The stations' readings, from the engine's newest frame (written when a number changes, at most four times a second). */
    const writeValues = (force: boolean, now = performance.now()) => {
      if (!force && now - lastValues < VALUE_EVERY_MS) return;
      lastValues = now;
      const f = latest.frame;
      for (const [id, p] of placed) {
        const m = metas.get(id);
        if (!m || m.kind !== 'station') continue;
        const e = els.get(id);
        if (!e?.val) continue;
        const i = NODE_AT.get(m.node!), v = f && i !== undefined ? fmtPressure(f.Pf[i] ?? null, 1, false) : '';
        const show = m.forms[Math.min(p.form, m.forms.length - 1)]!.value ? v : '';
        if (e.valText !== show) { e.valText = show; e.val.textContent = show; }
      }
    };

    const tick = () => {
      const now = performance.now(), dt = last < 0 ? 16 : Math.min(100, now - last);
      last = now;
      const onMap = cel.view === 'circuit' && cel.circuit.t >= 1 && !cel.circuit.moving;
      // the picture is still when the camera, the change and the turn are at rest, and the map's own points have not moved
      const a = cel.mapPoint(700, 400, tmp), b = cel.mapPoint(800, 400, { x: 0, y: 0 });
      const refs = `${Math.round(a.x * 2)},${Math.round(a.y * 2)},${Math.round(b.x * 2)},${Math.round(b.y * 2)}`;
      if (sceneMoving() || refs !== lastRefs) lastMove = now;
      lastRefs = refs;
      const still = onMap && now - lastMove >= SETTLE_MS;
      if (still) {
        const { vp, boxes } = useUi.getState();
        const res = cel.resistorsNow;
        const s = [vp.w, vp.h, refs, cel.circuit.upright, [...cel.stationsOf.keys()].filter((id) => cel.stationOn(id)).join(','), Object.keys(CIRCUIT_LABELS).length,
          COURSES.size, Object.entries(res).map(([k, v]) => `${k}${Math.round((v ?? 0) * 10)}`).join(','), cel.resistors.widthNow('rLiver'), cel.resistors.widthNow('rColl'), cel.resistors.widthNow('rGut'),
          useShell.getState().figure.labelLevel, [...useLabels.getState().named].join(','), usePick.getState().picked, Math.round(cel.handZoom * 20), boxKey(rectToBox(boxes.free)), blockers().map(boxKey).join(';'),
          [...COURSES.keys()].filter((id) => cel.vesselDrawn(id)).length, lookRef.current].join('|');
        if (s !== sig) { sig = s; solveNow(); }
      }
      const to = still ? 1 : 0;
      const wasAlpha = alpha;
      if (alpha !== to) alpha = Math.abs(to - alpha) <= dt / FADE_MS ? to : alpha + Math.sign(to - alpha) * (dt / FADE_MS);
      if (still) writeValues(false, now);
      if (alpha > 0 || wasAlpha > 0) {
        for (const [id, e] of els) {
          const p = placed.get(id);
          if (!p) continue;
          const it = itemsNow.get(id);
          if (!it) continue;
          const bx = it.ax + p.dx, by = it.ay + p.dy;
          const turned = !!metas.get(id)?.rot;
          const tx = turned
            ? `translate3d(${Math.round((bx + p.w / 2 - p.h / 2) * 100) / 100}px,${Math.round((by + p.h / 2 - p.w / 2) * 100) / 100}px,0) rotate(-90deg)`
            : `translate3d(${Math.round(bx * 100) / 100}px,${Math.round(by * 100) / 100}px,0)`;
          if (tx !== e.tx) { e.root.style.transform = tx; e.tx = tx; }
          e.root.style.opacity = String(Math.round(alpha * 1000) / 1000);
          e.root.setAttribute('data-on', '');
          if (e.lead) {
            if (p.leader) {
              const g = leaderGeom(it.ax, it.ay, { x0: bx, y0: by, x1: bx + p.w, y1: by + p.h });
              e.lead.style.transform = `translate(${Math.round(g.x * 100) / 100}px,${Math.round(g.y * 100) / 100}px) rotate(${g.angle.toFixed(4)}rad) scaleX(${Math.round(g.len * 100) / 100})`;
              e.lead.style.opacity = String(Math.round(alpha * 1000) / 1000); e.lead.setAttribute('data-on', '');
            } else { e.lead.removeAttribute('data-on'); }
          }
        }
        if (alpha === 0) for (const e of els.values()) { e.root.removeAttribute('data-on'); e.lead?.removeAttribute('data-on'); }
      }
      const busy = alpha !== to || (onMap && !still);
      if (busy && !hold) hold = clock.hold('circuit-captions');
      else if (!busy && hold) { hold.release(); hold = null; }
    };
    const sceneMoving = () => cel.rig.isMoving || cel.circuit.moving;
    const off = clock.on('tags', tick, 1);
    const offLabels = useLabels.subscribe(() => { sig = ''; clock.invalidate('circuit-captions'); });
    const offPick = usePick.subscribe(() => { sig = ''; clock.invalidate('circuit-captions'); });
    const offShell = useShell.subscribe(() => { sig = ''; clock.invalidate('circuit-captions'); });
    const offUi2 = useUi.subscribe((s, p) => { if (s.boxes !== p.boxes) { sig = ''; clock.invalidate('circuit-captions'); } });
    void document.fonts?.ready.then(() => { measureReset(); });
    const measureReset = () => { sig = ''; clock.invalidate('circuit-captions'); };
    return () => { off(); offLabels(); offPick(); offShell(); offUi(); offUi2(); hold?.release(); for (const e of els.values()) { e.root.remove(); e.lead?.remove(); } };
  }, []);

  return <div ref={layer} className="lb-layer cc-layer" aria-hidden="true" />;
}

const boxKey = (b: Box): string => `${Math.round(b.x0)},${Math.round(b.y0)},${Math.round(b.x1)},${Math.round(b.y1)}`;
