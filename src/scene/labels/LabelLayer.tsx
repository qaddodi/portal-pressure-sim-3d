// The label layer: the figure's station pills, their leaders, the catheter's reading cards and the colour key, drawn as DOM over the canvas
// and moved by the clock. React builds the skeleton once; the clock's `tags` phase writes transform and opacity straight on the elements
// (never through React state). The decisions (what is shown, where, when) are in controller.ts, the solver, the fader.
import { useEffect, useMemo, useRef, useState } from 'react';
import { reduced } from '../../ui/a11y/motion.ts';
import './labels.css';
import { clock } from '../../clock/frame.ts';
import { latest, patient, indexOf } from '../../engine/index.ts';
import { flowReversed } from '../lenses/vel-normal.copied.js';
import { NODES } from '../../engine/hales/portal/topology.js';
import { useSettings } from '../../state/settings.ts';
import { resolveLook } from '../../looks/looks.ts';
import { BAR } from '../../ui/layout/plan.ts';
import { useUi, talkRects } from '../../ui/ui-store.ts';
import { useTestsRoom } from '../../ui/tests/room.ts';
import { labelView, placeBlockers } from './room.ts';
import { cel, sceneApi, usePick } from '../api.ts';
import { rectToBox, type Box } from './geometry.ts';
import { labelsShown } from '../../boot/ready.ts';
import { LabelController, type Draw, type LabelDeps, GHOST } from './controller.ts';
import { baselineAt, lookVars, typeVars } from './type.ts';
import { keyVars } from './key-dock.ts';
import { STATIONS } from './stations.ts';
import { STENT_STATIONS, decodeGeo, geoPx, geoGapPx, geoLineSize } from './stent-labels.ts';
import { stentReads } from './stent-reads.ts';
import { bindLabelHits, labelNodeAt } from './hit.ts';
import { useSelection } from '../../ui/action/selection.ts';
import { buildCath } from './cath-dom.ts';
import { ClampMarks } from './clamp-marks.ts';
import { WaistBrackets } from './waist-bracket.ts';
import { buildProbeLabels } from './probe-labels-dom.ts';
import { addLabelBox, beginLabelBoxes } from './probe-boxes.ts';
import { coverClip } from './probe-cover.ts';
import { cathVars, cathLook } from './cath.ts';
import { KEY_LENSES, keyModel, schemeOf } from './key.ts';
import { linkLabelsToDeck } from './deck-link.ts';
import { useLabels, useFigure } from './store.ts';
import { FigureCards } from './figure-cards.ts';
import { toneCss } from '../../ui/deck/figure-plan.ts';
import { VesselWalk } from './VesselWalk.tsx';
import { Vector3 } from 'three';
import { presenceOf, type PresenceFrame } from '../vessels/network.ts';
import { PLATE_BOUNDS, FIGURE_Z } from '../anatomy/placeholder.ts';
import { showNumber } from './roll.ts';
import { StationExtras, NO_EXTRAS, type Extras } from './readings.ts';
import { useLens } from '../lenses/store.ts';
import { useCompare } from '../../ui/compare/store.ts';
import { useBlood } from '../blood/options.ts';
import { useShell } from '../../ui/shell/store.ts';
import { EDGES } from '../../engine/hales/portal/topology.js';
import { NETWORK_BY_ID } from '../vessels/network.ts';

// the figure's top and bottom (the plate's own bounds), projected to tell how big it stands now (controller.ts FIG_MIN_H)
const plateTop = new Vector3((PLATE_BOUNDS.x0 + PLATE_BOUNDS.x1) / 2, PLATE_BOUNDS.y1, FIGURE_Z), plateBottom = new Vector3((PLATE_BOUNDS.x0 + PLATE_BOUNDS.x1) / 2, PLATE_BOUNDS.y0, FIGURE_Z);
const plateA = { x: 0, y: 0 }, plateB = { x: 0, y: 0 };

