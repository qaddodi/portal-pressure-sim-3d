// The UI's own state: where the deck is, how big the screen is, which wallet card shows, the readings the cards print, and the boxes
// the cards take (the scene's camera frames the figure in `boxes.free`). The engine's store calls `setReadings` when a frame lands;
// nothing here imports the engine, and nothing in the engine imports this.

import { toolStep } from './talk/tool-step.ts';
import { lapseNext } from './deck/lapse-next.ts';
import { procStep } from './deck/proc-step.ts';
import { create } from 'zustand';
import type { Deck } from '../decks/schema.ts';
import type { Rect, Viewport } from './layout/device.ts';
import { deviceClass, type DeviceClass } from './layout/device.ts';
import type { Plan } from './layout/plan.ts';
import { walletStart, swap as walletSwap, resetForSlide, type WalletState } from './wallet/wallet-machine.ts';
import { first, apply, goto, samePos, isLast, type Pos, type Move, type Stop } from './deck/presenter-machine.ts';

/** The talk is on its last stop with no page left to turn: a Next from here ends the talk (2D presenter.js next(): `else stop()`). */
export const atEnd = (s: { stops: Stop[]; pos: Pos; page: number | 'last'; pageCount: number }): boolean =>
  s.stops.length > 0 && isLast(s.stops, s.pos) && (s.page === 'last' || s.page >= s.pageCount - 1);

/** The numbers the cards print, by tile key (the engine's fingerprint names: hvpg, whvp, co, lsm …; `key@slide` is a reading at another slide of the deck). */
export type Readings = Partial<Record<string, number | null>>;

export interface Boxes {
  words: Rect | null;
  data: Rect | null;
  strip: Rect | null;
  /** The presenter bar and, on a wide screen, the deck's title beside it: drawn over the figure, so the figure's room keeps clear of them (plan.ts) and so must every name. */
  bars: Rect[];
  /** The figure's room: the largest rectangle the cards leave free (CSS px, the camera shifts its projection into it). */
  free: Rect;
}

export interface UiState {
  /** The talk on show (built in, or one of your own); null in free play. */
  deck: Deck | null;
  /** Where the talk opens, as a 2D slide number minus one (0 = the outline). */
  startAt: number;
  /** Rises with every start, so starting the talk already on show (From the start) opens it again. */
  nonce: number;
  openDeck(deck: Deck | null, at?: number): void;
  /** The black screen (B, . or W) and the slide list (G) are over the talk. */
  black: boolean;
  jump: boolean;
  setBlack(on?: boolean): void;
  setJump(on?: boolean): void;
  stops: Stop[];
  pos: Pos;
  /** +1 forward, -1 back: which way the last move went (the cards enter from the side that says so). */
  dir: 1 | -1;
  vp: Viewport;
  device: DeviceClass;
  wallet: WalletState;
  readings: Readings;
  boxes: Boxes;
  /** The page of the words card on show when it is split (a card taller than its room splits; it never shrinks or scrolls). 'last' = arriving from the next card by Back. */
  page: number | 'last';
  /** How many pages the words card on show has (1 = whole). Set by the card layer once the card is measured. */
  pageCount: number;
  setPageCount(n: number): void;
  setStops(stops: Stop[], at?: number): void;
  move(m: Move): void;
  go(stop: number): void;
  setViewport(vp: Viewport): void;
  swapWallet(): void;
  /** The reader's dock of the data card (2D: dock.auto = false): kept from slide to slide, put back when a talk starts. `dockShown`: the planner has the card away now (set with the plan). */
  docked: boolean;
  dockShown: boolean;
  setDocked(on?: boolean): void;
  setReadings(r: Readings): void;
  /** Called by the card layer once per layout change with the plan it laid out. */
  publishPlan(plan: Plan): void;
  /** The room the figure is about to have, told when a dock glide sets off (not when it lands), with the glide's length: the camera reframes on the card's own clock (2D dockTo: layout() then reframe(ms)). */
  roomHint: { free: Rect; ms: number } | null;
  hintRoom(free: Rect, ms: number): void;
}

const emptyFree: Rect = { x: 0, y: 0, w: 0, h: 0 };
/** No card is up: what free play has (and a fresh page). */
export const noBoxes = (): Boxes => ({ words: null, data: null, strip: null, bars: [], free: emptyFree });
/** Everything the talk draws over the figure, as one list: the cards, the wallet strip, the presenter bar and the deck's title. The one place the labels, the Circuit's and the lobule's
 *  captions and the probes' labels read what to keep off (before 21 Nov each listed words, data and strip itself, so none kept clear of the bar or the title). */
export const talkRects = (b: Boxes): Rect[] => [b.words, b.data, b.strip, ...b.bars].filter((r): r is Rect => !!r && r.w > 0 && r.h > 0);
const sameRect = (a: Rect | null, b: Rect | null) => (a === b) || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

