// The corner credit of the 2D page: `.stage-credit`, placed by 2D's credit.js at the figure's bottom-left corner, 12 px in; where a bar covers that corner (the thumb dock spans the width) it rides above the view pill.
// It is put once per layout change, never per frame.
// 2D's credit.js rule, copied (credit-spots.copied.js): the credit is never on or touching a bar, a card or a menu; a bottom corner rises above whatever covers it, then the
// other corners are tried, and with none free it is hidden (`covered`). The translucent bottom bar used to show the line through itself.
import { useLayoutEffect, useRef } from 'react';
import { useUi } from '../ui-store.ts';
import { useSettings } from '../../state/settings.ts';
import { CREDIT } from './words.ts';
import { M } from './metrics.ts';
import { useThumb } from './thumb.ts';
import { CORNERS, freeSpots } from './credit-spots.copied.js';
import { layoutOf, margin } from '../layout/rules2d.ts';
import { footCredit } from './credit-foot.ts';
import { useShell } from './store.ts';
import { avoidVessel, vesselRect, widestWall } from './credit-avoid.ts';
import { cel } from '../../scene/api.ts';
import { framePoint } from '../../scene/sinusoid/portrait.ts';
import { sinusoidWorld } from '../../scene/lobule/frames.ts';
import { U } from '../../scene/sinusoid/view.ts';
import { Vector3 } from 'three';

import { clock, type TimerId } from '../../clock/frame.ts';
import { creditClaim } from '../../scene/labels/credit-claim.ts';
/** The Sinusoid view's vessel on the canvas now (the lumen and its wall as a strip over the whole screen), or null when the view is not up or the camera is still flying to it (the strip is not where it will be yet). */
const v3 = new Vector3(), pt = { x: 0, y: 0 }, f3: [number, number, number] = [0, 0, 0];
function sinusoidVessel() {
  const s = cel.sinus;
  if (!s.isVisible || cel.rig.isMoving) return null;
  const g = s.nameGeom;
  return vesselRect((x, y) => {
    framePoint(x, y, U, 0, f3);   // (the plane keeps its own frame; the camera's roll turns it on screen)
    const w = sinusoidWorld(f3);
    cel.rig.project(v3.set(w[0], w[1], w[2]), pt);
    return [pt.x, pt.y];
  }, widestWall((x) => g.wallIn(x)));
}

/** What the credit keeps clear of: every floating bar, card and chip on screen (the bottom dock with its view pill, the top bar's chips, the zoom pill, a card), as rectangles. */
// (the view pill stands above the dock as its child: the dock's own box stops under it, so the pill is named too. Phone play-test, 20 Nov: the credit ran half under the pill.)
const OBSTACLES = '.float-ui, .stage-blocker, .vdock, .nb-views, .zoom-pill, .dk-bar';   // (.dk-bar: a talk's slide pill)
function obstacles(vw: number, vh: number): { l: number; t: number; r: number; b: number }[] {
  const out: { l: number; t: number; r: number; b: number }[] = [];
  for (const el of document.querySelectorAll<HTMLElement>(OBSTACLES)) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || (r.width >= vw * 0.98 && r.height >= vh * 0.9)) continue;   // (not a layer that covers the whole screen)
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) continue;
    out.push({ l: r.left, t: r.top, r: r.right, b: r.bottom });
  }
  out.push(...cardContent(vw, vh), ...figureLabels());
  return out;
}

/** The figure's own words (the vessels' and organs' name labels, 2D's .lb): a label is a word on the picture, and the credit stays clear of it too (gastric varices 6 and 7: "SMV 23.8" printed over it). */
function figureLabels(): { l: number; t: number; r: number; b: number }[] {
  const out: { l: number; t: number; r: number; b: number }[] = [];
  for (const el of document.querySelectorAll<HTMLElement>('.lb-layer:not(.lb-key-layer) .lb')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= 1 && r.height >= 1) out.push({ l: r.left, t: r.top, r: r.right, b: r.bottom });
  }
  return out;
}

/** What a deck's cards hold: each line of their words and each picture, chart or tile, as rectangles. The credit may stand on a card's bare glass (Mohammad, 20 Nov: "(C) over the card is ok"), never on its text:
 *  on the HVPG slides it printed over the words of the card. A corner that these cover rises above them, as it does above a bar. */
const CARDS = '.pz-shade, .pz-data, .pz-case, .pz-panel';
const CARD_ART = 'canvas, img, svg, .pz-tool, .pz-tile, .pz-tiles, .pz-sitetab, .pz-kick, button';
function cardContent(vw: number, vh: number): { l: number; t: number; r: number; b: number }[] {
  const out: { l: number; t: number; r: number; b: number }[] = [];
  const add = (r: DOMRect) => { if (r.width >= 1 && r.height >= 1 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh) out.push({ l: r.left, t: r.top, r: r.right, b: r.bottom }); };
  const range = document.createRange();
  for (const card of document.querySelectorAll<HTMLElement>(CARDS)) {
    const cs = getComputedStyle(card);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05 || card.closest('[hidden]')) continue;
    const walk = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.nodeValue?.trim() || n.parentElement?.closest('[hidden], .stage-credit')) continue;   // (aria-hidden words are drawn words too: the card's tab, CARDIAC, is one)
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) add(r);
    }
    // the card's own edge (its border and rounded corners) is a line the credit keeps off too: it stood in the top padding of the HVPG cards with its glyphs touching the border
    const c = card.getBoundingClientRect();
    if (c.width > 4 && c.height > 4) for (const e of [new DOMRect(c.left, c.top, c.width, 2), new DOMRect(c.left, c.bottom - 2, c.width, 2), new DOMRect(c.left, c.top, 2, c.height), new DOMRect(c.right - 2, c.top, 2, c.height)]) add(e);
    for (const a of card.querySelectorAll<HTMLElement>(CARD_ART)) { if (!a.closest('[hidden]')) add(a.getBoundingClientRect()); }
  }
  return out;
}

