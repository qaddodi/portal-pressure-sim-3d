// The UI's own state: where the deck is, how big the screen is, which wallet card shows, the readings the cards print, and the boxes
// the cards take (the scene's camera frames the figure in `boxes.free`). The engine's store calls `setReadings` when a frame lands;
// nothing here imports the engine, and nothing in the engine imports this.

import { create } from 'zustand';
import type { Deck } from '../decks/schema.ts';
import type { Rect, Viewport } from './layout/device.ts';
import { deviceClass, type DeviceClass } from './layout/device.ts';
import type { Plan } from './layout/plan.ts';
import { walletStart, swap as walletSwap, resetForSlide, type WalletState } from './wallet/wallet-machine.ts';
import { first, apply, goto, samePos, type Pos, type Move, type Stop } from './deck/presenter-machine.ts';

/** The numbers the cards print, by tile key (the engine's fingerprint names: hvpg, whvp, co, lsm …; `key@slide` is a reading at another slide of the deck). */
export type Readings = Partial<Record<string, number | null>>;

export interface Boxes {
  words: Rect | null;
  data: Rect | null;
  strip: Rect | null;
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
  setReadings(r: Readings): void;
  /** Called by the card layer once per layout change with the plan it laid out. */
  publishPlan(plan: Plan): void;
}

const emptyFree: Rect = { x: 0, y: 0, w: 0, h: 0 };
const sameRect = (a: Rect | null, b: Rect | null) => (a === b) || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

export const useUi = create<UiState>((set, get) => ({
  deck: null,
  startAt: 0,
  nonce: 0,
  openDeck: (deck, at = 0) => set({ deck, startAt: at, nonce: get().nonce + 1, black: false, jump: false }),
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
  boxes: { words: null, data: null, strip: null, free: emptyFree },
  page: 0,
  pageCount: 1,
  setPageCount: (n) => { if (get().pageCount !== n) set({ pageCount: n }); },

  setStops: (stops, at = 0) => set({ stops, pos: at > 0 ? goto(stops, at) : first(), wallet: walletStart(), page: 0, pageCount: 1 }),

  move: (m) => {
    const { stops, pos, wallet, page, pageCount } = get();
    if (!stops.length) return;
    // a split card turns its pages before the talk moves on
    const at = page === 'last' ? pageCount - 1 : Math.min(page, pageCount - 1);
    if (m === 'next' && at < pageCount - 1) { set({ page: at + 1 }); return; }
    if (m === 'back' && at > 0) { set({ page: at - 1 }); return; }
    const to = apply(stops, pos, m);
    if (samePos(to, pos)) return;
    const forward = to.stop > pos.stop || (to.stop === pos.stop && to.beat > pos.beat);
    set({ pos: to, dir: forward ? 1 : -1, wallet: resetForSlide(wallet), page: forward ? 0 : 'last', pageCount: 1 });
  },

  go: (stop) => {
    const { stops, pos, wallet } = get();
    if (!stops.length) return;
    const to = goto(stops, stop);
    if (samePos(to, pos)) return;
    set({ pos: to, dir: to.stop >= pos.stop ? 1 : -1, wallet: resetForSlide(wallet), page: 0, pageCount: 1 });
  },

  setViewport: (vp) => {
    const cur = get().vp;
    const s = cur.safe, n = vp.safe;
    if (cur.w === vp.w && cur.h === vp.h && s.top === n.top && s.right === n.right && s.bottom === n.bottom && s.left === n.left) return;
    set({ vp, device: deviceClass(vp.w, vp.h) });
  },

  swapWallet: () => set({ wallet: walletSwap(get().wallet) }),

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
    const b = get().boxes;
    if (sameRect(b.words, words) && sameRect(b.data, data) && sameRect(b.strip, strip) && sameRect(b.free, plan.free)) return;
    set({ boxes: { words, data, strip, free: plan.free } });
  },
}));
