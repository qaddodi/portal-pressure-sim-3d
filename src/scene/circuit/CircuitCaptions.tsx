// The Circuit's words: zone titles, station names with their readings, lane captions and the resistors' readings, as DOM over the canvas in the one label type (labels.css), moved by the clock.
// What stands where is decided by the one label solver (labels/solver.ts) from the items captions.ts builds; this file only feeds it the map as the camera shows it and writes the answer.
// The words ride the picture while the camera pans or zooms it (labels/ride.ts, as the Anatomy's labels do), are placed again once it is still where their carried places no longer hold, and
// fade out while the map itself changes (the turn, the morph).
import { useEffect, useRef } from 'react';
import '../labels/labels.css';
import './captions.css';
import { clock, type TimerId } from '../../clock/frame.ts';
import { latest } from '../../engine/index.ts';
import { NODES } from '../../engine/hales/portal/topology.js';
import { useSettings } from '../../state/settings.ts';
import { resolveLook } from '../../looks/looks.ts';
import { BAR } from '../../ui/layout/plan.ts';
import { useUi, talkRects } from '../../ui/ui-store.ts';
import { useShell } from '../../ui/shell/store.ts';
import { fmtPressure } from '../../ui/text/line.ts';
import { useBlood } from '../blood/options.ts';
import { cel, usePick } from '../api.ts';
import { rectToBox, leaderGeom, within, hits, crosses, grow, type Box } from '../labels/geometry.ts';
import { makeMeasure } from '../labels/LabelLayer.tsx';
import { useLabels } from '../labels/store.ts';
import { calloutClaims } from '../labels/callout-claims.ts';
import { creditClaim } from '../labels/credit-claim.ts';
import { type Placement, solve } from '../labels/solver.ts';
import { restyle } from '../labels/roll.ts';
import { LS, baselineAt, fontPx, lookVars, typeVars } from '../labels/type.ts';
import { COURSES } from './course.ts';
import { type CapMeta, ZONE_PX, buildCaptions } from './captions.ts';
import { CIRCUIT_D, CIRCUIT_LABELS, CIRCUIT_NODES, CIRCUIT_TREES, LIVER_EDGES } from './data.copied.ts';
import { courseOf } from './paths.ts';
import { laneCourseOf, laneKeyOf } from './segment-lane.ts';
import { halfWidthOfVessel, halfWidthPx } from './cap-width.ts';
import { readUiWalls } from './ui-walls.ts';
import { resSig, resText } from './res-model.ts';
import { selectStructure } from '../../ui/action/selection.ts';
import { Ride, RoomFade, boxesFit } from '../labels/ride.ts';
import { HandWatch } from '../labels/hand-watch.ts';