/** The credit's fade (ms), the same as the CSS transition in chrome-3d.css. */
const FADE_MS = 240;

export function Credit() {
  const ref = useRef<HTMLDivElement>(null);
  const vp = useUi((s) => s.vp);
  const fps = useSettings((s) => s.showFps);
  const thumb = useThumb();
  const view = useShell((s) => s.view);
  const talk = useUi((s) => !!s.deck);
  const slideKey = useUi((s) => `${s.pos.stop}.${s.pos.beat}.${s.page}`);   // (a talk's slide, beat or page: its cards, and so what the credit keeps clear of, change)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: TimerId | null = null, shown = false, at0: { x: number; y: number } | null = null, hop: TimerId | null = null;
    // the bars settle after the layout change (the dock's height, a card's transition): look again once they have, and again when one resizes
    function again() { clock.cancel(timer); timer = clock.after(place, 260); }
    const place = () => {
      if (cel.rig.isMoving) { el.classList.add('moving'); again(); return; }   // (the camera is flying: the figure's labels are not where they will stand; look again once it has landed)
      const vw = innerWidth, vh = innerHeight, h = M.creditFont * M.creditLine, w = el.offsetWidth || 220;
      // A talk on a laptop, desktop or a landscape tablet: the credit has the one place, in the screen's foot band under the cards' left edge, the same on every slide, never a hunt for bare figure among labels and table
      // rows that are still moving (Mac, 21 Nov: it sat on figure labels and table rows; the iPhone has its row in the words card's foot for the same reason)
      const lay = layoutOf(vw, vh);
      if (talk && (lay === 'wide' || lay === 'short')) {
        const at = footCredit({ vw, vh, safe: vp.safe, h, margin: margin(vw, vh, lay) });
        clock.cancel(hop); el.style.setProperty('--cx', `${at.x}px`); el.style.setProperty('--cy', `${at.y}px`);
        el.classList.remove('covered', 'moving'); el.classList.add('placed'); at0 = at; shown = true; creditClaim.set({ x: at.x, y: at.y, w, h });
        return;
      }
      // the figure is the screen inside the safe areas; the frame-rate counter stands at the bottom corner too, so the credit's bottom corner rides above it
      const rise = fps ? M.fpsInset + M.fpsFont * M.fpsLine + 4 : 0;
      const fig = { l: vp.safe.left, t: vp.safe.top, r: vw - vp.safe.right, b: vh - vp.safe.bottom - rise };
      // the Sinusoid's vessel runs across the whole screen: the credit keeps off it (2D's `avoid` hook), and with no bare spot left it is hidden. While the camera is still flying to the view the vessel is not where it will land: look again once it has.
      const sinus = view === 'sinusoid';
      const ves = sinus ? sinusoidVessel() : null;
      if (sinus && !ves) { el.classList.add('moving'); again(); return; }   // (fades out, comes back once the view has landed)
      const spots = (freeSpots as (fig: unknown, obs: unknown[], w: number, h: number, o: unknown) => Record<string, { x: number; y: number } | null>)(fig, obstacles(vw, vh), w, h, { gap: 10, inset: M.creditInset, avoid: ves ? avoidVessel(ves) : null });
      const at = CORNERS.map((c) => spots[c]).find((s) => s) ?? null;
      el.classList.toggle('covered', !at);   // (no free place: hidden by a fade, never a pop)
      el.classList.add('placed');
      if (!at) { shown = false; creditClaim.set(null); return; }
      const put = () => { el.style.setProperty('--cx', `${Math.round(at.x)}px`); el.style.setProperty('--cy', `${Math.round(at.y)}px`); at0 = at; shown = true; el.classList.remove('moving'); creditClaim.set({ x: Math.round(at.x), y: Math.round(at.y), w, h }); };
      // a spot that moves while the credit shows fades out, moves while it is clear and fades back (never a jump across the figure)
      if (shown && at0 && (Math.abs(at0.x - at.x) > 4 || Math.abs(at0.y - at.y) > 4)) {
        el.classList.add('moving'); creditClaim.set(null); clock.cancel(hop); hop = clock.after(put, FADE_MS);
      } else { clock.cancel(hop); put(); }
    };
    place();
    again();
    const late = clock.after(place, 900);   // (a slide's cards come in after their measure and a short fade)
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(again) : null;
    for (const e of document.querySelectorAll(OBSTACLES)) ro?.observe(e);
    // a talk's cards come and go (a slide, a page, a card's measure, its fade): look again once each change has settled, and once more after its entry
    let settle: TimerId | null = null;
    const changed = () => { again(); clock.cancel(settle); settle = clock.after(place, 1100); };
    const deck = document.querySelector('.deck-ui');
    const mo = deck && typeof MutationObserver === 'function' ? new MutationObserver(changed) : null;
    mo?.observe(deck!, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'data-phase'] });
    return () => { creditClaim.set(null); clock.cancel(timer); clock.cancel(hop); clock.cancel(late); clock.cancel(settle); ro?.disconnect(); mo?.disconnect(); };
  }, [view, talk, slideKey, vp.w, vp.h, vp.safe.bottom, vp.safe.left, vp.safe.top, vp.safe.right, fps, thumb]);
  return <div className="stage-credit" ref={ref} aria-hidden="true">{CREDIT}</div>;
}
