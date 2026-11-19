// The label layer: the figure's station pills, their leaders, the catheter's reading cards and the colour key, drawn as DOM over the canvas
// and moved by the clock. React builds the skeleton once; the clock's `tags` phase writes transform and opacity straight on the elements
// (never through React state). The decisions (what is shown, where, when) are in controller.ts, the solver, the fader.
import { useEffect, useMemo, useRef } from 'react';
import './labels.css';
import { clock } from '../../clock/frame.ts';
import { latest, patient, indexOf } from '../../engine/index.ts';
import { flowReversed } from '../lenses/vel-normal.copied.js';
import { NODES } from '../../engine/hales/portal/topology.js';
import { useSettings } from '../../state/settings.ts';
import { resolveLook } from '../../looks/looks.ts';
import { hvpgSev } from '../../ui/cuts.ts';
import { BAR } from '../../ui/layout/plan.ts';
import { useUi } from '../../ui/ui-store.ts';
import { cel, sceneApi, usePick } from '../api.ts';
import { rectToBox, type Box } from './geometry.ts';
import { LabelController, type Draw, type LabelDeps } from './controller.ts';
import { baselineAt, lookVars, typeVars } from './type.ts';
import { keyVars } from './key-dock.ts';
import { STATIONS } from './stations.ts';
import { LABEL_NAMES } from './names.copied.ts';
import { KEY_LENSES, keyModel, schemeOf } from './key.ts';
import { linkLabelsToDeck } from './deck-link.ts';
import { useLabels } from './store.ts';
import { VesselWalk } from './VesselWalk.tsx';
import { Vector3 } from 'three';
import { MOTION } from '../../clock/tween.ts';

const NODE_AT = new Map<string, number>((NODES as unknown as { id: string }[] | [string][]).map((n, i) => [Array.isArray(n) ? n[0] : (n as { id: string }).id, i]));

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
  size: string;
  value: string;
  name?: HTMLElement;
  cur?: HTMLElement;
  rolling?: HTMLElement | null;
  tail?: string;
  leadTx: string; anchorTx: string;
  rows?: { n: HTMLElement; text: string }[];
  calcRow?: HTMLElement | null;
  rev?: boolean;
}

