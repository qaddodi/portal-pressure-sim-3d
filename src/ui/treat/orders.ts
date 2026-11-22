// The Treat card's orders, as the 2D app's chart.js and surgical-shunts.js make them: what each one changes in the patient's settings, what says it is in place, what it
// says to the learner (a toast, from the 2D app's own words: treat.generated.ts), and where it takes the figure. Pure on the params and on an injected Env, so a test runs it
// without a screen. The model is the engine's: an order only edits the params (or sends the engine one of its actions: a fluid, a band).
import { DRUGS } from '../../engine/hales/portal/scenario.js';
import { TREAT_WORDS } from './treat.generated.ts';
import { TOAST_WORDS } from './toast-words.ts';
import { updateParams, currentParams, type Params } from '../action/params.ts';
import type { Sel } from '../action/selection.ts';
import { activeInterventions } from '../action/changes.ts';

export interface Env {
  say(text: string): void;
  select(sel: Sel | null): void;
  /** the engine's own actions: { kind: 'infuse', fluid } · { kind: 'band' } · { kind: 'paracentesis', mL, albumin } */
  action(a: { kind: string; [k: string]: unknown }): void;
}

const W = TREAT_WORDS;
export const DRUG_IDS = Object.keys(DRUGS) as string[];
export type TabId = 'drugs' | 'fluids' | 'procs';
export const TABS = W.lines.tabs as readonly (readonly [TabId, string])[];

// ── drugs and the two standing orders ──
export const drugChips = (): { id: string; label: string; note: string; get: (p: Params) => boolean; set: (p: Params, v: boolean) => void }[] => [
  ...W.drugs.map((d) => ({ id: d.id, label: d.label, note: d.note, get: (p: Params) => !!p.drugs[d.id], set: (p: Params, v: boolean) => { p.drugs[d.id] = v; } })),
  { id: 'anticoag', label: W.lines.anticoag[0], note: W.lines.anticoag[1], get: (p: Params) => !!p.anticoag, set: (p: Params, v: boolean) => { p.anticoag = v; } },
  { id: 'diuretics', label: W.lines.diuretics[0], note: W.lines.diuretics[1], get: (p: Params) => !!p.diuretics, set: (p: Params, v: boolean) => { p.diuretics = v; } },
];
/** Press a drug or a standing order: it flips, and lands in History under its name. */
export function pressChip(id: string): void {
  const chip = drugChips().find((c) => c.id === id);
  if (!chip) return;
  updateParams((pp) => { chip.set(pp, !chip.get(pp)); return pp; }, { label: chip.label });
}

// ── fluids: given at once (the engine's own action) ──
export const fluids = (): readonly { id: string; label: string; sub: string }[] => W.lines.fluids.map(([id, label, sub]) => ({ id, label, sub }));
export const giveFluid = (env: Env, id: string): void => env.action({ kind: 'infuse', fluid: id });

// ── the surgical shunts (surgical-shunts.js; the Meso-Rex checks are proc-anim.js GRAFTS.rex) ──
const occludedAt = (p: Params, id: string): number => 1 - (1 - (p.stenosis?.[id] || 0)) * (1 - (p.thrombus?.[id] || 0));
/** The portal trunk is clotted (the case for a Meso-Rex bypass) and the left portal vein is open (the Rex recess it joins). */
export const rexSuitable = (p: Params): boolean => occludedAt(p, 'PV_TRUNK') >= 0.8 && occludedAt(p, 'PVH_L') < 0.8;
export interface Shunt { id: string; key: string; edge: string; label: string; the: string; short: string | null; sub: string; kw: string; done: string; proc: string | null;
  on(p: Params): boolean; apply(p: Params): Params; remove(p: Params): Params; blocked(p: Params): string }
const BEHAVIOUR: Record<string, Pick<Shunt, 'on' | 'apply' | 'remove' | 'blocked'>> = {
  warren: { on: (p) => !!p.dsrs, apply: (p) => { p.dsrs = true; return p; }, remove: (p) => { p.dsrs = false; return p; }, blocked: () => '' },
  'pc-es': { on: (p) => !!p.portocaval && !p.portocavalSide, apply: (p) => { p.portocaval = true; p.portocavalSide = false; return p; }, remove: (p) => { p.portocaval = false; p.portocavalSide = false; return p; }, blocked: () => '' },
  'pc-ss': { on: (p) => !!p.portocaval && !!p.portocavalSide, apply: (p) => { p.portocaval = true; p.portocavalSide = true; return p; }, remove: (p) => { p.portocaval = false; p.portocavalSide = false; return p; }, blocked: () => '' },
  mesocaval: { on: (p) => !!p.mesocaval, apply: (p) => { p.mesocaval = true; return p; }, remove: (p) => { p.mesocaval = false; return p; }, blocked: () => '' },
  rex: { on: (p) => !!p.rex, apply: (p) => { p.rex = true; return p; }, remove: (p) => { p.rex = false; return p; },
    blocked: (p) => (p.rex ? W.lines.rex.had : occludedAt(p, 'PV_TRUNK') < 0.8 ? W.lines.rex.patent : occludedAt(p, 'PVH_L') >= 0.8 ? W.lines.rex.leftClot : '') },
};
export const SURGICAL: readonly Shunt[] = W.surgical.map((s) => ({ ...s, ...BEHAVIOUR[s.id] }));
export const shuntName = (s: Shunt): string => s.short || s.label;
const shuntById = (id: string) => SURGICAL.find((s) => s.id === id)!;

