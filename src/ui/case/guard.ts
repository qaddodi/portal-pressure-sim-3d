// The case's guard (docs/approved/play-the-case.md, step 2; Mohammad's pick 3, 26 Nov: a change at a stop leaves the case, keeping the way back). Every step that would change what
// happens to the patient passes here first: an engine action (action/send.ts), a change of the patient's settings (action/params.ts updateParams: Treat's medicines, procedures, sliders),
// the disease clock run or jumped (shell/transport.ts, timeline/index.ts jumpAhead), Undo and Redo, another patient (patients/index.ts loadPatient, histories/open.ts openHistory) and
// Restart. While the case is at a stop or on its way, the step asks first; Leave lets it through with the case left (or ended, for another patient), Stay drops it.
// Steps that only look (a view, a lens, the labels, zoom, a Tests card's reading, History, Compare) never come here. The case's own calls pass with `asCase`.
// Plain logic on the case store: the dialog (CaseGuard.tsx) reads `useGuard`, the runner (run.ts) hands over how the case is left.
import { create } from 'zustand';
import { CASE_OFF, useCase } from './store.ts';
import type { CasePhase } from './types.ts';

/** What a guarded step is, for its words. */
export type GuardKind = 'drain' | 'fluid' | 'blood' | 'albumin' | 'band' | 'medicine' | 'stopMedicine' | 'procedure' | 'setting' | 'time' | 'undo' | 'redo' | 'patient' | 'restart' | 'change';

interface KindWords {
  /** the title's subject: "Draining fluid" changes this patient's course */
  doing: string;
  /** "... and a paracentesis was not part of it" */
  noun: string;
  /** "If you drain now ..." */
  verb: string;
  /** the Leave button */
  leave: string;
}
const KINDS: Record<Exclude<GuardKind, 'patient' | 'restart'>, KindWords> = {
  drain: { doing: 'Draining fluid', noun: 'a paracentesis', verb: 'drain', leave: 'Drain and leave the case' },
  fluid: { doing: 'Giving fluid', noun: 'this fluid', verb: 'give it', leave: 'Give and leave the case' },
  blood: { doing: 'Giving blood', noun: 'a transfusion', verb: 'transfuse', leave: 'Transfuse and leave the case' },
  albumin: { doing: 'Giving albumin', noun: 'this albumin', verb: 'give it', leave: 'Give and leave the case' },
  band: { doing: 'Banding a varix', noun: 'this band', verb: 'band', leave: 'Band and leave the case' },
  medicine: { doing: 'Starting a medicine', noun: 'this medicine', verb: 'start it', leave: 'Start and leave the case' },
  stopMedicine: { doing: 'Stopping a medicine', noun: 'stopping this medicine', verb: 'stop it', leave: 'Stop and leave the case' },
  procedure: { doing: 'A procedure', noun: 'this procedure', verb: 'do it', leave: 'Do it and leave the case' },
  setting: { doing: 'Changing a setting', noun: 'this change', verb: 'change it', leave: 'Change and leave the case' },
  time: { doing: 'Running the days', noun: 'running the days yourself', verb: 'run them', leave: 'Run and leave the case' },
  undo: { doing: 'Undoing a step', noun: 'undoing a step', verb: 'undo it', leave: 'Undo and leave the case' },
  redo: { doing: 'Redoing a step', noun: 'redoing a step', verb: 'redo it', leave: 'Redo and leave the case' },
  change: { doing: 'Changing this', noun: 'this change', verb: 'change it', leave: 'Change and leave the case' },
};

/** Another patient and Restart end the case (the way back is to play it again); every other step leaves it, with Back to the case kept. */
export const endsCase = (k: GuardKind): boolean => k === 'patient' || k === 'restart';

/** What the dialog says. `day` is the day the patient is at; `stopDay` the stop the case keeps (on the way, the last one reached); `label` the step's own name for the kicker. */
export interface GuardWords { kicker: string; title: string; body: string; keep: string | null; leave: string; stay: string }
export function guardWords(kind: GuardKind, day: number, opt: { label?: string; stopDay?: number; travel?: boolean } = {}): GuardWords {
  const d = `Day ${Math.round(day)}`, stay = 'Stay in the case';
  const kicker = opt.label ? `${opt.label} · ${d}` : d;
  if (kind === 'patient') {
    return { kicker, stay, keep: null, title: 'Opening another patient ends the case.', leave: 'Open and end the case',
      body: `The case is at ${d} of this patient's story. If you open another patient now, the case ends here.` };
  }
  if (kind === 'restart') {
    return { kicker, stay, keep: null, title: 'Restarting ends the case.', leave: 'Restart and end the case',
      body: `The case is at ${d} of this patient's story. If you restart now, the case ends and the patient starts again.` };
  }
  const w = KINDS[kind];
  const stopDay = Math.round(opt.stopDay ?? day);
  const keep = opt.travel ? `The case keeps its last stop: Back to the case brings you to Day ${stopDay} again.` : 'The case keeps this stop: Back to the case brings you here again.';
  return { kicker, stay, keep, title: `${w.doing} changes this patient's course.`, leave: w.leave,
    body: `The case shows what happened to this patient, and ${w.noun} was not part of it. If you ${w.verb} now, the case stops here and the patient is yours from ${d}.` };
}

/** The phases where a course-changing step asks first: at a stop, and on the way to one (paused too). */
export const asksIn = (phase: CasePhase): boolean => phase === 'stop' || phase === 'travel';

let own = 0;
/** The case's own calls (its walk, its landings, opening its history) pass without asking. The guard is read before the call's first await, so an async call is covered too. */
export function asCase<T>(fn: () => T): T {
  own++;
  try { return fn(); } finally { own--; }
}