const NODE_AT = new Map<string, number>((NODES as unknown as { id: string }[] | [string][]).map((n, i) => [Array.isArray(n) ? n[0] : (n as { id: string }).id, i]));

/** The stations either side of a narrowed vessel (2D `flagged`: the findings name them). */
function stenosedNodes(): string[] {
  const sten = (patient.params as { stenosis?: Record<string, number> } | null)?.stenosis;
  const out: string[] = [];
  if (!sten) return out;
  for (const id of Object.keys(sten)) {
    const e = sten[id]! > 0 ? (EDGES as { id: string; from: string; to: string }[]).find((x) => x.id === id) : null;
    if (e) out.push(e.from, e.to);
  }
  return out;
}

const FONT = (size: number, weight: number) => `${weight} ${size}px Inter, system-ui, -apple-system, "Segoe UI", sans-serif`;

/** Text width in px at a font, measured on one hidden canvas (build time only: never in a frame). */
export function makeMeasure(): LabelDeps['measure'] {
  const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = cv?.getContext('2d') ?? null;
  const cache = new Map<string, number>();
  return (text, size, weight, track = 0) => {
    const k = `${size}|${weight}|${track}|${text}`;
    let w = cache.get(k);
    if (w === undefined) {
      if (ctx) { ctx.font = FONT(size, weight); w = ctx.measureText(text).width + track * text.length; } else w = text.length * size * 0.56;
      cache.set(k, w);
    }
    return w;
  };
}

interface Rec {
  root: HTMLElement;
  lead?: HTMLElement;
  anchor?: HTMLElement;
  shown: boolean;
  tx: string; op: string;
  form: number;
  word?: string;
  size: string;
  value: string;
  name?: HTMLElement;
  cur?: HTMLElement;
  rolling?: HTMLElement | null;
  leadTx: string; anchorTx: string;
  rev?: boolean;
  tone?: string;
  unit?: HTMLElement; delta?: HTMLElement; alert?: HTMLElement;
  /** the words written after the number, so a frame writes them only when they change */
  say: string;
  deltaUp?: boolean;
  /** a stent's own label: the box its lines are written in, and the words they were written from */
  geo?: HTMLElement; geoWord?: string;
  vtint?: string; gate?: boolean;
}

