// The timeline's record: what the learner changed, what the model did, and a way back to each moment. A port of the 2D app's createTimeline (src/ui/timeline.js) without its
// DOM: the same entries, the same rules (a change is debounced into one entry, a jump or an action is its own, threshold events are entries, going back keeps the later
// entries ahead until something new happens, Undo and Redo walk the restorable ones), so the History list, Undo and Compare behave as they do in 2D.
// Pure: the engine, the clock and the screen reach it through `TimelineHost`, so a test drives it in Node.
import type { EngineFrame } from '../../engine/hales/host/protocol.d.ts';
import { removedLabel } from './removed-label.ts';

export type EntryKind = 'start' | 'change' | 'jump' | 'event';

/** What the worker's `snapshot` answers and `restore` takes back. Opaque to the page except for the clock and the parameters. */
export interface Snap { t: number; day: number; params: unknown; [k: string]: unknown }

/** A frozen, self-contained copy of a frame (for a moment pinned in Compare and for History's "Compare with now"). */
export interface Pinned { P: number[]; metrics: EngineFrame['metrics']; params: unknown; frame: EngineFrame }

export interface Entry {
  id: number; kind: EntryKind; label: string;
  detail?: string; sev?: string; evId?: string; keys?: string[]; action?: boolean;
  t: number; day: number;
  snap?: Snap; frame?: Pinned;
  /** the patient's settings after this entry, for an entry that was not taken on this page (a model patient's history has no snapshot to give: the chart reads the medicines from these) */
  params?: unknown;
  /** the model could not save this moment: the row says so instead of being skipped by Undo unseen (2D review B4) */
  snapFailed?: boolean;
  /** a moment of a history that came with the patient (baked): it can be shown again (goTo), but it is the past, not a change of this page's for Undo and Redo to walk */
  past?: boolean;
  /** the course step that made it (a model patient's: the story's chapters and marks are anchored to steps) */
  step?: string;
}

export interface EventIn { id: string; title: string; detail?: string; severity?: string; t: number; day: number }

export interface TimelineHost {
  /** the worker's snapshot of the model now (null or a throw: it could not be taken) */
  snapshot(): Promise<Snap | null>;
  /** put the model back as the snapshot had it, and the page's copy of its parameters */
  /** put the model back to a kept state: at once (a jump, the figure switching as for a new patient), or eased over `ease` ms (playing a case lands on its next stop) */
  restore(snap: Snap, ease?: number): void;
  /** the newest frame, and the parameters now */
  frame(): EngineFrame | null;
  params(): unknown;
  /** advance the disease clock (days), or run until the next event */
  advance(days: number | 'event'): void;
  /** the patient's name for the start entry */
  scenarioLabel(): string;
  /** the active changes of a set of parameters, key to label (2D inspector.js activeInterventions); the Treat batch supplies it */
  labelsOf(params: unknown): Map<string, string>;
  /** a one-line toast, and a line for a screen reader */
  say(text: string): void;
  announce(text: string): void;
  now(): number;
  later(fn: () => void, ms: number): unknown;
  cancel(handle: unknown): void;
  /** the later entries were let go (something new was done after going back): the day record lets go of the days after it too */
  branched?(): void;
}