/** The question up now, or null. `done` answers it. */
export interface Ask { kind: GuardKind; words: GuardWords; done(leave: boolean): void }
export const useGuard = create<{ ask: Ask | null }>(() => ({ ask: null }));

/** How the case is left, and held while it asks: the runner (run.ts) puts in the ones that also stop and run the walk; these plain ones are the store's part only. */
export const STORE_LEAVING = {
  /** on the way: the days stop while the question is up (true when they were running) */
  hold(): boolean {
    const s = useCase.getState();
    if (s.phase !== 'travel' || s.paused) return false;
    useCase.setState({ paused: true });
    return true;
  },
  /** Stay after a hold: the days run on */
  resume(): void { if (useCase.getState().phase === 'travel') useCase.setState({ paused: false }); },
  /** the case stops here: phase 'left', the stop and the day kept */
  leave(): void {
    const s = useCase.getState();
    const day = s.phase === 'stop' ? (s.stops[s.at]?.day ?? s.day) : s.day;
    useCase.setState({ phase: 'left', to: null, paused: false, day, leftDay: day });
  },
  /** the case ends: phase 'off' */
  end(): void { useCase.setState({ ...CASE_OFF }); },
};
export const leaving = { ...STORE_LEAVING };
export function setLeaving(l: typeof STORE_LEAVING): void { Object.assign(leaving, l); }

const NO: Promise<boolean> = Promise.resolve(false);

/** Ask before a course-changing step. Null: go on now (no case is playing, the case was left, or the case itself is calling). Otherwise a promise: true once the learner chose
 *  Leave (the case is left or ended by then, so the step runs as it always does), false for Stay. A second step while one is asked is dropped (a slider's drag asks once).
 *  In a left case, another patient or a restart ends it (the learner's own course and the way back go with it). `kindOf` may be a function, read only while a case is on. */
export function caseAsk(kindOf: GuardKind | (() => GuardKind), label = ''): Promise<boolean> | null {
  if (own > 0) return null;
  const s = useCase.getState();
  // (worked out only when a case is on: a change of the settings is read from the settings, and a slider sends many)
  if (s.phase === 'off') return null;
  const kind = typeof kindOf === 'function' ? kindOf() : kindOf;
  if (s.phase === 'left' && endsCase(kind)) { leaving.end(); return null; }
  if (!asksIn(s.phase)) return null;
  if (useGuard.getState().ask) return NO;
  const travel = s.phase === 'travel';
  // (on the way, the days stop while the question is up, so its day is the one Leave keeps; Stay lets them run on)
  const held = leaving.hold();
  const day = travel ? useCase.getState().day : (s.stops[s.at]?.day ?? s.day);
  const words = guardWords(kind, day, { label, stopDay: s.stops[s.at]?.day, travel });
  return new Promise<boolean>((res) => {
    const ask: Ask = {
      kind, words,
      done: (go) => {
        if (useGuard.getState().ask !== ask) return;
        useGuard.setState({ ask: null });
        // (the case is left before the step runs, so the step itself passes; a case that moved on by itself meanwhile is left as it is now)
        if (go && asksIn(useCase.getState().phase)) { if (endsCase(kind)) leaving.end(); else leaving.leave(); }
        else if (!go && held) leaving.resume();
        res(go);
      },
    };
    useGuard.setState({ ask });
  });
}

/** Stay: the question goes, and nothing changes. */
export const stayInCase = (): void => { useGuard.getState().ask?.done(false); };
/** Leave: the case is left (or ended) and the step runs. */
export const leaveForStep = (): void => { useGuard.getState().ask?.done(true); };

/** A guarded sync step: runs it now, or asks and runs it on Leave. True when it ran now. */
export function guarded(kind: GuardKind, label: string, run: () => void): boolean {
  const q = caseAsk(kind, label);
  if (!q) { run(); return true; }
  void q.then((go) => { if (go) run(); });
  return false;
}

// ── what a change of the settings is (updateParams), from the settings before and after ──
const MEDICINES = new Set(['drugs', 'anticoag', 'diuretics', 'nsbbGain']);
const PROCEDURES = new Set([
  'tips', 'dips', 'occluded', 'portocaval', 'portocavalSide', 'customShunts', 'dsrs', 'mesocaval', 'rex', 'balloonEso', 'balloonGas', 'splenicRx', 'stentGeom', 'stenosisSite',
]);
type Tree = Record<string, unknown> | null | undefined;
const same = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);
/** how many switches of a medicine are on (a drug, anticoagulation, diuretics) */
const onCount = (p: Tree): number => {
  if (!p) return 0;
  const drugs = (p.drugs ?? {}) as Record<string, unknown>;
  return Object.values(drugs).filter(Boolean).length + (p.anticoag ? 1 : 0) + (p.diuretics ? 1 : 0);
};
/** The kind of a change of the settings: a medicine started or stopped, a procedure, or any other setting. */
export function paramsKind(prev: Tree, next: Tree): GuardKind {
  const keys = new Set([...Object.keys(prev ?? {}), ...Object.keys(next ?? {})]);
  const changed = [...keys].filter((k) => !same(prev?.[k], next?.[k]));
  if (changed.some((k) => PROCEDURES.has(k))) return 'procedure';
  if (changed.some((k) => MEDICINES.has(k))) return onCount(next) >= onCount(prev) ? 'medicine' : 'stopMedicine';
  return 'setting';
}

/** The kind of an engine action (action/send.ts). */
export function actionKind(a: { kind: string; fluid?: unknown }): GuardKind {
  if (a.kind === 'paracentesis') return 'drain';
  if (a.kind === 'band') return 'band';
  if (a.kind === 'infuse') return a.fluid === 'prbc' ? 'blood' : a.fluid === 'albumin' ? 'albumin' : 'fluid';
  return 'change';
}