export function LabelLayer() {
  const layer = useRef<HTMLDivElement>(null);
  const probeLayer = useRef<HTMLDivElement>(null);
  const keyHost = useRef<HTMLDivElement>(null);
  const keyLayer = useRef<HTMLDivElement>(null);
  const probeHost = useRef<HTMLDivElement>(null);
  const look = useSettings((s) => s.look);
  const key = useLabels((s) => s.key);
  const dark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  const lookId = resolveLook(look, dark);
  const scheme = schemeOf(lookId);
  const lookRef = useRef(lookId); lookRef.current = lookId;
  const applyTypeRef = useRef<() => void>(() => {});
  useEffect(() => { applyTypeRef.current(); }, [lookId]);
  const model = useMemo(() => keyModel(key, scheme), [key, scheme]);
  // The key never pops: one that goes (no key, or another lens) stays drawn while the layer eases its pill out (the controller's alpha), and a lens that follows another fades in over the old one fading out.
  const { now: keyNow, leaving: keyOut } = useKeyBlend(model);
  const vpNow = useUi((s) => s.vp);

  // a lens key can be asked for by the address while the lenses are not built yet: ?key=velocity
  useEffect(() => {
    const k = new URLSearchParams(location.search).get('key');
    if (k && KEY_LENSES.includes(k)) useLabels.getState().set({ key: k });
  }, []);

  useEffect(() => {
    const root = layer.current!, probeRoot = probeLayer.current!;
    const ui = useUi;
    const readings = new StationExtras();
    const stentView = stentReads(() => lookRef.current);
    const deps: LabelDeps = {
      now: () => clock.now(),
      project: (p, out) => sceneApi.project(p, out),
      cameraMoving: () => sceneApi.cameraMoving,
      free: () => rectToBox(ui.getState().boxes.free),
      view: () => labelView(ui.getState().vp, BAR, useTestsRoom.getState().place),
      blockers: () => { return [...talkRects(ui.getState().boxes).map(rectToBox), ...placeBlockers(useTestsRoom.getState().place), ...figCards.boxes]; },
      measure: makeMeasure(),
      drawn: (v) => { const f = latest.frame; return f ? presenceOf(v as never, f as unknown as PresenceFrame, { collaterals: false }) === 'shown' : v.kind !== 'collateral' && v.kind !== 'shunt'; },
      figureH: () => { const a = sceneApi.project(plateTop, plateA), b = sceneApi.project(plateBottom, plateB); return Math.abs(b.y - a.y); },
      vp: () => ui.getState().vp,
      words: () => ui.getState().boxes.words,
      reversed: (edge) => { const f = latest.frame, ref = patient.reference; if (!f) return false; const k = indexOf(edge); return flowReversed(f.Qf[k] ?? 0, ref ? (ref.Q[k] ?? 0) : 0); },
      pressure: (node) => { const f = latest.frame, i = NODE_AT.get(node); return f && i !== undefined ? (f.Pf[i] ?? null) : null; },
      reading: (k) => ui.getState().readings[k] ?? null,
      zoom: () => cel.rig.handZoom,
      level: () => useShell.getState().figure.labelLevel,
      chips: () => useBlood.getState().chips,
      stenosed: () => stenosedNodes(),
      stents: () => stentView,
      extras: (node, P, flags) => {
        const f = latest.frame;
        if (!f) return NO_EXTRAS;
        const cmp = useCompare.getState(), lens = cmp.snap && cmp.view === 'D' ? 'delta' : useLens.getState().lens;
        const ref = patient.reference;
        return readings.read(node, P, {
          f: f as never, healthy: ref ? { Q: ref.Q } : null, refP: cel.lens.sinceReference, lens, cmp: !!cmp.snap, presenting: flags.presenting, selected: flags.selected, lit: flags.lit,
          veinShown: (edge) => { const v = NETWORK_BY_ID.get(edge); return !!v && v.tone !== 'artery' && deps.drawn!(v as never); }, params: patient.params,
        });
      },
      hidden: () => cel.circuit.t > 0 || cel.circuit.toCircuit,
      anatomy: () => cel.view === 'body' && cel.circuit.t === 0 && !cel.circuit.toCircuit && !cel.diving,   // (the readout callouts: only where the body stands settled, never over a dive, going in or coming back)
      // the varices and the fundal varices: 2D's hasVarices (a label only where the patient has them; the one whose card is open stays)
      present: (id) => {
        const sel = useSelection.getState().sel, m = (latest.frame as unknown as { metrics?: { varix?: { present?: boolean }; gastricVarix?: { present?: boolean; d?: number } } } | null)?.metrics;
        if (sel?.type === 'organ' && sel.id === (id === 'VAR' ? 'varices' : 'gastric')) return true;
        return id === 'VAR' ? !!m?.varix?.present : (m?.gastricVarix?.d ?? 0) > 0 && !!m?.gastricVarix?.present;
      },
      cathere: (tip: Vector3, ahead: Vector3) => {
        // The tip and the point ahead of it are the DRAWN catheter's (the procedure layer's HVPG route, in the amber column), never the slice catheter's own old curve, which is not drawn any more:
        // read from it the point "ahead" was a fixed 0.4 scene units on, far off the vein, and the WHVP card pointed at nothing (20 Nov 2026).
        const c = cel.catheter;
        if (c.current.advance < 0.999) return 0;
        if (!cel.catheterRead) return 0;   // (a reading's callout comes with its tracing settled on the monitor, not when the tip arrives)
        if (!cel.procPoints('hvpg', tip, ahead)) return 0;
        return c.current.balloon >= 0.999 ? 2 : 1;
      },
    };
    // what the slide stands on the figure besides the names (marks, sites, steps, calipers); the station names keep clear of its cards
    const figCards: FigureCards = new FigureCards(root, {
      project: deps.project, cameraMoving: deps.cameraMoving,
      view: () => deps.view(), blockers: () => talkRects(ui.getState().boxes).map(rectToBox).concat(placeBlockers(useTestsRoom.getState().place)),
      vp: () => ui.getState().vp, measure: deps.measure, now: deps.now, spleenScale: () => cel.disease.organs.spleenScaleNow,
      circuit: () => (cel.view === 'circuit' && cel.circuit.t >= 1 ? { k: cel.mapScale(), project: (x, y, out) => cel.mapPoint(x, y, out) } : null),
      lobule: (name, out) => { if (cel.view !== 'lobule') return null; const a = cel.lobule.anchor(name, [0, 0, 0]); return out.set(a[0], a[1], a[2]); },
      lobuleRing: (name, out) => { if (cel.view !== 'lobule') return null; const a = cel.lobule.ringEdge(name, [0, 0, 0]); return out.set(a[0], a[1], a[2]); },
    });
    const pushFigure = () => { const f = useFigure.getState(); figCards.set(f.cards, f.calipers, f.t0, f.spans); clock.invalidate('figure-cards'); };
    pushFigure();
    const offFigure = useFigure.subscribe(pushFigure);
    const ctl = new LabelController(deps);
    const offHits = bindLabelHits((x, y) => labelNodeAt(ctl.out, x, y));
    const recs = new Map<string, Rec>();
    const mk = (tag: string, cls: string, parent: HTMLElement = root) => { const e = document.createElement(tag); e.className = cls; parent.appendChild(e); return e; };

    // ── build the skeleton once ──
    // (each station has two pictures: the label, and the one it is leaving while it crosses to a new spot or new words, drawn as its own element with no ring: fade.ts)
    for (const s of [...STATIONS, ...STENT_STATIONS]) {
      for (const ghost of [false, true]) {
        const el = mk('div', ghost ? 'lb lb-ghost' : 'lb');
        if (s.stent?.pt === 'geo') el.dataset.geo = '';
        if (s.kind === 'organ') el.dataset.region = '';
        const name = mk('span', 'lb-name', el);
        const val = mk('span', 'lb-val', el);
        const roll = mk('span', 'lb-roll', val);
        const cur = mk('span', 'lb-cur', roll);
        const unit = mk('span', 'lb-unit', el), delta = mk('span', 'lb-delta', el), alert = mk('span', 'lb-alert', el);
        const rev = mk('span', 'lb-rev', el); rev.textContent = '⟲';
        const rec: Rec = { root: el, shown: false, tx: '', op: '', form: -1, size: '', value: '', name, cur, rolling: null, leadTx: '', anchorTx: '', rev: false, unit, delta, alert, say: '' };
        if (s.stent?.pt === 'geo') rec.geo = mk('div', 'lb-geo', el);
        if (s.kind !== 'organ') {
          const lead = mk('i', 'lb-lead');
          const anchor = mk('i', 'lb-anchor');
          rec.lead = lead; rec.anchor = anchor;
        }
        recs.set(ghost ? s.id + GHOST : s.id, rec);
      }
    }
    // the catheter's reading cards: built once, written by cath-dom.ts as transform and opacity
    const cath = buildCath(root);
    // the Tests devices' readings (the FibroScan probe's screen, the Doppler gate's callout)
    const probeLabels = buildProbeLabels(probeRoot);
    // the stenosis's arrowheads, flat on the screen (disease/clamps.ts says where they stand)
    const clampMarks = new ClampMarks(root, deps.project);
    const waistBrackets = new WaistBrackets(root, deps.project);
    const keyRec: Rec = { root: keyHost.current!, shown: false, tx: '', op: '', form: -1, size: '', value: '', leadTx: '', anchorTx: '', say: '' };
    recs.set('key', keyRec);

    // ── the key reports its size (laid out once, invisible) ──
    // (two elements: the key as drawn, which the dock may wrap, and a hidden twin that never wraps and reports the key's size on one line)
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const t = e.target as HTMLElement;
        if (t.classList.contains('lb-key-twin')) ctl.setKeyNatural(t.offsetWidth, t.offsetHeight); else if (!t.classList.contains('lb-key-out')) ctl.setKeySize(t.offsetWidth, t.offsetHeight);
      }
      clock.invalidate('labels-key');
    });
    // (both: the drawn key in the wrap AND its twin in the probe: the dock decides by the twin, so a twin nobody watches leaves it deciding by the wrapped key's own size, which flips it
    //  between one line and two for ever: the key flickered and stood at two heights)
    const watchKey = () => { ro.disconnect(); keyLayer.current?.querySelectorAll('.lb-key').forEach((k) => ro.observe(k)); };
    watchKey();
    const keyMo = new MutationObserver(watchKey);
    for (const h of [keyHost.current!, probeHost.current!]) keyMo.observe(h, { childList: true });

    // ── state in ──
    const pushState = () => {
      const l = useLabels.getState();
      ctl.setState({ named: l.named, shown: l.shown, tones: l.tones, picked: usePick.getState().picked, cath: l.cath, organNames: l.organNames, quiet: l.quiet, panel: l.panel, proc: l.proc, key: l.key, presenting: l.presenting });
      clock.invalidate('labels-state');
    };
    pushState();
    const offLabels = useLabels.subscribe(pushState);
    const offPick = usePick.subscribe(pushState);
    // the 2D type at this screen (sizes follow the short side) and the look's own ink, halo and ring: written on the layer, never in a frame
    const putVars = (v: Record<string, string>) => { for (const [k, val] of Object.entries(v)) root.style.setProperty(k, val); };
    const applyType = () => { const { vp } = ui.getState(); putVars(typeVars(vp)); putVars(lookVars(lookRef.current, vp)); putVars(cathVars(vp)); putVars(cathLook(lookRef.current)); ctl.invalidateForms(); clock.invalidate('labels-type'); };
    applyType();
    const offTests = useTestsRoom.subscribe(() => { ctl.markDirty(); clock.invalidate('labels-tests'); });
    const offUi = ui.subscribe((s, p) => { if (s.vp !== p.vp) applyType(); if (s.boxes !== p.boxes || s.vp !== p.vp) { ctl.markDirty(); clock.invalidate('labels-boxes'); } });
    applyTypeRef.current = applyType;
    const offLink = linkLabelsToDeck();
    const refonts = () => { ctl.invalidateForms(); clock.invalidate('labels-fonts'); };
    void document.fonts?.ready.then(refonts);
    document.fonts?.addEventListener?.('loadingdone', refonts);

    // ── the frame: the clock's tags phase ──
    let hold: { release(): void } | null = null;
    const hide = (r: Rec) => { if (r.shown) { r.shown = false; r.root.style.opacity = '0'; r.root.removeAttribute('data-on'); r.op = '0'; r.lead?.removeAttribute('data-on'); r.anchor?.removeAttribute('data-on'); if (r.lead) r.lead.style.opacity = '0'; if (r.anchor) r.anchor.style.opacity = '0'; } };
    const seen = new Set<string>();
    let lastClip = '';
    const offTags = clock.on('tags', () => {
      const cardFrames = figCards.tick();
      const wantFrames = ctl.tick() || cardFrames;
      seen.clear();
      for (const d of ctl.out) { const r = recs.get(d.id); if (r) { seen.add(d.id); paint(r, d, ctl); } }
      for (const [id, r] of recs) if (!seen.has(id)) hide(r);
      cath.paint(ctl.cath);
      clampMarks.paint(cel.disease.clamps.marks());
      waistBrackets.paint(cel.procs.stents);
      if (ctl.out.length > 1 && ctl.out.every((d) => d.alpha >= 0.999)) labelsShown();   // (the splash waits for the labels to be fully in, boot/ready.ts)
      // the boxes the Doppler probe keeps off, and the probes' own readings
      beginLabelBoxes();
      for (const d of ctl.out) if (d.kind === 'station' && !d.ghost && d.alpha > 0.05) addLabelBox(d.x, d.y, d.w, d.h);
      probeLabels.paint();
      const clip = coverClip();   // (the devices' bodies cut out of the labels' layer: a probe is over the text; the probes' own readings are in their own layer above)
      if (clip !== lastClip) { lastClip = clip; root.style.clipPath = clip; }
      if (wantFrames && !hold) hold = clock.hold('labels');
      else if (!wantFrames && hold) { hold.release(); hold = null; }
    }, 0);

    return () => { figCards.destroy(); offFigure(); cath.destroy(); clampMarks.destroy(); waistBrackets.destroy(); probeLabels.destroy(); offHits(); offTags(); offLabels(); offPick(); offUi(); offTests(); offLink(); ro.disconnect(); keyMo.disconnect(); document.fonts?.removeEventListener?.('loadingdone', refonts); hold?.release(); root.querySelectorAll('.lb, .lb-lead, .lb-anchor').forEach((e) => e.remove()); };
  }, []);

  return (
    <>
      <div ref={layer} className="lb-layer" aria-hidden="true">
      </div>
      <div ref={probeLayer} className="lb-layer lb-probe-layer" aria-hidden="true" />
      {/* the key has a layer of its own, over the cards: it docks in the words card's foot (2D: the legend stands in the teaching card's bottom left), and the labels' layer is under the cards */}
      <div ref={keyLayer} className="lb-layer lb-key-layer" aria-hidden="true">
        <div ref={keyHost} className="lb-key-wrap">
          {keyOut && <KeyBody key={`out:${keyOut.lens}`} model={keyOut} vp={vpNow} fade="out" />}
          {keyNow && <KeyBody key={keyNow.lens} model={keyNow} vp={vpNow} fade={keyOut ? 'in' : undefined} />}
        </div>
        {/* its twin: never wrapped, never seen; reports the key's size on one line, which is what the dock decides by */}
        <div ref={probeHost} className="lb-key-probe">{keyNow && <KeyBody model={keyNow} vp={vpNow} twin />}</div>
      </div>
      <VesselWalk />
    </>
  );
}