/** 2D: timeline.js fmtClock. A day count once days have passed; minutes and seconds (or hours) before. */
export const fmtClock = (t: number, day: number): string => {
  if (day > 0) return `Day ${day}`;
  const s = Math.max(0, Math.floor(t)), m = Math.floor(s / 60), ss = String(s % 60).padStart(2, '0');
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

const abs = (e: { day: number; t: number }) => e.day * 86400 + e.t;
const byTime = (a: Entry, b: Entry) => abs(a) - abs(b) || a.id - b.id;
const clone = <T,>(v: T): T => (v === undefined ? v : structuredClone(v));

/** 2D: timeline.js captureFrame. Typed arrays are copied, so the frame stays what it was when the model moves on. */
export function captureFrame(f: EngineFrame, params: unknown): Pinned {
  const copy = (a: Float32Array | undefined) => (a ? a.slice() : a);
  return {
    P: Array.from(f.P), metrics: clone(f.metrics), params: clone(params),
    frame: { ...f, P: copy(f.P)!, Pf: copy(f.Pf)!, Q: copy(f.Q)!, Qf: copy(f.Qf)!, D: copy(f.D)!, ext: copy(f.ext)!, metrics: clone(f.metrics), events: [], params: undefined },
  };
}

export const DEBOUNCE_MS = 650;
const SNAP_AFTER_ACTION_MS = 80, SNAP_AFTER_JUMP_MS = 120;
const EVENT_REPEAT_MS = 30000;

export class Timeline {
  private entries_: Entry[] = [];
  private cursor_ = -1;
  /** History let go of its earliest entries (it keeps 300): the story says so where they were */
  private trimmed_ = false;
  private seq = 0;
  private baseline: unknown = null;
  private pending: { label: string; timer: unknown } | null = null;
  private lastEv: Record<string, number> = {};
  /** a timer belongs to the history that made it: a reset cancels every one (2D EXT-HIS-1) */
  private gen = 0;
  private editSeq = 0;
  private listeners = new Set<() => void>();

  private host: TimelineHost;
  constructor(host: TimelineHost) { this.host = host; }

  // ---- reading ----
  entries(): readonly Entry[] { return this.entries_; }
  cursor(): number { return this.cursor_; }
  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private fire() { for (const fn of [...this.listeners]) fn(); }
  /** entries shown in the History count: every one but the start */
  count(): number { let n = 0; for (const e of this.entries_) if (e.kind !== 'start') n++; return n; }

  private restorable = (i: number) => { const e = this.entries_[i]; return !!e && e.kind !== 'event' && !!e.snap && !e.past; };
  private liveIndex(): number { for (let i = this.entries_.length - 1; i >= 0; i--) if (this.restorable(i)) return i; return -1; }
  private currentIndex(): number { return this.cursor_ >= 0 ? this.cursor_ : this.liveIndex(); }
  /** the entry the model is at now (the History row marked "Back to this moment"), or -1 */
  isLive(i: number): boolean { return i === this.liveIndex() && this.cursor_ < 0; }
  trimmed(): boolean { return this.trimmed_; }
  isFuture(i: number): boolean { return this.cursor_ >= 0 && i > this.cursor_; }

  canUndo(): boolean {
    if (this.pending) return this.liveIndex() >= 0;   // (a change still being typed in becomes an entry when Undo flushes it)
    for (let i = this.currentIndex() - 1; i >= 0; i--) if (this.restorable(i)) return true;
    return false;
  }
  canRedo(): boolean { if (this.cursor_ < 0) return false; for (let i = this.cursor_ + 1; i < this.entries_.length; i++) if (this.restorable(i)) return true; return false; }
  /** the label of the change Undo would take back, or null */
  lastChangeLabel(): string | null {
    if (this.pending) return this.pending.label || null;
    for (let i = this.currentIndex(); i > 0; i--) if (this.entries_[i]?.kind === 'change') return this.entries_[i]!.label;
    return null;
  }

  // ---- recording ----
  private later(fn: () => void, ms: number): unknown { const g = this.gen; return this.host.later(() => { if (g === this.gen) fn(); }, ms); }

  private sortEntries() {
    const curId = this.cursor_ >= 0 ? this.entries_[this.cursor_]?.id : null;
    this.entries_.sort(byTime);
    if (curId != null) { this.cursor_ = -1; for (let i = 0; i < this.entries_.length; i++) if (this.entries_[i]!.id === curId) { this.cursor_ = i; break; } }
  }

  private async snapInto(e: Entry): Promise<void> {
    const g = this.gen;
    let snap: Snap | null;
    try { snap = await this.host.snapshot(); } catch { snap = null; }
    if (g !== this.gen) return;   // (a reset came meanwhile: this entry is not in the history any more)
    if (!snap) { e.snapFailed = true; this.fire(); return; }
    e.snapFailed = false;
    e.snap = snap; e.t = snap.t; e.day = snap.day;
    const f = this.host.frame();
    if (f) e.frame = captureFrame(f, snap.params);
    this.sortEntries();
    this.fire();
  }

  private truncateFuture() {
    if (this.cursor_ < 0) return;
    this.entries_ = this.entries_.slice(0, this.cursor_ + 1);
    this.cursor_ = -1;
    this.host.branched?.();
  }

  private push(e: Omit<Entry, 'id' | 't' | 'day'> & { t?: number; day?: number }): Entry {
    this.truncateFuture();
    const f = this.host.frame();
    const entry: Entry = { ...e, id: ++this.seq, t: e.t ?? f?.t ?? 0, day: e.day ?? f?.day ?? 0 };
    this.entries_.push(entry);
    if (this.entries_.length > 300) { this.entries_.splice(1, 1); this.trimmed_ = true; }
    this.fire();
    return entry;
  }

  /** A new patient (or Restart): the history starts over with the patient's name. */
  reset(label?: string): void {
    if (this.pending) this.host.cancel(this.pending.timer);
    this.gen++;
    this.entries_ = []; this.cursor_ = -1; this.pending = null; this.lastEv = {}; this.trimmed_ = false;
    const e = this.push({ kind: 'start', label: label || this.host.scenarioLabel() });
    this.baseline = clone(this.host.params());
    void this.snapInto(e);
  }

  /** A change made by the learner (debounced so a slider drag is one entry). The Treat batch calls it on every step of a control. */
  noteChange(label: string): void {
    if (this.pending) this.host.cancel(this.pending.timer); else this.pending = { label: '', timer: 0 };
    this.pending.label = this.pending.label || label;
    const mine = ++this.editSeq;
    this.pending.timer = this.host.later(() => { if (this.pending && mine === this.editSeq) this.flush(); }, DEBOUNCE_MS);
  }

  /** Turn a change being typed in into its entry now (Undo, a jump and an action do it first). */
  flush(): void {
    if (!this.pending) return;
    const fallback = this.pending.label;
    this.host.cancel(this.pending.timer);
    this.pending = null;
    const p = this.host.params();
    const before = this.host.labelsOf(this.baseline ?? p), after = this.host.labelsOf(p);
    const parts: string[] = [];
    for (const [k, l] of after) if (before.get(k) !== l) parts.push(l);
    for (const [k, l] of before) if (!after.has(k)) parts.push(removedLabel(k, l));
    this.baseline = clone(p);
    const label = parts.length ? parts.slice(0, 3).join(' · ') + (parts.length > 3 ? ` · +${parts.length - 3} more` : '') : fallback || 'Change';
    const keys = [...after.keys()].filter((k) => before.get(k) !== after.get(k));
    void this.snapInto(this.push({ kind: 'change', label, keys }));
  }

  /** An engine action (band, fluids, paracentesis…): its own entry. */
  recordAction(label: string): void {
    this.flush();
    const e = this.push({ kind: 'change', label, action: true });
    this.later(() => { void this.snapInto(e); }, SNAP_AFTER_ACTION_MS);
  }

  /** The model's threshold events: each is an entry (the same event again within 30 s is not, unless critical). */
  addEvents(evs: readonly EventIn[]): void {
    for (const ev of evs) {
      // (Looking at a moment of the past, the model raises what that moment already was (a bleed still in shock, a clot still there) as its detectors start over from the restored
      // state. That is the moment's own state, not something new: it must not end the future. An event on another day is the patient moving on, and is recorded.)
      if (this.cursor_ >= 0 && ev.day === this.entries_[this.cursor_]?.day) continue;
      const now = this.host.now();
      if (this.lastEv[ev.id] != null && now - this.lastEv[ev.id]! < EVENT_REPEAT_MS && ev.severity !== 'critical') continue;
      this.lastEv[ev.id] = now;
      this.push({ kind: 'event', label: ev.title, detail: ev.detail, sev: ev.severity, t: ev.t, day: ev.day, evId: ev.id });
      this.sortEntries();
      this.host.announce(`${ev.title}. ${ev.detail || ''}`);
    }
  }

  /** Jump the disease clock ahead (or until the next event): its own entry, a snapshot just after. */
  jump(days: number | 'event', long: string): void {
    this.flush();
    this.host.advance(days);
    const e = this.push({ kind: 'jump', label: days === 'event' ? 'Ran until the next event' : `+${long}` });
    this.later(() => { void this.snapInto(e); }, SNAP_AFTER_JUMP_MS);
  }

  // ---- going back ----
  goTo(i: number, { quiet = false, ease = 0 } = {}): boolean {
    const e = this.entries_[i];
    if (!e?.snap) return false;
    this.flush();
    this.host.restore(e.snap, ease > 0 ? ease : undefined);
    this.baseline = clone(e.snap.params);
    this.cursor_ = i === this.liveIndex() && !this.entries_.slice(i + 1).length ? -1 : i;
    if (!quiet) this.host.say(`Back to: ${e.label}`);
    this.fire();
    return true;
  }

  /** Back one change. Returns the label it went back to, or false. */
  undo(): string | false {
    this.flush();
    const cur = this.currentIndex();
    for (let i = cur - 1; i >= 0; i--) if (this.restorable(i)) { const label = this.entries_[i]!.label; return this.goTo(i) && label; }
    this.host.say('Nothing to undo.');
    return false;
  }

  /** Forward one change. Returns the label it went to, or false. */
  redo(): string | false {
    if (this.cursor_ < 0) { this.host.say('Nothing to redo.'); return false; }
    for (let i = this.cursor_ + 1; i < this.entries_.length; i++) {
      if (this.restorable(i)) { this.goTo(i); if (i === this.liveIndex()) this.cursor_ = -1; this.fire(); return this.entries_[i]!.label; }
    }
    return false;
  }

  /** A patient who comes with a history (a model patient's, baked): these entries are its History, the model is already at its end. The ids are this page's; `baseline` is the settings now. */
  adopt(entries: readonly Omit<Entry, 'id'>[], baseline: unknown): void {
    if (this.pending) this.host.cancel(this.pending.timer);
    this.gen++; this.pending = null; this.lastEv = {};
    this.seq = 0;
    this.entries_ = entries.map((e) => ({ ...e, id: ++this.seq })); this.trimmed_ = false;
    this.cursor_ = -1; this.baseline = clone(baseline); this.fire();
  }

  // ---- a patient's history kept while a talk shows another (2D: patientHistory.save / load) ----
  save() { return { entries: this.entries_.slice(), cursor: this.cursor_, baseline: clone(this.baseline), trimmed: this.trimmed_ }; }
  load(s: { entries: Entry[]; cursor: number; baseline: unknown; trimmed?: boolean }): void {
    if (this.pending) this.host.cancel(this.pending.timer);
    this.gen++; this.pending = null; this.lastEv = {};
    this.entries_ = s.entries; this.cursor_ = s.cursor; this.baseline = s.baseline; this.trimmed_ = !!s.trimmed; this.fire();
  }
}