const NODE_AT = new Map<string, number>((NODES as unknown as { id: string }[]).map((n, i) => [n.id, i]));
/** What a leader crossing a vessel costs the solver, per line (the hepatic artery's name hung from a leader across the whole sinusoid bundle). */
const LEADER_LINE_COST = 10;
const VALUE_EVERY_MS = 250;

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
    const gate = new Ride(), roomFade = new RoomFade(), pa = { x: 0, y: 0 }, pb = { x: 0, y: 0 }, pc = { x: 0, y: 0 }, pd = { x: 0, y: 0 }, rp = { x: 0, y: 0 };
    let alpha = 0, last = -1, lastValues = 0, hold: { release(): void } | null = null;

    const putVars = () => {
      const { vp } = useUi.getState();
      for (const [k, v] of Object.entries({ ...typeVars(vp), ...lookVars(lookRef.current, vp) })) root.style.setProperty(k, v);
      root.style.setProperty('--cc-ink', (LS.LOOKS as Record<string, Record<string, string>>)[lookRef.current]!['text-3']!);
      gate.invalidate();
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
    // the floating bars are read at rest (once the layout has settled after a change), not in a frame
    let uiWalls: Box[] = [], wallTimer: TimerId | null = null;
    const readWalls = () => { uiWalls = readUiWalls(); clock.invalidate('circuit-captions'); };   // (the signature holds the walls' boxes: a changed wall is seen there, never forced)
    const wallsLater = () => { clock.cancel(wallTimer); wallTimer = clock.after(readWalls, 260); };
    wallsLater();
    addEventListener('resize', wallsLater);
    const offWalls = useUi.subscribe((s, p) => { if (s.vp !== p.vp || s.dockShown !== p.dockShown || s.boxes !== p.boxes) wallsLater(); });
    // (the figure key stands where it docks, over the Circuit too: it is a wall like the pills, read again when it comes, goes or changes its words; "Flow volume" sat on "Umbilicus" on a Mac)
    const keyMo = new MutationObserver(wallsLater);
    for (const k of document.querySelectorAll('.lb-key-wrap')) keyMo.observe(k, { attributes: true, attributeFilter: ['data-on'], childList: true });
    // (the figure's callouts stand first, at the points a slide names: the captions keep off them as they keep off the cards and bars)
    const blockers = (): Box[] => { return [...talkRects(useUi.getState().boxes).map(rectToBox), ...uiWalls, ...calloutClaims.boxes, ...creditClaim.boxes]; };   // (the © line is a wall like the bars: no name or leader stands under it)
    const offClaims = calloutClaims.subscribe(() => { clock.invalidate('circuit-captions'); });
    const offCredit = creditClaim.subscribe(() => { clock.invalidate('circuit-captions'); });

    const solveNow = () => {
      const { vp, boxes } = useUi.getState();
      const level = useShell.getState().figure.labelLevel;
      const picked = usePick.getState().picked;
      const named = useLabels.getState().named;
      const must = new Set([...named].filter((id) => CIRCUIT_LABELS[id]));
      const zoom = cel.handZoom;
      const upright = cel.circuit.upright;
      const free = rectToBox(boxes.free), room = view();   // (the words stand in the screen's room, kept off the cards by the blockers: `boxes.free` is empty in free play and is the cards' leftovers otherwise, it must not clip a tier's title or a lane's caption)
      const laneOf = laneCourseOf;   // (a segment is one lane: its caption and its resistor run along the whole of it)
      // the vessels' centrelines on the canvas, for the soft cost of standing on one (and, by vessel, for a lane's caption to stand clear of every other)
      const lines: [number, number, number, number, number][] = [];   // (the fifth: half the width it is drawn at, so a name keeps off the tube's edge and not only its middle)
      const owned: { id: string; s: [number, number, number, number]; w: number }[] = [];
      const sc = cel.mapScale();
      for (const [id, c] of COURSES) {
        if (!cel.vesselDrawn(id)) continue;
        const p = c.mapPts, hw = halfWidthOfVessel(id, sc);
        let px = NaN, py = NaN;
        for (let i = 0; i < p.length; i += Math.max(1, Math.floor(p.length / 24))) {
          cel.mapPoint(p[i]![0], p[i]![1], tmp);
          if (!Number.isNaN(px)) { lines.push([px, py, tmp.x, tmp.y, hw]); owned.push({ id: laneKeyOf(id), s: [px, py, tmp.x, tmp.y], w: hw }); }
          px = tmp.x; py = tmp.y;
        }
      }
      // the liver's branches (the sinusoid bundle) are lines a caption keeps off too, drawn with their parent
      for (const [id, list] of Object.entries(CIRCUIT_TREES)) {
        if (!cel.vesselDrawn(id)) continue;
        for (const b of list) {
          const p = courseOf(b.d), hw = halfWidthOfVessel(id, sc) * b.k;
          let px = NaN, py = NaN;
          for (let i = 0; i < p.length; i += Math.max(1, Math.floor(p.length / 12))) {
            cel.mapPoint(p[i]![0], p[i]![1], tmp);
            if (!Number.isNaN(px)) { lines.push([px, py, tmp.x, tmp.y, hw]); owned.push({ id: `${id}~tree`, s: [px, py, tmp.x, tmp.y], w: hw }); }
            px = tmp.x; py = tmp.y;
          }
        }
      }
      const walls = blockers();
      const clear = (box: Box, own: string): boolean => within(box, room) && !walls.some((w) => hits(box, w)) && !owned.some((o) => o.id !== own && crosses(o.s[0], o.s[1], o.s[2], o.s[3], grow(box, o.w)));
      const built = buildCaptions({
        proj: (x, y) => { cel.mapPoint(x, y, tmp); return [tmp.x, tmp.y]; },
        upright, vp, measure,
        stationOn: (id) => cel.stationOn(id),
        laneDrawn: (id) => cel.vesselDrawn(id),
        view: room,
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
      const out = solve({ items: level === 'none' ? built.items.filter((it) => !it.id.startsWith('lane:') && (it.id.startsWith('res:') || it.id.startsWith('z:') || must.has(it.id))) : built.items, view: view(), blockers: blockers(), lines, leaderLineCost: LEADER_LINE_COST });
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
        // (the words first: a caption that is showing crosses over to new words or a new key, from the caption as it stood; an empty one takes no room: labels.css `:empty`)
        const keyText = f.key ?? '';
        if (e.text !== f.name || (e.key && e.key.textContent !== keyText)) {
          restyle(e.root, () => { e.text = f.name; e.name!.textContent = f.name; if (e.key) e.key.textContent = keyText; }, e.text ? alpha : 0);   // (a caption with no words yet has nothing to cross over from)
        }
        const size = `${p.w}x${p.h}|${p.form}|${rot ? 'r' : ''}`;
        if (e.size !== size) {
          e.size = size;
          // (a turned caption's element is the text's own box, turned about its middle: the placed box is the turned one, so its width and height swap)
          const ow = rot ? p.h : p.w, oh = rot ? p.w : p.h;
          e.root.style.width = `${Math.round(ow * 100) / 100}px`; e.root.style.height = `${Math.round(oh * 100) / 100}px`;
          e.root.dataset.form = f.name ? '0' : '2';
          e.root.style.setProperty('--b', `${Math.round(baselineAt(oh, LS.PAD.y) * 100) / 100}px`);
          if (m.kind === 'zone') { e.name!.style.fontSize = `${fontPx(ZONE_PX, vp)}px`; }
          else if (m.kind === 'lane') { e.name!.style.fontSize = `${fontPx(10, vp)}px`; }
          else if (m.kind === 'res') { e.name!.style.fontSize = `${fontPx(11.5, vp)}px`; e.val!.style.fontSize = `${fontPx(11.5, vp)}px`; if (e.key) { e.key.style.fontSize = `${fontPx(9.5, vp)}px`; } }
        }
        if (m.kind === 'res') {
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
    const writeValues = (force: boolean, now = clock.now()) => {
      if (!force && now - lastValues < VALUE_EVERY_MS) return;
      lastValues = now;
      const f = latest.frame;
      for (const [id, p] of placed) {
        const m = metas.get(id);
        if (m?.kind === 'res') {   // (a resistor's ratio eases: its reading is written in place, the layout signature holds only its width, resSig)
          const e = els.get(id), v = resText(cel.resistorsNow[m.res!] ?? 1);
          if (e?.val && e.valText !== v) { e.valText = v; e.val.textContent = v; }
          continue;
        }
        if (!m || m.kind !== 'station') continue;
        const e = els.get(id);
        if (!e?.val) continue;
        const i = NODE_AT.get(m.node!), v = f && i !== undefined ? fmtPressure(f.Pf[i] ?? null, 1, false) : '';
        const show = m.forms[Math.min(p.form, m.forms.length - 1)]!.value && useBlood.getState().chips ? v : '';   // (Pressure values off: the name only, as 2D's `.chips-off .lb-val`)
        if (e.valText !== show) { e.valText = show; e.val.textContent = show; }
      }
    };

    /** Everything that decides what the words say and where they may stand but the map's place on the screen (a pan only carries them). */
    const layoutSig = (): string => {
      const { vp, boxes } = useUi.getState();
      const res = cel.resistorsNow;
      return [vp.w, vp.h, cel.circuit.upright, [...cel.stationsOf.keys()].filter((id) => cel.stationOn(id)).join(','), Object.keys(CIRCUIT_LABELS).length,
        COURSES.size, resSig(res), Math.round(cel.resistors.widthNow('rLiver')), Math.round(cel.resistors.widthNow('rColl')), Math.round(cel.resistors.widthNow('rGut')),
        useShell.getState().figure.labelLevel, [...useLabels.getState().named].join(','), usePick.getState().picked, Math.round(cel.handZoom * 20), boxKey(rectToBox(boxes.free)), blockers().map(boxKey).join(';'),
        [...COURSES.keys()].filter((id) => cel.vesselDrawn(id)).length, lookRef.current].join('|');
    };
    const hand = new HandWatch();
    const tick = () => {
      const now = clock.now(), dt = last < 0 ? 16 : Math.min(100, now - last);
      last = now;
      const onMap = cel.view === 'circuit' && cel.circuit.t >= 1 && !cel.circuit.moving;
      // two points of the map: where the picture stands (the words ride it while the camera moves it, and are placed again once it is still)
      cel.mapPoint(700, 400, tmp); pa.x = tmp.x; pa.y = tmp.y;
      cel.mapPoint(800, 400, tmp); pb.x = tmp.x; pb.y = tmp.y;
      cel.mapPoint(800, 500, tmp); pc.x = tmp.x; pc.y = tmp.y;   // (four corners of a square on the plate: the words ride its perspective exactly under a tilt, ride.ts)
      cel.mapPoint(700, 500, tmp); pd.x = tmp.x; pd.y = tmp.y;
      const g = gate.step({
        now, dt, on: onMap, moving: cel.rig.isMoving, byHand: hand.step(cel.rig.handView, cel.rig.isMoving), a: pa, b: pb, c: pc, d: pd, layout: layoutSig,
        fits: (ride) => boxesFit(boxesOf(), ride, view(), blockers()),
      });
      if (g.solve) solveNow();
      alpha = g.alpha;
      if (alpha > 0) writeValues(false, now);
      if (alpha > 0 || wasShown) {
        const walls = blockers(), room = view();
        let any = false;
        for (const [id, e] of els) {
          const p = placed.get(id);
          if (!p) continue;
          const it = itemsNow.get(id);
          if (!it) continue;
          gate.ride(it.ax, it.ay, rp);
          const bx = rp.x + p.dx, by = rp.y + p.dy, ax = rp.x, ay = rp.y;
          // (a caption carried under a card or past the edge fades out whole and back once it stands clear: never seen cut)
          const ra = roomFade.of(id, { x0: bx, y0: by, x1: bx + p.w, y1: by + p.h }, room, walls, dt), a = alpha * ra;
          if (a <= 0) { e.root.removeAttribute('data-on'); e.lead?.removeAttribute('data-on'); continue; }
          any = true;
          const turned = !!metas.get(id)?.rot;
          const tx = turned
            ? `translate3d(${Math.round((bx + p.w / 2 - p.h / 2) * 100) / 100}px,${Math.round((by + p.h / 2 - p.w / 2) * 100) / 100}px,0) rotate(-90deg)`
            : `translate3d(${Math.round(bx * 100) / 100}px,${Math.round(by * 100) / 100}px,0)`;
          if (tx !== e.tx) { e.root.style.transform = tx; e.tx = tx; }
          const op = String(Math.round(a * 1000) / 1000);
          e.root.style.opacity = op;
          e.root.setAttribute('data-on', '');
          if (e.lead) {
            if (p.leader) {
              const gm = leaderGeom(ax, ay, { x0: bx, y0: by, x1: bx + p.w, y1: by + p.h });
              e.lead.style.transform = `translate(${Math.round(gm.x * 100) / 100}px,${Math.round(gm.y * 100) / 100}px) rotate(${gm.angle.toFixed(4)}rad) scaleX(${Math.round(gm.len * 100) / 100})`;
              e.lead.style.opacity = op; e.lead.setAttribute('data-on', '');
            } else { e.lead.removeAttribute('data-on'); }
          }
        }
        wasShown = any;
        if (alpha === 0) { for (const e of els.values()) { e.root.removeAttribute('data-on'); e.lead?.removeAttribute('data-on'); } roomFade.clear(); }
      }
      const busy = g.busy;
      if (busy && !hold) hold = clock.hold('circuit-captions');
      else if (!busy && hold) { hold.release(); hold = null; }
    };
    let wasShown = false;
    /** The placed captions as boxes about their dots (what a carried place is judged by). */
    const boxesOf = () => {
      const out: { ax: number; ay: number; dx: number; dy: number; w: number; h: number }[] = [];
      for (const [id, p] of placed) { const it = itemsNow.get(id); if (it) out.push({ ax: it.ax, ay: it.ay, dx: p.dx, dy: p.dy, w: p.w, h: p.h }); }
      return out;
    };
    const off = clock.on('tags', tick, 1);
    // (a store change only asks for a frame: everything these captions depend on is in the layout signature, which is compared at rest. They used to force a new placement on ANY change of the shell
    //  store, and the shell store changes all the time, so the words faded out and in again and again: the flashing. Only what the signature cannot see, a font or a measure, forces one.)
    const offLabels = useLabels.subscribe(() => { clock.invalidate('circuit-captions'); });
    const offPick = usePick.subscribe(() => { clock.invalidate('circuit-captions'); });
    const offShell = useShell.subscribe(() => { clock.invalidate('circuit-captions'); });
    const offUi2 = useUi.subscribe((s, p) => { if (s.boxes !== p.boxes) { clock.invalidate('circuit-captions'); } });
    void document.fonts?.ready.then(() => { measureReset(); });
    const measureReset = () => { gate.invalidate(); clock.invalidate('circuit-captions'); };
    return () => { off(); offClaims(); offCredit(); offLabels(); offPick(); offShell(); offUi(); offUi2(); offWalls(); keyMo.disconnect(); clock.cancel(wallTimer); removeEventListener('resize', wallsLater); hold?.release(); for (const e of els.values()) { e.root.remove(); e.lead?.remove(); } };
  }, []);

  return <div ref={layer} className="lb-layer cc-layer" aria-hidden="true" />;
}

const boxKey = (b: Box): string => `${Math.round(b.x0)},${Math.round(b.y0)},${Math.round(b.x1)},${Math.round(b.y1)}`;
