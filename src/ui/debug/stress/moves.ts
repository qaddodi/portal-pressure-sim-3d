// ?stress: pictures INSIDE a transition. The page's clock and every CSS animation are slowed to MOVE_SLOW while a Next (or the menu opening) plays out, so a picture, which takes a few hundred
// milliseconds to draw, moves the animation by a few; the pictures are taken at fixed page times after the press (plan.ts MOVE_FRAMES), then the clock is let go and the settled end is taken.
// Every card that stands is measured on every frame (its layout size, no transform in it) so a card that changes size after it lands is caught, not only seen.
// Tool-only: nothing in the app reads any of this. It reuses the capture's own parts: the settle (audit/capture-settle.ts), the picture
// (audit/capture-shot.ts) and the jump to a slide (audit/capture-jump.ts).
import { useUi } from '../../ui-store.ts';
import { useShell } from '../../shell/store.ts';
import { talkId, talkOn } from '../../../state/deck.ts';
import { leaveTalk } from '../../shell/talk.ts';
import { clock } from '../../../clock/frame.ts';
import { readPlace } from '../../layout-snap.ts';
import { loadAllDecks, liveCatalog, openEntry } from '../page/live.ts';
import { stillPage, until, sleep, deckKit, type SettleKit } from '../audit/capture-settle.ts';
import { drawShot } from '../audit/capture-shot.ts';
import { cardBoxes } from '../audit/card-boxes.ts';
import { stepToEnd, needsBackJump } from '../audit/capture-jump.ts';
import { MOVE_FRAMES, MOVE_SLOW, STRESS_RATIO, type StressMove } from './plan.ts';
import { cardChecks, driftCheck, type Check } from './report.ts';

export interface MoveShot { name: 'start' | 'middle' | 'end'; atMs: number; encoded: Promise<Uint8Array | null>; link: string; cards: ReturnType<typeof cardBoxes>; missing: string[] }
export interface MoveResult { shots: MoveShot[]; checks: Check[]; issues: string[]; state: string }

const real = (ms: number): number => ms;
const realSleep = (ms: number) => new Promise<void>((ok) => clock.afterReal(ok, ms));
const talkUp = (id: string): boolean => talkId() === id && useUi.getState().stops.length > 0 && !!document.querySelector('.dk-card[data-phase="in"]');

/** Slow every running CSS animation and transition to `rate` (those started since the last call too). */
function playAt(rate: number): void {
  try { for (const a of document.getAnimations()) if (a.playbackRate !== rate) a.updatePlaybackRate(rate); } catch { /* one that will not change rate */ }
}

/** Play one press through: `press` is made with the page slowed, and the frames are taken at the plan's times; then the page is let go to its end and that is taken too.
 *  `sizes` collects every card's layout size from the moment it stands. */
export async function playMove(press: () => void, kit: SettleKit, stop: () => boolean): Promise<MoveResult> {
  const shots: MoveShot[] = [], issues: string[] = [], sizes = new Map<string, { w: number; h: number }[]>();
  const sample = (): void => {
    for (const el of document.querySelectorAll<HTMLElement>('.dk-card[data-card][data-phase="in"]')) {
      const id = el.getAttribute('data-card') ?? '', p = readPlace(el), seen = sizes.get(id) ?? [], last = seen[seen.length - 1];
      if (!last || last.w !== p.width || last.h !== p.height) { seen.push({ w: p.width, h: p.height }); sizes.set(id, seen); }
      if (seen.length > 400) seen.splice(1, seen.length - 400);
    }
  };
  let rate = MOVE_SLOW;
  const tick = clock.every(() => { playAt(rate); sample(); }, 16);
  try {
    const take = async (name: MoveShot['name'], atMs: number): Promise<void> => {
      const s = await drawShot({ ratio: STRESS_RATIO, thumb: false });
      if (!s) { issues.push(`the ${name} frame could not be drawn`); return; }
      for (const m of s.missing) issues.push(`a picture of the page did not load and is missing from the ${name} frame: ${m}`);
      shots.push({ name, atMs, encoded: s.encoded, link: s.record.link, cards: cardBoxes(document), missing: s.missing });
    };
    try {
      clock.setScale(MOVE_SLOW);
      const t0 = clock.now();
      press();
      for (const f of MOVE_FRAMES) {
        while (clock.now() - t0 < f.at && !stop()) await realSleep(16);
        if (stop()) break;
        await take(f.name, Math.round(clock.now() - t0));
      }
    } finally {
      rate = 1; clock.setScale(1); playAt(1);
    }
    if (!stop()) {
      const r = await stillPage(real, false, false, { ...kit, stop });
      if (r.moving && !stop()) issues.push(`the end frame was taken with the page still moving (${r.moving})`);
      await take('end', -1);
    }
  } finally { clock.cancel(tick); }
  const checks: Check[] = [driftCheck(sizes)];
  const end = shots.find((s) => s.name === 'end');
  if (end) checks.push(...cardChecks(end.cards));
  return { shots, checks, issues, state: '' };
}

/** The talk `deck` open and standing at the end of slide `from`, ready for the press (a Next) that leaves it. Null (with the reason) when it cannot be reached. */
export async function standAt(deck: string, from: number, stop: () => boolean): Promise<string | null> {
  if (talkOn() && talkId() !== deck) { leaveTalk(); await sleep(real(300)); }
  useShell.setState({ sheet: null, dialog: null });
  if (talkId() !== deck) {
    await loadAllDecks();
    const entry = liveCatalog().find((e) => e.id === `slide:${deck}:0`);
    if (!entry) return `talk ${deck} is not in the catalog`;
    await openEntry(entry);
    await until(() => talkUp(deck), real(25000));
    if (!talkUp(deck)) return `talk ${deck} did not open (no card after 25 s)`;
  }
  const store = useUi.getState, stops = store().stops.length;
  if (from >= stops - 1) return `slide ${from} of ${deck} is the last: there is no Next to press`;
  const walker = { stop: () => store().pos.stop, move: (m: 'next' | 'back') => store().move(m), still: async (): Promise<void> => { await stillPage(real, false, false, { ...deckKit, stop }); } };
  if (needsBackJump(store().pos.stop, from, stops)) store().go(stops - 1);
  store().go(from);
  const how = await stepToEnd(walker, from);
  if (how !== 'end') { store().go(from); await walker.still();
    const cause = how === 'stuck' ? 'Next never left the slide' : 'Back did not return';
    return `could not stand at the end of slide ${from} of ${deck} (${cause}); the move starts from the slide as it opens`;
  }
  await walker.still();
  return null;
}

/** The menu opening over the free figure. */
export const menuKit: SettleKit = {
  cardUp: () => !!document.querySelector('.menu-group, .menu-item'),
  extra: () => (useShell.getState().sheet === 'menu' ? '' : 'the menu has not opened yet'),
};
/** A sheet standing over the figure. */
export const sheetKit = (name: string): SettleKit => ({
  cardUp: () => useShell.getState().sheet === name,
  extra: () => (useShell.getState().sheet === name ? '' : `the ${name} sheet has not opened yet`),
});

/** The free figure: no talk, no sheet. */
export async function clearScreen(): Promise<void> {
  if (talkOn()) { leaveTalk(); await sleep(real(300)); }
  useShell.setState({ sheet: null, dialog: null });
  await sleep(real(200));
}

export type { StressMove };
