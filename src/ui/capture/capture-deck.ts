// Settings > Capture this deck (shown inside a talk): every slide of the talk you are in, captured the way ?audit=here > Capture does it (debug/audit/capture-all.ts), with the progress and a Stop in the
// toast, and at the end one Save: the contact sheet and the ZIP of every slide and its state, by the share sheet (iPhone, iPad) or as downloads (Mac). The talk is left open on the slide you were on.
// The capture code is fetched when the row is tapped (it is the audit's, never part of the first load).
import { useShell } from '../shell/store.ts';
import { useUi } from '../ui-store.ts';
import { talkId, talkOn } from '../../state/deck.ts';
import { clock } from '../../clock/frame.ts';
import { FEEDBACK_SHEET_MS } from '../shell/feedback.ts';
import { CAPTURE } from '../shell/words.ts';

let running = false;
/** The most often the toast's words change while a deck is captured (at 8x a slide takes well under a second; a note that changes ten times a second cannot be read). */
const TOAST_EVERY_MS = 1200;

export async function captureThisDeck(): Promise<void> {
  const id = talkId();
  if (running || !talkOn() || !id) return;
  running = true;
  const say = (text: string, action?: { label: string; run: () => void }) => useShell.getState().say(text, 'info', action, true);
  let stopped = false, last = 0;
  const stopAct = { label: CAPTURE.stop, run: () => { stopped = true; } };
  try {
    useShell.getState().close();
    await new Promise<void>((ok) => clock.after(ok, FEEDBACK_SHEET_MS));
    const back = useUi.getState().pos.stop;
    say(CAPTURE.deckStart, stopAct);
    const m = await import('../debug/audit/capture-all.ts');
    const res = await m.captureAllDecks({
      only: id, restore: back, stop: () => stopped, status: () => undefined,
      progress: (n, total) => { const now = new Date().getTime(); if (stopped) { say(CAPTURE.deckStopping); return; } if (now - last >= TOAST_EVERY_MS) { last = now; say(CAPTURE.deckProgress(n, total), stopAct); } },
    });
    const files = [...res.collages.map((c) => new File([c.blob], c.name, { type: 'image/png' })), new File([res.zip], res.zipName, { type: 'application/zip' })];
    say(res.shots ? CAPTURE.deckDone(res.shots, res.stopped) : CAPTURE.failed, res.shots ? { label: CAPTURE.save, run: () => { void m.saveFiles(files); } } : undefined);
  } catch (e) {
    console.warn('[capture] the deck could not be captured', e);
    useShell.getState().say(CAPTURE.failed, 'bad');
  } finally { running = false; }
}