/** Place a surgical shunt and show its vessel (a shunt already there, or one that cannot be made here, says why instead). */
export function placeShunt(env: Env, id: string): boolean {
  const s = shuntById(id), p = currentParams();
  if (s.on(p)) { env.select({ type: 'edge', id: s.edge }); env.say(`The ${s.the} is already in place.`); return false; }
  const why = s.blocked(p);
  if (why) { env.say(why); return false; }
  updateParams((q) => s.apply(q), { label: shuntName(s) });
  env.select({ type: 'edge', id: s.edge });
  env.say(s.done);
  return true;
}
/** Take a surgical shunt down ("Remove portocaval shunt" takes down either kind; the others only themselves). */
export function removeShunt(env: Env, id: string): boolean {
  const s = shuntById(id), p = currentParams();
  if (!(s.key === 'portocaval' ? p.portocaval : s.on(p))) { env.say(`There is no ${s.key === 'portocaval' ? 'portocaval shunt' : s.the} to take down.`); return false; }
  updateParams((q) => s.remove(q), { label: `Remove ${shuntName(s)}` });
  env.select(null);
  return true;
}

// ── procedures ──
export interface Proc { id: string; icon: string; label: string; long: string; sub: string; placed?: (p: Params) => boolean; run(env: Env): void }
const P = W.procedures, SUB = W.lines.procSubs, T = TOAST_WORDS;
const proc = (id: keyof typeof P): { label: string; long: string } => P[id];
/** The Procedures tab's orders, in the 2D app's order. `placed` says a procedure is in place (its tile takes the accent tint and a tick). */
export function procedures(): Proc[] {
  const out: Proc[] = [
    { id: 'band', icon: 'band', ...proc('band'), sub: SUB.band, run: (env) => { env.select({ type: 'organ', id: 'varices' }); env.action({ kind: 'band' }); } },
    // (A procedure is done by its Treat button, as the TIPS is: the gastric balloon is the first step and goes up at once; the esophageal balloon, the second, is the varices card's switch.)
    { id: 'balloon', icon: 'balloon', ...proc('balloon'), sub: SUB.balloon, placed: (p) => !!(p.balloonGas || p.balloonEso), run: (env) => {
      const up = !!currentParams().balloonGas;
      if (!up) updateParams({ balloonGas: true }, { label: W.lines.labels.gastricBalloon });
      env.select({ type: 'organ', id: 'varices' });
      env.say(up ? T.balloonUp : T.balloonDone);
    } },
    // A TIPS is always right portal vein → right hepatic vein, so it is placed at once; a DIPS is portal vein → the intrahepatic IVC.
    { id: 'tips', icon: 'stent', ...proc('tips'), sub: SUB.tips, placed: (p) => !!p.tips.on, run: (env) => {
      const on = !!currentParams().tips.on;
      if (!on) updateParams({ tips: { on: true, d: currentParams().tips.d || 8 } }, { label: W.lines.labels.tips });
      env.select({ type: 'edge', id: 'TIPS' });
      env.say(on ? T.tipsHave : T.tipsDone);
    } },
    { id: 'dips', icon: 'stent', ...proc('dips'), sub: SUB.dips, placed: (p) => !!p.dips.on, run: (env) => {
      const on = !!currentParams().dips.on;
      if (!on) updateParams({ dips: { on: true, d: currentParams().dips.d || 8 } }, { label: W.lines.labels.dips });
      env.select({ type: 'edge', id: 'DIPS' });
      env.say(on ? T.dipsHave : T.dipsDone);
    } },
    // The surgical shunts, each its own order. A tap makes the shunt and shows its vessel, whose card takes it down.
    ...SURGICAL.map((s): Proc => ({ id: s.id, icon: 'stent', label: s.proc ? P[s.proc as keyof typeof P].label : s.label, long: s.proc ? P[s.proc as keyof typeof P].long : s.label, sub: s.sub, placed: s.on, run: (env) => { placeShunt(env, s.id); } })),
    { id: 'brto', icon: 'occlude', ...proc('brto'), sub: SUB.brto, placed: (p) => !!p.occluded?.C5, run: (env) => {
      const p0 = currentParams();
      if (p0.spontaneous.C5 === false) { env.select({ type: 'organ', id: 'gastric' }); env.say(T.brtoNone); return; }
      const on = !!p0.occluded?.C5;
      if (!on) updateParams((p) => { p.occluded = { ...p.occluded, C5: true }; return p; }, { label: W.lines.labels.brto });
      env.select({ type: 'organ', id: 'gastric' });
      env.say(on ? T.brtoHave : T.brtoDone);
    } },
    // The spleen's two treatments are two orders, each named for what it does. Taking one in place takes the other down; pressing it again undoes it.
    ...W.lines.spleenOrders.map(([v, name, sub, label]): Proc => ({ id: `spleen${v}`, icon: 'occlude', label: name, long: name, sub, placed: (p) => (p.splenicRx | 0) === v, run: (env) => {
      const on = ((currentParams().splenicRx | 0) === v);
      updateParams((p) => { p.splenicRx = on ? 0 : v; return p; }, { label: on ? W.lines.labels.spleenUntreated : label });
      env.select({ type: 'organ', id: 'spleen' });
    } })),
    { id: 'paracentesis', icon: 'needle', ...proc('paracentesis'), sub: SUB.paracentesis, run: (env) => env.select({ type: 'organ', id: 'abdomen' }) },
  ];
  return out;
}

/** The order of the tab badges: how many drugs and standing orders run, and how many procedures are in place. */
export function ranOn(tab: TabId, p: Params): number {
  if (tab === 'drugs') return DRUG_IDS.filter((k) => p.drugs[k]).length + (p.anticoag ? 1 : 0) + (p.diuretics ? 1 : 0);
  if (tab === 'procs') return procedures().filter((x) => x.placed?.(p)).length;
  return 0;
}
export { activeInterventions };
