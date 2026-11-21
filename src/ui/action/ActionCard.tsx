// The tap-anything card (2D: card.js, app-03-layouts.css .action-card): the name and its direction word, the reading or the pressure bar, the readings, the controls and the
// actions of what is selected on the figure, from the card catalogue (cards.ts). On a laptop or an iPad on its side it stands at the left under the top bar (276 px); on a phone or an upright
// iPad it is a sheet above the view switch. Always in the page, faded in and out; the numbers on it re-render only when what they print changes (snap.ts). Number keys 1 to 9 run its
// first nine controls. Text never shrinks to fit and nothing scrolls inside it (but the Details face's own words, as 2D's .ad-scroll: its head stays and what is under it scrolls only where it is taller than the card's room).
import { useSheetSwipe } from '../shell/use-sheet-swipe.ts';
import { SwitchNum } from '../patients/SwitchNum.tsx';
import { useActionRoom } from './action-room.ts';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import './action.css';
import { OrderIcon } from './icons.tsx';
import { Icon } from '../shell/icons.tsx';
import { useUi } from '../ui-store.ts';
import { usesBottomBar, footHeight } from '../shell/room.ts';
import { useSelection } from './selection.ts';
import { cardFor, type Card, type Verb } from './cards.ts';
import { sameSnap, snapOf, type Snap, type VerbSnap } from './snap.ts';
import { appAct } from './act.ts';
import { injectDye, releaseDye } from './dye.ts';
import { panelFor } from './panels.ts';
import { currentParams, updateParams, useParamsTick } from './params.ts';
import { envNow } from './env.ts';
import { detailsFor } from './details.ts';
import { DetailsFace } from './DetailsFace.tsx';
import { useEngine } from '../../engine/store.ts';
import { useLens } from '../../scene/lenses/store.ts';
import { useSettings } from '../../state/settings.ts';
import { rampStops, LG_MAX } from '../../scene/lenses/legend.ts';
import { resolveLook } from '../../looks/looks.ts';
import { hvpgSev, ppgSev } from '../../engine/hales/portal/pressure-cuts.js';
import { fmt } from '../charts/fmt.ts';

// ── the number keys: the card's first nine controls, in the order the card lists them (a slider takes the focus so the arrow keys move it) ──
let keyed: (() => void)[] = [];
let shownNow = false;
/** Key n (1 to 9) on the open card: true when it did something. */
export function triggerCardVerb(n: number): boolean { const a = shownNow ? keyed[n - 1] : undefined; if (!a) return false; a(); return true; }
/** Delete or Backspace on the open card: its Remove button's own work (a shunt or a device comes down, the card eases out, Cmd Z brings it back). */
let removeNow: (() => void) | null = null;
export const removeFromCard = Object.assign((): boolean => { const r = shownNow ? removeNow : null; if (!r) return false; r(); return true; }, { available: (): boolean => shownNow && removeNow != null });
/** Whether a card is up (the number keys mean something then). */
export const cardIsOpen = (): boolean => shownNow;

function useSnap(card: Card): Snap | null {
  const [s, setS] = useState<Snap | null>(() => { const e = envNow(); return e ? snapOf(card, e) : null; });
  useEffect(() => {
    const run = () => { const e = envNow(); if (!e) return; const n = snapOf(card, e); setS((prev) => (prev && sameSnap(prev, n) ? prev : n)); };
    run();
    const off = [useEngine.subscribe(run), useParamsTick.subscribe(run), useLens.subscribe(run)];
    return () => off.forEach((f) => f());
  }, [card]);
  return s;
}

const SEV = { ok: 'ac-cut ok', caution: 'ac-cut caution', danger: 'ac-cut danger' } as const;
const STATE_CLS: Record<string, string> = { ok: 'ok', rev: 'rev', bad: 'bad', warn: 'warn' };

