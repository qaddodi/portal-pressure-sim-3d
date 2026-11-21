// ?audit: the page's own motion, all of it. (1) every CSS animation and transition (a start, its planned length and easing, how it ended), from the browser's own events; (2) a mutation
// ledger: when any element's class, style, hidden or data attributes change (or it is added or removed) its opacity, place and size are read, and a jump of one or two frames with no
// animation or transition running on it is a snap, whichever element it is. Debug only; it exists for the length of a run.
import type { AuditFinding } from './judge.ts';
import { INSTANT_MS } from './judge.ts';
import { nameOf, describeEl } from './scan.ts';

export interface AnimRec { sel: string; prop: string; kind: 'transition' | 'animation'; startMs: number; plannedMs: number | null; delayMs: number; easing: string | null; ended: 'end' | 'cancel' | 'running'; actualMs: number | null }
export interface LedgerRead { anims: AnimRec[]; findings: AuditFinding[] }
export interface Ledger { mark(): void; read(): LedgerRead; stop(): void }

/** A property that changes what the eye sees; a very short animation on one of these is a snap by another name. */
const VISIBLE = /^(opacity|transform|translate|scale|rotate|width|height|top|left|right|bottom|margin|inset|clip-path|filter|background-color|color|max-height|max-width|border-radius)/;
/** Two reads closer than this were taken inside one frame. */
const SAME_FRAME_MS = 14;
const SKIP = (el: Element) => !!el.closest('[data-debug], #boot') || el.tagName === 'CANVAS' || el.classList.contains('lb') || !!el.closest('.lb, .stage-root, .lb-layer');

