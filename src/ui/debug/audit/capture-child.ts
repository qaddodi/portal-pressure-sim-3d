// ?audit=capture: the app inside one frame of the outer page (capture-outer.ts). It boots, settles, takes the pictures the address names (`&pick=`, `&only=`, `&speed=`),
// reports its progress to the page
// around it and hands up the files of its zip (name and bytes), so the outer page can join every size into one. Standing alone (no outer page) it says so and does nothing.
import { flagValue } from '../flags.ts';
import { attach } from '../pps.ts';
import { settle } from './app.ts';
import { speedOf } from './speed.ts';
import { unpackPick } from './capture-pick.ts';
import { parseCases, whatOf } from './capture-cases-plan.ts';
import { promoRatio, preparePromo } from './promo-prep.ts';
import { clock } from '../../../clock/frame.ts';

export type CaptureMsg =
  | { capture: 'hello' }
  | { capture: 'progress'; text: string; n: number; total: number }
  /** a talk's (or a case's) finished files, sent as it ends: the outer page keeps them if the frame never says `done` */
  | { capture: 'part'; files: { name: string; data: Uint8Array }[] }
  | { capture: 'done'; files: { name: string; data: Uint8Array }[]; notes: string[]; shots: number; secs: number; stopped: boolean; speed: number }
  | { capture: 'failed'; why: string };

/** The scripts the browser could not get (status 0 or an error), newest last: what a "module script failed" was about, since the error itself names none. */
function failedScripts(): string {
  try {
    const bad = performance.getEntriesByType('resource').filter((e) => /\.m?js(\?|$)/.test(e.name) && 'responseStatus' in e && (e.responseStatus === 0 || Number(e.responseStatus) >= 400)).map((e) => `${e.name.split('/').slice(-2).join('/')} (${'responseStatus' in e ? String(e.responseStatus) : '?'})`);
    return bad.length ? ` [scripts the browser could not get: ${bad.slice(-3).join(', ')}]` : '';
  } catch { return ''; }
}
/** A lazy chunk of the app, asked for again (a chunk of an older deploy that Pages has replaced, or a part still on its way, fails once and not the next time). */
async function importAgain<T>(load: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try { return await load(); } catch (e) {
      if (i >= tries) throw new Error(`${String((e as Error)?.message ?? e)}${failedScripts()}`);
      await new Promise<void>((ok) => clock.after(ok, 1500));
    }
  }
}
const post = (m: CaptureMsg): void => { try { parent.postMessage(m, location.origin); } catch { /* no parent: standing alone */ } };

export function mountCaptureChild(): void {
  if (parent === window) return;   // (the self-test's outer page holds the frame: opened alone, this does nothing)
  let stop = false, text = '';
  const sent = new Set<string>();
  attach('audit', { stop: () => { stop = true; } });
  post({ capture: 'hello' });
  clock.after(() => {
    void settle().then(async () => {
      try {
        const m = await importAgain(() => import('./capture-run.ts'));
        const cm = await importAgain(() => import('./capture-cases.ts'));
        const speed = speedOf(flagValue('speed')), pick = unpackPick(flagValue('pick')), decks = (flagValue('decks') ?? '').split(',').filter((x) => /^[\w-]+$/.test(x));
        const ratio = promoRatio(flagValue('promo'));
        if (ratio) preparePromo();
        // (`&cases=all` or a list of model patients plays their cases; alone unless `&slides=1` or a pick adds the slides)
        const cases = parseCases(flagValue('cases'), cm.everyCaseId());
        const what = whatOf({ cases: !!cases, slides: flagValue('slides'), pick: !!pick, decks: decks.length > 0 });
        const r = await m.runCapture({
          what, cases, looks: flagValue('looks') !== '0',
          decks: decks.length ? new Set(decks) : null, pick, speed: speed > 1 ? speed : undefined, promo: ratio ? { ratio } : undefined,
          status: (s) => { text = s; }, stop: () => stop,
          progress: (n, total) => post({ capture: 'progress', text, n, total }),
          release: true,
          partial: (fs) => { for (const f of fs) sent.add(f.name); post({ capture: 'part', files: fs.map((f) => ({ name: f.name, data: f.data })) }); },
        });
        // (what was handed up as the talks ended is not sent twice)
        post({ capture: 'done', files: r.files.filter((f) => !sent.has(f.name)).map((f) => ({ name: f.name, data: f.data })), notes: r.notes, shots: r.shots, secs: r.secs, stopped: r.stopped, speed: r.speed });
      } catch (e) { post({ capture: 'failed', why: String((e as Error)?.message ?? e) }); }
    });
  }, 1500);
}