function SpanBar({ card, snap }: { card: Card; snap: Snap }) {
  const sp = card.span!, s = snap.span!, look = resolveLook(useSettings((x) => x.look), typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
  const ramp = useMemo(() => `linear-gradient(to right, ${rampStops(look, 'pressure', LG_MAX).map(([c, at]) => `${c} ${at.toFixed(1)}%`).join(', ')})`, [look]);
  // The strip runs 0 to 30 mmHg across its own width; stretched by 1/(ub − ua) and slid by −ua of that, the track shows ua to ub (two the same draw 0.2 mmHg wide: a still vessel shows its one colour).
  const ua = s.ok ? Math.min(1, Math.max(0, s.a / LG_MAX)) : 0.5, ub0 = s.ok ? Math.min(1, Math.max(0, s.b / LG_MAX)) : 0.5;
  const w = 0.2 / LG_MAX, ub = Math.abs(ub0 - ua) < w ? (ua + w > 1 ? ua - w : ua + w) : ub0, k = 1 / (ub - ua);
  const sev = s.ok && sp.cut ? (sp.cut === 'hvpg' ? hvpgSev(s.d) : ppgSev(s.d)) as keyof typeof SEV : null;
  return (
    <div className="ac-sp">
      <span className="ac-el">{sp.el ? sp.el[0] : null}</span><span className="ac-dv">{sp.dn || 'Δ'} <b className={sev ? SEV[sev] : 'ac-cut'}>{s.ok ? <SwitchNum text={fmt(s.d, 1)} /> : 'not measured'}</b></span><span className="ac-el r">{sp.el ? sp.el[1] : null}</span>
      <b className="ac-pa">{s.ok ? <SwitchNum text={fmt(s.a, 1)} /> : '—'}</b>
      <div className="ac-track"><i className="ac-ramp" style={{ background: ramp, transform: `translateX(${(-ua * k * 100).toFixed(2)}%) scaleX(${k.toFixed(4)})` }} /></div>
      <b className="ac-pb"><span>{s.ok ? <SwitchNum text={fmt(s.b, 1)} /> : '—'}</span><u>mmHg</u></b>
    </div>
  );
}

function Slider({ v, vs, index, setRef }: { v: Extract<Verb, { type: 'slider' }>; vs: VerbSnap; index: number; setRef: (i: number, el: HTMLInputElement | null) => void }) {
  const [drag, setDrag] = useState<number | null>(null);
  const fresh = useRef(true);   // the first change of a gesture is one History entry; the rest of the drag edits it
  const x = drag ?? vs.num!, name = v.short || v.label;
  const send = (val: number) => { updateParams((p) => { v.set(p, val); return p; }, { label: v.hist, history: fresh.current }); fresh.current = false; };
  return (
    <div className="ac-c ac-slider">
      <div className="ctl-top">{v.icon && <OrderIcon n={v.icon} className="ac-ic" />}<span className="ctl-name">{name}</span><span className="ctl-val"><SwitchNum text={v.format(x)} /></span></div>
      <div className="range-wrap" style={{ '--p': Math.min(1, Math.max(0, (x - v.min) / (v.max - v.min))) } as CSSProperties}>
        <input ref={(el) => setRef(index, el)} type="range" min={v.min} max={v.max} step={v.step} value={x} aria-label={v.label ?? ''} aria-description={v.tickNames}
          onPointerDown={() => { fresh.current = true; }} onKeyDown={() => { fresh.current = true; }}
          onInput={(e) => { const val = parseFloat((e.target as HTMLInputElement).value); setDrag(val); send(val); }}
          onPointerUp={() => setDrag(null)} onBlur={() => setDrag(null)} onChange={() => { /* (the input event carries it) */ }} />
        {v.ticks && <div className="ac-ticks" aria-hidden="true">{v.ticks.map((t) => <i key={t} className="ac-tick" style={{ '--t': (t - v.min) / (v.max - v.min) } as CSSProperties} />)}</div>}
      </div>
    </div>
  );
}

function VerbView({ card, v, vs, index, setRef }: { card: Card; v: Verb; vs: VerbSnap; index: number; setRef: (i: number, el: HTMLInputElement | null) => void }) {
  switch (v.type) {
    case 'read': case 'stat':
      return <span className="ac-r">{v.label && <em className="ac-em">{v.label}</em>}<b><SwitchNum text={vs.text ?? ''} /></b>{v.type === 'read' && v.unit && <u className="ac-u">{v.unit}</u>}</span>;
    case 'about': return <>{vs.lines!.map((t, i) => <p key={i}>{t}</p>)}</>;
    case 'meter':
      return (
        <div className="ac-c" aria-label={v.label ?? undefined}>
          <div className="ctl-top">{v.icon && <OrderIcon n={v.icon} className="ac-ic" />}<span className="ctl-name">{v.short || v.label}</span><span className="ctl-val"><SwitchNum text={`${Math.round(vs.share! * 100)}%`} /></span></div>
          <div className="ac-meter"><i className="ac-meter-fill" style={{ transform: `scaleX(${vs.share!.toFixed(2)})` }} /></div>
        </div>
      );
    case 'slider': return <Slider v={v} vs={vs} index={index} setRef={setRef} />;
    case 'toggle':
      return (
        <button type="button" className="ac-c ac-toggle" role="switch" aria-checked={!!vs.on} aria-label={v.label ?? ''} onClick={() => updateParams((p) => { v.set(p, !vs.on); return p; }, { label: `${v.hist || v.label} ${vs.on ? 'off' : 'on'}` })}>
          <span className="ctl-top">{v.icon && <OrderIcon n={v.icon} className="ac-ic" />}<span className="ctl-name">{v.short || v.label}</span><span className="ac-switch" data-on={vs.on || undefined}><i /></span></span>
        </button>
      );
    case 'seg':
      return (
        <div className="ac-c ac-segrow">
          {v.label && <div className="ctl-top"><span className="ctl-name">{v.label}</span></div>}
          <div className="ac-seg" role="group" aria-label={v.label || 'Options'}>
            {v.options.map(([val, name]) => <button key={String(val)} type="button" aria-pressed={vs.pick === val} onClick={() => v.set(appAct, val, currentParams())}>{name}</button>)}
          </div>
        </div>
      );
    case 'panel': { const View = panelFor(v.id ?? 'stent'); return View ? <div className="ac-panel"><View id={card.edge ?? ''} /></div> : null; }
    case 'button': case 'dye': case 'link':
      return (
        <button type="button" className={`ac-btn${v.type === 'button' && v.danger ? ' danger' : ''}${v.type === 'button' && v.quiet ? ' quiet' : ''}${v.type === 'dye' ? ' ac-dye' : ''}`} aria-label={v.label ?? undefined} title={vs.note || v.label || undefined}
          {...(v.type === 'dye' ? dyeHandlers : { onClick: () => v.run(appAct) })}>
          {v.icon && <OrderIcon n={v.icon} className="ac-ic" />}<span className="ac-bl">{v.short || v.label}</span>
        </button>
      );
  }
}

/** The dye button (2D card.js): a press of the pointer holds the dye going until it lifts; a key press (no pointer, detail 0) gives one bolus. */
let dyeHeld = false;
const dyeUp = () => { if (dyeHeld) { dyeHeld = false; releaseDye(); } };
const dyeHandlers = {
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => { if (e.button > 0) return; dyeHeld = true; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no capture */ } injectDye({ hold: true }); },
  onPointerUp: dyeUp, onPointerCancel: dyeUp, onLostPointerCapture: dyeUp,
  onClick: (e: React.MouseEvent) => { if (e.detail === 0) injectDye({}); },
  onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
};

