// The measurement card of a procedure slide (2D tool-reading.js createReading, tool { kind: 'reading' }): the one pressure monitor following the slide's measuring procedure
// (hvpgcath, eus, { kind: 'irivc', then: 'irpv' }, tipsgrad) on the procedure's own clock. The deck's procedure player calls `readingCard.procAt(kind, t)` each frame it runs (2D presenter.js
// procPlay → tools.proc); each reading is a live trace with its beat and breath, its number the mean the figure's callout prints. Back runs the clock backwards, the trace with it.
// The scripts are the 2D app's own (ir/copied/reading-scripts.copied.js); the monitor is the IR pane's (ir/monitor.ts).
import { create } from 'zustand';
import { latest } from '../../../engine/index.ts';
import { newWave, syncWave } from '../copied/hvpg-clock.copied.js';
import { scriptOf, phaseOf, takenOf, readingWords, readingTitle } from '../ir/copied/reading-scripts.copied.js';
import { monitorFrame, type MonitorState } from '../ir/monitor.ts';
import type { MonSource } from '../ir/Monitor.tsx';

type Fp = Record<string, unknown> | null | undefined;
type Obj = Record<string, number>;
interface Script { id: string; kinds: string[]; clock: { now(tk: Obj): number }; vals(fp: unknown, o: Obj): Obj; keys: string[] }
const script = scriptOf as (proc: unknown) => Script | null;

/** Bumps when the words under the card change (a reading is taken) or the slide's measurement starts afresh: the pane re-renders then, never per frame. */
export const useReadingCard = create<{ n: number; said: string; pending: boolean; title: string }>(() => ({ n: 0, said: '', pending: true, title: '' }));

class Reading implements MonSource {
  id = 'slide-reading';
  private key = {};
  private S: Script | null = null;
  private fp: Fp = null;
  private tk: Obj = {};
  private slide: unknown = null;
  private saidKey = '';
  private v: Obj = { a: NaN, b: NaN, g: NaN };
  private taken = [false, false, false];
  private wave = newWave();
  private st: MonitorState = { ph: 'idle', t: 0, v: null, running: true, wave: this.wave, probing: false };
  label = () => 'Pressure tracing, as on the monitor in the procedure room';
  /** moving: the procedure's clock is being played (a frame each time it is told) */
  moving = false;
  active = (): boolean => this.moving;
  frame(w: number, h: number) {
    const S = this.S;
    if (!S) return monitorFrame(this.key, { vals: (_fp: unknown, o: Obj) => o }, this.st, w, h, this.label());
    S.vals(this.fp ?? latest.frame?.metrics, this.v);
    this.st.ph = phaseOf(S, this.tk) as MonitorState['ph'];
    const t = S.clock.now(this.tk);
    this.st.t = Number.isFinite(t) ? t : 0;
    this.st.v = this.v;
    if (this.st.ph === 'run') syncWave(this.wave, latest.frame, this.st.t, performance.now());
    return monitorFrame(this.key, S, this.st, w, h, this.label());
  }
  /** What the screen reader and the header hold: the readings taken so far (written only when one is taken). */
  private words(): void {
    const S = this.S;
    if (!S) return;
    S.vals(this.fp ?? latest.frame?.metrics, this.v);
    takenOf(S, this.tk, this.taken);
    const key = `${S.id}${+this.taken[0]!}${+this.taken[1]!}${+this.taken[2]!}`;
    if (key === this.saidKey) return;
    this.saidKey = key;
    useReadingCard.setState({ said: readingWords(S, this.v, this.taken) as string, pending: !this.taken[2], n: useReadingCard.getState().n + 1 });
  }
  /** The slide's options and context: the measurement is the slide's procedure. A new slide starts its measurement afresh, the monitor waiting for the tip. */
  configure(t: { of?: unknown } | null | undefined, slide: { id?: string; procedure?: unknown } | null | undefined, fp?: Fp): void {
    const next = script(slide?.procedure ?? t?.of);
    if (next !== this.S || slide !== this.slide) { this.tk = {}; this.slide = slide; this.saidKey = ''; this.key = {}; }
    this.S = next;
    if (fp) this.fp = fp;
    useReadingCard.setState({ title: next ? (readingTitle(slide?.procedure ?? t?.of) as string) : '' });
    this.words();
    this.redraw();
  }
  /** The procedure's clock (the deck's procedure player, every frame it runs): kind and t in ms of its sequence. A first kind starting again sets the later ones back. */
  procAt(kind: string, t: number): void {
    const S = this.S;
    if (!S || !S.kinds.includes(kind)) return;
    if (kind === S.kinds[0]) for (let i = 1; i < S.kinds.length; i++) delete this.tk[S.kinds[i]!];
    if (this.tk[kind] === t) return;
    this.tk[kind] = t;
    this.words();
    this.redraw();
  }
  /** The slide's readings (the tiles' numbers): the levels before the procedure has taken its own. */
  pin(f: Fp): void { if (f) { this.fp = f; this.words(); this.redraw(); } }
  /** The kinds' times now (tests). */
  clockNow(): number { return this.S ? this.S.clock.now(this.tk) : NaN; }
  private redraw(): void { useReadingCard.setState((s) => ({ n: s.n + 1 })); }
}
const reading = new Reading();
export const readingCard = reading;
export { reading as readingSource };