export const useUi = create<UiState>((set, get) => ({
  deck: null,
  startAt: 0,
  nonce: 0,
  // (Leaving a talk (deck null) takes its cards' boxes with it: they are what every label layer keeps its names off, and free play publishes none. Left behind, the last slide's words card went on walling
  //  off a side of the figure for good: after a talk the Circuit had no names left of the cards' place (Mohammad, 20 Nov: "no labels on circuit"), and the Anatomy's and the Lobule's kept off it too.)
  openDeck: (deck, at = 0) => set({ deck, startAt: at, nonce: get().nonce + 1, black: false, jump: false, docked: false, dockShown: false, ...(deck ? {} : { boxes: noBoxes(), roomHint: null }) }),
  black: false,
  jump: false,
  setBlack: (on) => set({ black: on ?? !get().black }),
  setJump: (on) => set({ jump: on ?? !get().jump }),
  stops: [],
  pos: first(),
  dir: 1,
  vp: { w: 1280, h: 800, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  device: 'desktop',
  wallet: walletStart(),
  readings: {},
  boxes: noBoxes(),
  page: 0,
  pageCount: 1,
  setPageCount: (n) => { if (get().pageCount !== n) set({ pageCount: n }); },

  setStops: (stops, at = 0) => set({ stops, pos: at > 0 ? goto(stops, at) : first(), wallet: walletStart(), page: 0, pageCount: 1 }),

  move: (m) => {
    const { stops, pos, wallet, page, pageCount } = get();
    if (!stops.length) return;
    // a time-lapse still running its days: the first Next runs them to their end, the second moves on (2D V-SLIDE-10; ui/deck/lapse-next.ts)
    if (m === 'next' && lapseNext()) return;
    // a split card turns its pages before the talk moves on
    const at = page === 'last' ? pageCount - 1 : Math.min(page, pageCount - 1);
    if (m === 'next' && at < pageCount - 1) { set({ page: at + 1 }); return; }
    if (m === 'back' && at > 0) { set({ page: at - 1 }); return; }
    // a slide whose procedure is guided by Next plays or takes back one step first (2D procNext; ui/deck/procs-link.ts)
    if ((m === 'next' || m === 'back') && procStep(m === 'next' ? 1 : -1)) return;
    // a data card that takes its readings one Next at a time (the HVPG tracing) takes this one first (ui/talk/tool-step.ts)
    if ((m === 'next' || m === 'back') && toolStep(m === 'next' ? 1 : -1)) return;
    const to = apply(stops, pos, m);
    if (samePos(to, pos)) return;
    const forward = to.stop > pos.stop || (to.stop === pos.stop && to.beat > pos.beat);
    set({ pos: to, dir: forward ? 1 : -1, wallet: resetForSlide(wallet), page: forward ? 0 : 'last', pageCount: 1 });
  },

  go: (stop) => {
    const { stops, pos, wallet } = get();
    if (!stops.length) return;
    const to = goto(stops, stop, { case: stop > pos.stop });   // (a jump forward meets a slide's case card; a jump back does not)
    if (samePos(to, pos)) return;
    set({ pos: to, dir: to.stop >= pos.stop ? 1 : -1, wallet: resetForSlide(wallet), page: 0, pageCount: 1 });
  },

  setViewport: (vp) => {
    const cur = get().vp;
    const s = cur.safe, n = vp.safe;
    if (cur.w === vp.w && cur.h === vp.h && s.top === n.top && s.right === n.right && s.bottom === n.bottom && s.left === n.left) return;
    set({ vp, device: deviceClass(vp.w, vp.h) });
  },

  // (the key that swaps the cards brings a docked card back first)
  swapWallet: () => set(get().dockShown ? { docked: false } : { wallet: walletSwap(get().wallet) }),
  docked: false,
  dockShown: false,
  setDocked: (on) => set({ docked: on ?? !get().docked }),
  roomHint: null,
  hintRoom: (free, ms) => set({ roomHint: { free, ms } }),

  setReadings: (r) => {
    const cur = get().readings;
    const keys = Object.keys(r);
    if (keys.every((k) => cur[k] === r[k])) return;
    set({ readings: { ...cur, ...r } });
  },

  publishPlan: (plan) => {
    const words = plan.cards.find((c) => c.slot === 'words')?.rect ?? null;
    const data = plan.cards.find((c) => c.slot === 'data')?.rect ?? null;
    const strip = plan.strip?.rect ?? null;
    const bars = [plan.bar?.rect].filter((r): r is Rect => !!r);
    const b = get().boxes;
    if (sameRect(b.words, words) && sameRect(b.data, data) && sameRect(b.strip, strip) && b.bars.length === bars.length
      && bars.every((r, i) => sameRect(b.bars[i]!, r)) && sameRect(b.free, plan.free) && get().dockShown === plan.docked) return;
    set({ boxes: { words, data, strip, bars, free: plan.free }, dockShown: plan.docked });
  },
}));