export function LabelLayer() {
  const layer = useRef<HTMLDivElement>(null);
  const keyHost = useRef<HTMLDivElement>(null);
  const look = useSettings((s) => s.look);
  const key = useLabels((s) => s.key);
  const dark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  const lookId = resolveLook(look, dark);
  const scheme = schemeOf(lookId);
  const lookRef = useRef(lookId); lookRef.current = lookId;
  const applyTypeRef = useRef<() => void>(() => {});
  useEffect(() => { applyTypeRef.current(); }, [lookId]);
  const model = useMemo(() => keyModel(key, scheme), [key, scheme]);
  const vpNow = useUi((s) => s.vp);

  // a lens key can be asked for by the address while the lenses are not built yet: ?key=velocity
  useEffect(() => {
    const k = new URLSearchParams(location.search).get('key');
    if (k && KEY_LENSES.includes(k)) useLabels.getState().set({ key: k });
  }, []);

  useEffect(() => {
    const root = layer.current!;
    const ui = useUi;
    const deps: LabelDeps = {
      now: () => performance.now(),
      project: (p, out) => sceneApi.project(p, out),
      cameraMoving: () => sceneApi.cameraMoving,
      free: () => rectToBox(ui.getState().boxes.free),
      view: () => { const { vp } = ui.getState(); return { x0: vp.safe.left, y0: vp.safe.top + BAR, x1: vp.w - vp.safe.right, y1: vp.h - vp.safe.bottom }; },
      blockers: () => { const b = ui.getState().boxes; return [b.words, b.data, b.strip].filter((r): r is NonNullable<typeof r> => !!r).map(rectToBox); },
      measure: makeMeasure(),
      vp: () => ui.getState().vp,
      words: () => ui.getState().boxes.words,
      reversed: (edge) => { const f = latest.frame, ref = patient.reference; if (!f) return false; const k = indexOf(edge); return flowReversed(f.Qf[k] ?? 0, ref ? (ref.Q[k] ?? 0) : 0); },
      pressure: (node) => { const f = latest.frame, i = NODE_AT.get(node); return f && i !== undefined ? (f.Pf[i] ?? null) : null; },
      reading: (k) => ui.getState().readings[k] ?? null,
      cathere: (tip: Vector3, ahead: Vector3) => {
        const c = cel.catheter;
        if (c.current.advance < 0.999) return 0;
        c.curve.getPointAt(1, tip);
        ahead.copy(tip).addScaledVector(c.curve.getTangentAt(1), 0.4);
        return c.current.balloon >= 0.999 ? 2 : 1;
      },
    };
    const ctl = new LabelController(deps);
    const recs = new Map<string, Rec>();
    const mk = (tag: string, cls: string, parent: HTMLElement = root) => { const e = document.createElement(tag); e.className = cls; parent.appendChild(e); return e; };

    // ── build the skeleton once ──
    for (const s of STATIONS) {
      const el = mk('div', 'lb');
      if (s.kind === 'organ') el.dataset.region = '';
      const name = mk('span', 'lb-name', el);
      const val = mk('span', 'lb-val', el);
      const roll = mk('span', 'lb-roll', val);
      const cur = mk('span', 'lb-cur', roll);
      const rev = mk('span', 'lb-rev', el); rev.textContent = '⟲';
      const rec: Rec = { root: el, shown: false, tx: '', op: '', form: -1, size: '', value: '', name, cur, rolling: null, leadTx: '', anchorTx: '', rev: false };
      if (s.kind !== 'organ') {
        const lead = mk('i', 'lb-lead');
        const anchor = mk('i', 'lb-anchor');
        rec.lead = lead; rec.anchor = anchor;
      }
      recs.set(s.id, rec);
    }
    const N = LABEL_NAMES.CALLOUTS;
    const makeRow = (parent: HTMLElement, kicker: string, tone: string | null) => {
      const row = mk('div', 'lb-row', parent); if (tone) row.dataset.tone = tone;
      mk('span', 'lb-k', row).textContent = kicker;
      const v = mk('span', 'lb-v', row);
      const n = mk('span', 'lb-n', v); mk('span', 'lb-u', v).textContent = N.free.unit;
      return { row, n };
    };
    for (const k of ['f', 'w', 's'] as const) {
      const el = mk('div', 'lb-call'); el.dataset.k = k;
      const rows: { n: HTMLElement; text: string }[] = [];
      let calcRow: HTMLElement | null = null;
      if (k === 'f') rows.push({ ...makeRow(el, N.free.kicker, 'free'), text: '' });
      else if (k === 'w') rows.push({ ...makeRow(el, N.wedge.kicker, 'wedge'), text: '' });
      else {
        rows.push({ ...makeRow(el, N.wedge.kicker, 'wedge'), text: '' }, { ...makeRow(el, N.free.kicker, 'free'), text: '' });
        const c = makeRow(el, N.result.kicker, null); c.row.classList.add('lb-calc'); calcRow = c.row; rows.push({ n: c.n, text: '' });
      }
      const te = mk('i', 'lb-tail-e', el), t = mk('i', 'lb-tail', el);
      void te; void t;
      recs.set('callout:' + k, { root: el, shown: false, tx: '', op: '', form: -1, size: '', value: '', tail: '', leadTx: '', anchorTx: '', rows, calcRow });
    }
    const keyRec: Rec = { root: keyHost.current!, shown: false, tx: '', op: '', form: -1, size: '', value: '', leadTx: '', anchorTx: '' };
    recs.set('key', keyRec);

    // ── the key reports its size (laid out once, invisible) ──
    // (two elements: the key as drawn, which the dock may wrap, and a hidden twin that never wraps and reports the key's size on one line)
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const t = e.target as HTMLElement;
        if (t.classList.contains('lb-key-twin')) ctl.setKeyNatural(t.offsetWidth, t.offsetHeight); else ctl.setKeySize(t.offsetWidth, t.offsetHeight);
      }
      clock.invalidate('labels-key');
    });
    const watchKey = () => { ro.disconnect(); keyHost.current?.querySelectorAll('.lb-key').forEach((k) => ro.observe(k)); };
    watchKey();
    const keyMo = new MutationObserver(watchKey);
    keyMo.observe(keyHost.current!, { childList: true });

    // ── state in ──
    const pushState = () => {
      const l = useLabels.getState();
      ctl.setState({ named: l.named, picked: usePick.getState().picked, cath: l.cath, organNames: l.organNames, key: l.key });
      clock.invalidate('labels-state');
    };
    pushState();
    const offLabels = useLabels.subscribe(pushState);
    const offPick = usePick.subscribe(pushState);
    // the 2D type at this screen (sizes follow the short side) and the look's own ink, halo and ring: written on the layer, never in a frame
    const putVars = (v: Record<string, string>) => { for (const [k, val] of Object.entries(v)) root.style.setProperty(k, val); };
    const applyType = () => { const { vp } = ui.getState(); putVars(typeVars(vp)); putVars(lookVars(lookRef.current, vp)); ctl.invalidateForms(); clock.invalidate('labels-type'); };
    applyType();
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
    const offTags = clock.on('tags', () => {
      const wantFrames = ctl.tick();
      seen.clear();
      for (const d of ctl.out) { const r = recs.get(d.id); if (r) { seen.add(d.id); paint(r, d, ctl); } }
      for (const [id, r] of recs) if (!seen.has(id)) hide(r);
      if (wantFrames && !hold) hold = clock.hold('labels');
      else if (!wantFrames && hold) { hold.release(); hold = null; }
    }, 0);

    return () => { offTags(); offLabels(); offPick(); offUi(); offLink(); ro.disconnect(); keyMo.disconnect(); document.fonts?.removeEventListener?.('loadingdone', refonts); hold?.release(); root.querySelectorAll('.lb, .lb-call, .lb-lead, .lb-anchor').forEach((e) => e.remove()); };
  }, []);

  return (
    <>
      <div ref={layer} className="lb-layer" aria-hidden="true">
        <div ref={keyHost} className="lb-key-wrap">{model && <KeyBody model={model} vp={vpNow} />}</div>
        {/* its twin: never wrapped, never seen; reports the key's size on one line, which is what the dock decides by */}
        <div className="lb-key-probe">{model && <KeyBody model={model} vp={vpNow} twin />}</div>
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
  const op = String(Math.round(d.alpha * 1000) / 1000);
  if (op !== r.op) { el.style.opacity = op; r.op = op; }
  if (d.kind === 'key') {
    const dock = d.dock, room = dock?.wrap != null ? `${px(dock.wrap)}px` : 'none', minh = `${dock?.minH ?? 0}px`;
    if (el.style.getPropertyValue('--lb-key-room') !== room) el.style.setProperty('--lb-key-room', room);
    if (el.style.getPropertyValue('--lb-key-minh') !== minh) el.style.setProperty('--lb-key-minh', minh);
    return;
  }
  // a new spot or form is taken while the label is invisible: its size and words are written then, never in a visible frame
  if (d.form !== r.form || r.size !== `${d.w}x${d.h}` || r.rev !== d.rev) {
    r.form = d.form; r.size = `${d.w}x${d.h}`; r.rev = d.rev;
    el.style.width = `${px(d.w)}px`; el.style.height = `${px(d.h)}px`;
    if (r.name) {
      const st = STATIONS.find((s) => s.id === d.id);
      const word = st ? (d.form === 0 ? st.name : d.form === 1 ? (st.abbr ?? st.name) : '') : '';
      r.name.textContent = st?.kind === 'organ' ? word.toUpperCase() : word;
      r.name.style.display = word ? '' : 'none';
      el.dataset.form = String(d.form);
      if (d.rev) el.setAttribute('data-rev', ''); else el.removeAttribute('data-rev');
      el.style.setProperty('--b', `${px(baselineAt(d.h, d.pad.y))}px`);
    }
  }
  if (d.kind === 'station') {
    if (d.value !== r.value && r.cur) {
      const was = r.value;
      r.value = d.value;
      if (!was || d.alpha < 0.05 || was === '') r.cur.textContent = d.value;
      else roll(r, d.value, was);
    }
    if (r.lead && r.anchor) {
      // the ring stands on the vessel for every station; the leader joins it to the words only when they stand away
      if (d.dot) {
        const a = `translate(${px(d.dot.x)}px,${px(d.dot.y)}px)`;
        if (a !== r.anchorTx) { r.anchor.style.transform = a; r.anchorTx = a; }
        r.anchor.setAttribute('data-on', ''); r.anchor.style.opacity = op;
      } else { r.anchor.removeAttribute('data-on'); r.anchor.style.opacity = '0'; }
      if (d.leader) {
        const t = `translate(${px(d.leader.x)}px,${px(d.leader.y)}px) rotate(${d.leader.angle.toFixed(4)}rad) scaleX(${px(d.leader.len)})`;
        if (t !== r.leadTx) { r.lead.style.transform = t; r.leadTx = t; }
        r.lead.setAttribute('data-on', ''); r.lead.style.opacity = op;
      } else { r.lead.removeAttribute('data-on'); r.lead.style.opacity = '0'; }
    }
  } else {
    // a callout's numbers (written when they change) and its pointer (written when its geometry changes: only at a new spot)
    const k = d.id.slice(8) as 'f' | 'w' | 's';
    const t = ctl.calloutText(k);
    const vals = [...t.rows.map((x) => x.value), ...(t.calc ? [t.calc.value] : [])];
    r.rows?.forEach((row, i) => { if (vals[i] !== undefined && vals[i] !== row.text) { row.text = vals[i]; row.n.textContent = vals[i]; } });
    if (k === 's' && t.calc) el.dataset.sev = hvpgSev(Number(vals[2].replace('−', '-')) || 0);
    if (d.tail) {
      const key = `${d.tail.below}|${Math.round(d.tail.fromX)}|${Math.round(d.tail.tipX)}|${Math.round(d.tail.tipY)}|${Math.round(d.w)}|${Math.round(d.h)}`;
      if (key !== r.tail) { r.tail = key; paintTail(el, d); }
    }
  }
}