export function startLedger(doc: Document = document, win: Window = window): Ledger {
  let t0 = performance.now(), recs: AnimRec[] = [], found: AuditFinding[] = [];
  const open = new Map<string, AnimRec>();
  const key = (e: Event, prop: string) => `${(e.target as Element | null)?.tagName}|${prop}|${(e.target as Element & { __au?: number }).__au ?? ((e.target as Element & { __au?: number }).__au = Math.random())}`;
  const plannedOf = (el: Element, prop: string, kind: 'transition' | 'animation'): { ms: number | null; delay: number; easing: string | null } => {
    try {
      const a = el.getAnimations().find((x) => (kind === 'transition' ? (x as CSSTransition).transitionProperty === prop : (x as CSSAnimation).animationName === prop));
      if (!a?.effect) return { ms: null, delay: 0, easing: null };
      const t = a.effect.getTiming();
      return { ms: typeof t.duration === 'number' ? Math.round(t.duration) : null, delay: Math.round(Number(t.delay) || 0), easing: String(t.easing ?? '') };
    } catch { return { ms: null, delay: 0, easing: null }; }
  };
  const begin = (kind: 'transition' | 'animation') => (e: Event) => {
    const el = e.target as Element | null; if (!el || SKIP(el)) return;
    const prop = kind === 'transition' ? (e as TransitionEvent).propertyName : (e as AnimationEvent).animationName;
    const p = plannedOf(el, prop, kind);
    const r: AnimRec = { sel: nameOf(el), prop, kind, startMs: Math.round(performance.now() - t0), plannedMs: p.ms, delayMs: p.delay, easing: p.easing, ended: 'running', actualMs: null };
    recs.push(r); open.set(key(e, prop), r);
    if (p.ms != null && p.ms > 0 && p.ms < INSTANT_MS && (kind === 'animation' || VISIBLE.test(prop))) found.push({ kind: 'anim-too-fast', sev: 'warn', what: `${r.sel} ${prop} ${kind} lasts ${p.ms} ms (under ${INSTANT_MS}): it reads as a snap`, where: r.sel });
  };
  const finish = (how: 'end' | 'cancel', kind: 'transition' | 'animation') => (e: Event) => {
    const prop = kind === 'transition' ? (e as TransitionEvent).propertyName : (e as AnimationEvent).animationName;
    const k = key(e, prop), r = open.get(k); if (!r) return;
    r.ended = how; r.actualMs = Math.round(performance.now() - t0) - r.startMs; open.delete(k);
  };
  const L: [string, (e: Event) => void][] = [['transitionrun', begin('transition')], ['animationstart', begin('animation')], ['transitionend', finish('end', 'transition')], ['transitioncancel', finish('cancel', 'transition')], ['animationend', finish('end', 'animation')], ['animationcancel', finish('cancel', 'animation')]];
  for (const [t, f] of L) doc.addEventListener(t, f, true);

  // ── the mutation ledger ──
  interface Seen { t: number; op: number; b: [number, number, number, number] }
  const seen = new WeakMap<Element, Seen>();
  const effOpacity = (el: Element): number => { let o = 1; for (let p: Element | null = el, d = 0; p && d < 14; p = p.parentElement, d++) { o *= parseFloat(win.getComputedStyle(p).opacity) || 0; if (o < 0.02) return 0; } return o; };
  // (A card or sheet that fades its paper and words and never itself, the Treat card, has its fade on its children: the subtree counts. While the talk's cover is up (shell/curtain.ts: the whole screen under it)
  //  nothing under it is seen, so what is put in or taken out there is not a pop: the talk's bar, cards and the Treat card are set up under it when a talk opens.)
  const animating = (el: Element): boolean => { try { return el.getAnimations({ subtree: true }).length > 0 || (!!el.parentElement && el.parentElement.getAnimations().length > 0); } catch { return false; } };
  const covered = (): boolean => !!doc.querySelector('.pz-cover.on') || doc.documentElement.classList.contains('pz-covered');
  const snapSeen = new Set<string>();
  const note = (kind: string, sev: AuditFinding['sev'], what: string, el: Element) => { const k = `${kind}|${nameOf(el)}`; if (snapSeen.has(k) || found.length > 120) return; snapSeen.add(k); found.push({ kind, sev, what, where: nameOf(el) }); };
  /** Something the eye can see changing by itself: it draws words, a picture or a fill of its own. A positioning wrapper or a layout box that only holds other things is not (its children fade or do not). */
  const paints = (el: Element): boolean => {
    if (/^(svg|canvas|img|video|input|button)$/i.test(el.tagName)) return true;
    if (Array.from(el.childNodes).some((c) => c.nodeType === 3 && (c.nodeValue ?? '').trim())) return true;
    const cs = win.getComputedStyle(el), bg = /,\s*([\d.]+)\)$/.exec(cs.backgroundColor)?.[1];
    return cs.backgroundImage !== 'none' || (cs.backgroundColor !== 'transparent' && (bg === undefined || +bg > 0.1)) || parseFloat(cs.borderTopWidth) > 0;
  };
  const MIN_AREA = 1600;   // (a 40 x 40 box: under it a change is a digit, a dot or a caret, not a thing popping)
  const look = (el: Element, added: boolean) => {
    if (SKIP(el) || !el.isConnected || covered()) return;
    const now = performance.now(), r = el.getBoundingClientRect();
    const cur: Seen = { t: now, op: effOpacity(el), b: [r.left, r.top, r.width, r.height] };
    const prev = seen.get(el); seen.set(el, cur);
    if (r.width * r.height < MIN_AREA || !paints(el)) return;
    if (added && !prev) { if (cur.op >= 0.9 && !animating(el)) note('generic-pop', 'warn', `${describeEl(el)} appeared at full opacity in one frame (no fade or animation running)`, el); return; }
    if (!prev || now - prev.t > 90) return;
    if (Math.abs(cur.op - prev.op) >= 0.6 && !animating(el)) note('generic-pop', 'warn', `${describeEl(el)} went from opacity ${prev.op.toFixed(2)} to ${cur.op.toFixed(2)} in ${Math.round(now - prev.t)} ms with nothing easing it`, el);
    // two reads under a frame apart (one 60 Hz frame is 16.7 ms) were taken in the same frame: nothing was drawn between them, so a jump between them is not seen
    const dx = Math.hypot(cur.b[0] - prev.b[0], cur.b[1] - prev.b[1]), ds = Math.hypot(cur.b[2] - prev.b[2], cur.b[3] - prev.b[3]), dt = now - prev.t;
    if ((dx >= 60 || ds >= 60) && dt >= SAME_FRAME_MS && dt <= 50 && !animating(el)) note('generic-snap', 'warn', `${describeEl(el)} jumped ${Math.round(Math.max(dx, ds))} px in ${Math.round(dt)} ms with nothing easing it`, el);
  };
  const sig = (e: Element) => `${e.tagName}.${typeof e.className === 'string' ? e.className : ''}`;
  const mo = new MutationObserver((list) => {
    const targets = new Set<Element>(), added = new Set<Element>(), removed = new Set<string>(), addedRoots = new Set<Element>();
    for (const m of list) {
      for (const n of Array.from(m.removedNodes)) if (n instanceof Element) { removed.add(sig(n)); n.querySelectorAll('*').forEach((d) => { if (removed.size < 300) removed.add(sig(d)); }); }
      if (m.type === 'attributes' && m.target instanceof Element) targets.add(m.target);
      for (const n of Array.from(m.addedNodes)) if (n instanceof Element) addedRoots.add(n);
    }
    // an element put in where one just like it was taken out is a re-render (the same card, the same number): nothing appeared; one inside a newly added parent comes with its parent
    for (const n of addedRoots) if (!removed.has(sig(n)) && !(n.parentElement && addedRoots.has(n.parentElement)) && ![...addedRoots].some((a) => a !== n && a.contains(n))) { added.add(n); targets.add(n); }
    for (const m of list) for (const n of Array.from(m.removedNodes)) if (n instanceof Element) { const p = seen.get(n); if (p && p.op >= 0.9 && performance.now() - p.t <= 90 && p.b[2] * p.b[3] >= MIN_AREA && !SKIP(n) && paints(n) && !addedRoots.size && !covered()) note('generic-pop', 'warn', `${describeEl(n)} vanished at full opacity in one frame (no fade)`, n); }
    let k = 0;
    for (const el of targets) { if (k++ >= 30) break; look(el, added.has(el)); }
  });
  mo.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'data-on', 'data-phase', 'data-open', 'aria-hidden', 'data-state'] });
  return {
    mark() { t0 = performance.now(); recs = []; found = []; open.clear(); snapSeen.clear(); },
    read() { const anims = recs.slice(0, 400); return { anims, findings: found.slice() }; },
    stop() { for (const [t, f] of L) doc.removeEventListener(t, f, true); mo.disconnect(); },
  };
}