const kindOf = (v: Verb): 'read' | 'about' | 'ctl' | 'act' | 'panel' => v.type === 'read' || v.type === 'stat' ? 'read' : v.type === 'about' ? 'about' : v.type === 'panel' ? 'panel'
  : v.type === 'button' || v.type === 'dye' || v.type === 'link' ? 'act' : 'ctl';

function Face({ card, onKeys, onDetails }: { card: Card; onKeys: (list: (() => void)[]) => void; onDetails: (() => void) | null }) {
  const snap = useSnap(card);
  const inputs = useRef<Map<number, HTMLInputElement>>(new Map());
  const setRef = (i: number, el: HTMLInputElement | null) => { if (el) inputs.current.set(i, el); else inputs.current.delete(i); };
  const verbs = card.verbs;
  // the number keys: sliders take the focus, switches and buttons are pressed (a link and a segmented choice are not keyed, as in 2D)
  useEffect(() => {
    if (!snap) return;
    const list: (() => void)[] = [];
    verbs.forEach((v, i) => {
      if (!snap.verbs[i]!.show) return;
      if (v.type === 'slider') list.push(() => inputs.current.get(i)?.focus());
      else if (v.type === 'toggle') list.push(() => updateParams((p) => { v.set(p, !snap.verbs[i]!.on); return p; }, { label: `${v.hist || v.label} ${snap.verbs[i]!.on ? 'off' : 'on'}` }));
      else if (v.type === 'button' || v.type === 'dye') list.push(() => v.run(appAct));
    });
    onKeys(list.slice(0, 9));
    const ri = verbs.findIndex((v, i) => v.type === 'button' && v.id === 'remove' && snap.verbs[i]!.show);
    const rv = ri >= 0 ? verbs[ri]! : null;
    removeNow = rv && rv.type === 'button' ? () => rv.run(appAct) : null;
    return () => { removeNow = null; };
  }, [snap, verbs, onKeys]);
  if (!snap) return null;
  const st = snap.status;
  const rows = { read: [] as ReactNode[], about: [] as ReactNode[], ctl: [] as ReactNode[], act: [] as ReactNode[], panel: [] as ReactNode[] };
  verbs.forEach((v, i) => { if (snap.verbs[i]!.show) rows[kindOf(v)].push(<VerbView key={i} card={card} v={v} vs={snap.verbs[i]!} index={i} setRef={setRef} />); });
  return (
    <div className="ac-body" data-key={card.key}>
      <div className="ac-nr">
        {onDetails ? <button type="button" className="ac-name ac-name-btn" aria-label={`${card.title}: details`} onClick={onDetails}><span>{card.title}</span><Icon n="chev-right" className="ac-chev" /></button> : <span className="ac-name">{card.title}</span>}<span className={`ac-state st-word ${st ? STATE_CLS[st[0]] ?? '' : ''}`}>{st ? st[1] : ''}</span></div>
      {card.span && snap.span ? <SpanBar card={card} snap={snap} />
        : snap.value && !card.noValue ? (
          <div className="ac-value"><span className="ac-num"><b><SwitchNum text={snap.value.v} /></b><span className="unit">{snap.value.u}</span></span>{snap.value.d && <span className={`ac-delta ${snap.value.up ? 'up' : 'down'}`}>{snap.value.d}</span>}</div>
        ) : null}
      {rows.read.length > 0 && <div className="ac-rs">{rows.read}</div>}
      {rows.about.length > 0 && <div className="ac-about">{rows.about}</div>}
      {rows.panel}
      {rows.ctl.length > 0 && <div className="ac-cs" data-one={rows.ctl.length === 1 || undefined}>{rows.ctl}</div>}
      {rows.act.length > 0 && <div className="ac-as">{rows.act}</div>}
    </div>
  );
}