/** The pointer: a triangle from the card's edge to the dot, clipped from its own box (written once per spot). */
function paintTail(el: HTMLElement, d: Draw): void {
  const t = d.tail!;
  const half = 11;                                 // PTR: the pointer's half width at the card's edge
  const baseY = t.below ? 0 : d.h;                 // the card edge it leaves (a card below its point has the pointer on its top edge)
  const into = t.below ? 1 : -1;                   // 1 px into the card, so the join has no line
  const pts: [number, number][] = [[t.fromX - half, baseY + into], [t.tipX, t.tipY], [t.fromX + half, baseY + into]];
  const grow = (p: [number, number], e: number): [number, number] => {
    const cx = (pts[0][0] + pts[2][0]) / 2, cy = baseY;
    const vx = p[0] - cx, vy = p[1] - cy, len = Math.hypot(vx, vy) || 1;
    return [p[0] + (vx / len) * e, p[1] + (vy / len) * e];
  };
  const place = (node: HTMLElement, poly: [number, number][]) => {
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
    node.style.left = `${px(x0 - 1)}px`; node.style.top = `${px(y0 - 1)}px`; node.style.width = `${px(w)}px`; node.style.height = `${px(h)}px`;
    node.style.clipPath = `polygon(${poly.map((p) => `${px(p[0] - x0)}px ${px(p[1] - y0)}px`).join(',')})`;
  };
  const edge = el.querySelector('.lb-tail-e') as HTMLElement, face = el.querySelector('.lb-tail') as HTMLElement;
  place(edge, [grow(pts[0], 1.2), grow(pts[1], 1.2), grow(pts[2], 1.2)]);
  place(face, pts);
  // the card's own border runs under the pointer's base: the face covers it
}