const px = (n: number) => Math.round(n * 100) / 100;

function paint(r: Rec, d: Draw, ctl: LabelController): void {
  const el = r.root;
  if (!r.shown) { r.shown = true; el.setAttribute('data-on', ''); }
  const tx = d.kind === 'key' ? `translate3d(${px(d.x)}px,${px(d.y)}px,0)` : `translate3d(${px(d.x)}px,${px(d.y)}px,0)`;
  if (tx !== r.tx) { el.style.transform = tx; r.tx = tx; }
  // (a label crossing to a new spot or new words: this picture's share of the label's opacity; the ring is the label's own)
  const op = String(Math.round(d.alpha * d.mix * 1000) / 1000);
  if (op !== r.op) { el.style.opacity = op; r.op = op; }
  const ringOp = String(Math.round(d.ringAlpha * 1000) / 1000);
  if (d.kind === 'key') {
    const dock = d.dock, room = dock?.wrap != null ? `${px(dock.wrap)}px` : 'none', minh = `${dock?.minH ?? 0}px`;
    if (el.style.getPropertyValue('--lb-key-room') !== room) el.style.setProperty('--lb-key-room', room);
    if (el.style.getPropertyValue('--lb-key-minh') !== minh) el.style.setProperty('--lb-key-minh', minh);
    return;
  }
  // a new spot or form is taken while the label is invisible: its size and words are written then, never in a visible frame
  if (d.form !== r.form || r.word !== d.word || r.size !== `${d.w}x${d.h}` || r.rev !== d.rev) {
    r.form = d.form; r.word = d.word; r.size = `${d.w}x${d.h}`; r.rev = d.rev;
    el.style.width = `${px(d.w)}px`; el.style.height = `${px(d.h)}px`;
    if (r.geo) writeGeo(r, d.word);
    if (r.name) {
      const word = r.geo ? '' : d.word;   // (the controller's own words for this form; an organ's already stand in capitals; a stent's lines are written in its own box)
      r.name.textContent = word;
      r.name.style.display = word ? '' : 'none';
      el.dataset.form = word ? String(d.form) : '2';
      if (d.rev) el.setAttribute('data-rev', ''); else el.removeAttribute('data-rev');
      el.style.setProperty('--b', `${px(baselineAt(d.h, d.pad.y))}px`);
    }
  }
  if (d.kind === 'station') {
    // what follows the name: the unit, the change badge, an alert, or words in place of the number (written when they change: the box was laid out for them when it took its place)
    if (r.unit) {
      const u = d.note || d.unit, say = `${u}|${d.delta}|${d.alert}|${d.note ? 'n' : ''}`;
      if (say !== r.say) {
        r.say = say;
        r.unit.textContent = u; r.delta!.textContent = d.delta; r.alert!.textContent = d.alert;
        if (d.note) el.setAttribute('data-note', ''); else el.removeAttribute('data-note');
      }
    }
    // a stent point's number colour (the velocity lens's against the stent's own normal) and the point the Doppler samples (its name in bold)
    const tint = d.tint ?? '';
    if ((r.vtint ?? '') !== tint) { r.vtint = tint; if (tint) { el.style.setProperty('--lb-vtint', tint); el.setAttribute('data-tint', ''); } else { el.style.removeProperty('--lb-vtint'); el.removeAttribute('data-tint'); } }
    if (!!r.gate !== !!d.gate) { r.gate = !!d.gate; if (d.gate) el.setAttribute('data-gate', ''); else el.removeAttribute('data-gate'); }
    // the colour the slide's words give this station (2D .lb.term): written when the slide changes it, never in a moving frame
    const tone = d.tone ? toneCss(d.tone) : '';
    if ((r.tone ?? '') !== tone) { r.tone = tone; if (tone) { el.style.setProperty('--lb-tone', tone); el.setAttribute('data-tone', ''); } else { el.style.removeProperty('--lb-tone'); el.removeAttribute('data-tone'); }
      for (const x of [r.anchor, r.lead]) if (x) { if (tone) { x.style.setProperty('--lb-tone', tone); x.setAttribute('data-tone', ''); } else { x.style.removeProperty('--lb-tone'); x.removeAttribute('data-tone'); } } }
    if (d.value !== r.value && r.cur) {
      const was = r.value;
      r.value = d.value;
      if (!was || d.alpha < 0.05 || was === '') r.cur.textContent = d.value;
      else showNumber(r, d.value, was);
    }
    if (r.lead && r.anchor) {
      // the ring stands on the vessel for every station; the leader joins it to the words only when they stand away
      if (d.dot) {
        const a = `translate(${px(d.dot.x)}px,${px(d.dot.y)}px)`;
        if (a !== r.anchorTx) { r.anchor.style.transform = a; r.anchorTx = a; }
        r.anchor.setAttribute('data-on', ''); r.anchor.style.opacity = ringOp;
      } else { r.anchor.removeAttribute('data-on'); r.anchor.style.opacity = '0'; }
      if (d.leader) {
        const t = `translate(${px(d.leader.x)}px,${px(d.leader.y)}px) rotate(${d.leader.angle.toFixed(4)}rad) scaleX(${px(d.leader.len)})`;
        if (t !== r.leadTx) { r.lead.style.transform = t; r.leadTx = t; }
        r.lead.setAttribute('data-on', ''); r.lead.style.opacity = op;
      } else { r.lead.removeAttribute('data-on'); r.lead.style.opacity = '0'; }
    }
  }
}