export function ActionCard() {
  const sel = useSelection((s) => s.sel);
  const device = useUi((s) => s.device);
  const bottom = usesBottomBar(device);
  const card = useMemo(() => cardFor(sel), [sel]);
  const [held, setHeld] = useState<Card | null>(null);   // the card on show, kept while it fades out
  const [fonts, setFonts] = useState(() => typeof document === 'undefined' || !document.fonts || document.fonts.status === 'loaded');
  const ref = useRef<HTMLElement>(null);
  const [face, setFace] = useState<'card' | 'details'>('card');   // (a card's name turns it to its Details face; another structure comes up on its card)
  const hasDetails = !!card && !card.noDetails && !!detailsFor(sel);
  useEffect(() => { setFace('card'); }, [card?.key]);
  useEffect(() => { if (card) setHeld(card); }, [card]);
  useEffect(() => { if (!fonts) void document.fonts.ready.then(() => setFonts(true)); }, [fonts]);
  const shown = card ?? held, open = !!card && fonts;
  useEffect(() => { shownNow = open; if (!open) { keyed = []; removeNow = null; } return () => { shownNow = false; keyed = []; removeNow = null; }; }, [open]);
  useEffect(() => { if (face === 'details') keyed = []; }, [face]);   // (the number keys run a card's controls; the Details face has none)
  const onKeys = useMemo(() => (list: (() => void)[]) => { keyed = list; }, []);
  const close = () => import('./selection.ts').then((m) => m.selectStructure(null));
  // a phone's sheet follows a pull down from anywhere on it and closes past a short pull or a flick (2D swipeSheet; shell/sheet-swipe.ts)
  useSheetSwipe(ref, () => { void close(); }, () => bottom);
  // the card's height (from its own resize observer, no layout read) is the room it takes from the figure while it stands over it as a sheet
  useLayoutEffect(() => {
    const el = ref.current, set = useActionRoom.getState().set;
    if (!el || !open || !bottom || typeof ResizeObserver !== 'function') { set(0); return; }
    const ro = new ResizeObserver((es) => { const b = es[0]?.borderBoxSize?.[0]; set(b ? b.blockSize : es[0]?.contentRect.height ?? 0); });
    ro.observe(el);
    return () => { ro.disconnect(); set(0); };
  }, [open, bottom]);
  const style: CSSProperties | undefined = bottom ? { bottom: `calc(var(--safe-b, 0px) + ${footHeight(device) - 8 - (device === 'phone-landscape' ? 0 : 0)}px)` } : undefined;
  return (
    <section ref={ref} className="ac-card" data-open={open} data-bottom={bottom || undefined} data-device={device} style={style} role="dialog" aria-label="Actions" inert={!open}>
      <div className="ac-grab" aria-hidden="true"><i /></div>
      {shown && (face === 'details' && card && sel ? <DetailsFace key={`d-${shown.key}`} sel={sel} onBack={() => setFace('card')} />
        : <Face key={shown.key} card={shown} onKeys={onKeys} onDetails={card && hasDetails ? () => setFace('details') : null} />)}
      <button type="button" className="ac-x" aria-label="Close" title="Close (Esc)" onClick={() => void close()}><Icon n="close" /></button>
    </section>
  );
}