/** A number that changes rolls: the old one goes up and out, the new one comes up from below (400 ms, transform and opacity). */
function roll(r: Rec, next: string, was: string): void {
  const cur = r.cur!;
  const box = cur.parentElement!;
  box.querySelectorAll('.lb-old').forEach((e) => e.remove());
  const old = document.createElement('span');
  old.className = 'lb-old'; old.textContent = was;
  box.appendChild(old);
  cur.textContent = next;
  const ease = 'cubic-bezier(.2, .7, .2, 1)';
  const out = old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-0.55em)' }], { duration: MOTION.rollMs, easing: ease, fill: 'both' });
  out.onfinish = () => old.remove();
  cur.animate([{ opacity: 0, transform: 'translateY(0.55em)' }, { opacity: 1, transform: 'none' }], { duration: MOTION.rollMs, easing: ease });
}

/** The key's pill: the lens named, then its scale or its named swatches (the 2D app's presenter.js keyNodes). */
function KeyBody({ model, vp, twin = false }: { model: NonNullable<ReturnType<typeof keyModel>>; vp: ReturnType<typeof useUi.getState>['vp']; twin?: boolean }) {
  const grad = !!model.scale;
  return (
    <div className={twin ? 'lb-key lb-key-twin' : 'lb-key'} role={twin ? undefined : 'img'} aria-label={twin ? undefined : model.aria} aria-hidden={twin ? true : undefined}
      data-lens={model.lens} data-grad={grad ? '' : undefined} style={keyVars(vp, grad) as React.CSSProperties}>
      <b>{model.name}</b>
      {model.scale && (model.scale.ends
        ? <span className="lb-ends"><span>{model.scale.lo}</span><i className="lb-bar" style={{ background: model.scale.gradient }} /><span>{model.scale.hi}</span></span>
        : <i className="lb-bar" style={{ background: model.scale.gradient }} />)}
      {model.swatches && <span className="lb-items">{model.swatches.map((s) => <span key={s.label} className="lb-k"><i className="lb-sw" style={{ background: s.colour }} />{s.label}</span>)}</span>}
    </div>
  );
}