/** A stent's own label written as lines (stent-labels.ts encodeGeo): each line a row of runs at the 2D sizes of this screen, its baseline where the 2D app writes it. Written when its words change, while it is invisible. */
function writeGeo(r: Rec, word: string): void {
  if (!r.geo || r.geoWord === word) return;
  r.geoWord = word;
  const vp = useUi.getState().vp;
  r.geo.textContent = '';
  for (const line of decodeGeo(word)) {
    const row = document.createElement('div');
    row.className = 'lb-gl';
    const h = geoLineSize(line, vp, (t, size) => t.length * size * 0.56).h;   // (only the height is used: the line's tallest run at the 2D line height)
    row.style.height = `${px(h)}px`; row.style.setProperty('--b', `${px(baselineAt(h, 0))}px`);
    line.forEach((run, i) => {
      const sp = document.createElement('span');
      sp.className = `lb-g-${run.k}`;
      sp.textContent = run.t;
      sp.style.fontSize = `${px(geoPx(run, vp))}px`; sp.style.fontWeight = String(run.weight);
      if (i) sp.style.marginLeft = `${px(geoGapPx(run))}px`;
      row.appendChild(sp);
    });
    r.geo.appendChild(row);
  }
}

/** The key's pill: the lens named, then its scale or its named swatches (the 2D app's presenter.js keyNodes). */
type KeyM = NonNullable<ReturnType<typeof keyModel>>;
const KEY_BLEND_MS = 240;
/** The key on show, kept through its fade-out, and the one it replaces while it cross-fades (nothing pops). */
function useKeyBlend(model: KeyM | null): { now: KeyM | null; leaving: KeyM | null } {
  const last = useRef<KeyM | null>(model);
  const [leaving, setLeaving] = useState<KeyM | null>(null);
  useEffect(() => {
    const was = last.current;
    if (!model) return;
    last.current = model;
    if (!was || was.lens === model.lens) return;
    if (reduced()) return;
    setLeaving(was);
    const t = clock.after(() => setLeaving(null), KEY_BLEND_MS + 40);
    return () => clock.cancel(t);
  }, [model]);
  return { now: model ?? last.current, leaving: leaving && model && leaving.lens !== model.lens ? leaving : null };
}

function KeyBody({ model, vp, twin = false, fade }: { model: KeyM; vp: ReturnType<typeof useUi.getState>['vp']; twin?: boolean; fade?: 'in' | 'out' }) {
  const grad = !!model.scale;
  return (
    <div className={twin ? 'lb-key lb-key-twin' : `lb-key${fade ? ` lb-key-${fade}` : ''}`} role={twin ? undefined : 'img'} aria-label={twin ? undefined : model.aria} aria-hidden={twin ? true : undefined}
      data-lens={model.lens} data-grad={grad ? '' : undefined} style={keyVars(vp, grad) as React.CSSProperties}>
      <b>{model.name}</b>
      {model.scale && (model.scale.ends
        ? <span className="lb-ends"><span>{model.scale.lo}</span><i className="lb-bar" style={{ background: model.scale.gradient }} /><span>{model.scale.hi}</span></span>
        : <i className="lb-bar" style={{ background: model.scale.gradient }} />)}
      {model.swatches && <span className="lb-items">{model.swatches.map((s) => <span key={s.label} className="lb-k"><i className="lb-sw" style={{ background: s.colour }} />{s.label}</span>)}</span>}
    </div>
  );
}
