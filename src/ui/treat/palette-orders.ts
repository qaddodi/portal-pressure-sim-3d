// The orders the search offers (2D palette.js: the Change and Treat groups): each is the same verb the Treat card and the structure cards make, so it lands in History as one entry.
// A number typed in the query is the argument ("tips 8", "cirrhosis 60", "albumin 2.5", "paracentesis 4"). `commandWork` is pure on its Env (an empty env gives the table's names,
// which is how wired.ts and the parity claims read it), and a take-down is offered only for what is in place (2D `when`).
import { DRUGS } from '../../engine/hales/portal/scenario.js';
import { updateParams, currentParams } from '../action/params.ts';
import { SURGICAL, placeShunt, removeShunt, shuntName, procedures, giveFluid, type Env } from './orders.ts';
import { TREAT_WORDS } from './treat.generated.ts';

export type Work = (n: number | null) => void;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const NO_ENV: Env = { say() {}, select() {}, action() {} };

const VESSELS: readonly [string, string][] = [['PV_TRUNK', 'portal vein'], ['SV_CONF', 'splenic vein'], ['SMV_CONF', 'superior mesenteric vein'], ['RHV_IVC', 'right hepatic vein'], ['IVCS_RA', 'suprahepatic ivc']];
const REMOVE: readonly [string, string][] = [['warren', 'distal splenorenal shunt (DSRS)'], ['pc-es', 'portocaval shunt'], ['mesocaval', 'mesocaval shunt'], ['rex', 'Meso-Rex bypass']];
const proc = (id: string) => procedures().find((p) => p.id === id)!;

/** Every Change and Treat command, by group and title, with its work and (for a take-down) whether it is offered now. */
function table(env: Env): Map<string, { work: Work; when: (p: ReturnType<typeof currentParams>) => boolean }> {
  const t = new Map<string, { work: Work; when: (p: ReturnType<typeof currentParams>) => boolean }>();
  const add = (group: string, title: string, work: Work, when: (p: ReturnType<typeof currentParams>) => boolean = () => true) => { t.set(`${group}/${title}`, { work, when }); };
  add('Change', 'Cirrhosis', (n) => { updateParams((p) => { p.cirrhosis = clamp((n ?? 60) / 100, 0, 1); return p; }, { label: 'Cirrhosis' }); });
  add('Treat', 'TIPS', (n) => { updateParams({ tips: { on: true, d: clamp(n ?? 8, 6, 12) } }, { label: 'TIPS' }); });
  add('Treat', 'Remove TIPS', () => { updateParams({ tips: { on: false } }, { label: 'Remove TIPS' }); }, (P) => !!P?.tips?.on);
  add('Treat', 'DIPS', (n) => { updateParams({ dips: { on: true, d: clamp(n ?? 8, 6, 12) } }, { label: 'DIPS' }); });
  add('Treat', 'Remove DIPS', () => { updateParams({ dips: { on: false } }, { label: 'Remove DIPS' }); }, (P) => !!P?.dips?.on);
  add('Change', 'Serum albumin', (n) => { updateParams({ albumin: clamp(n ?? 3, 1.5, 5) }, { label: 'Serum albumin' }); });
  add('Change', 'Right-heart contractility', (n) => { updateParams({ contractility: clamp((n ?? 50) / 100, 0.15, 1.6) }, { label: 'Contractility' }); });
  add('Change', 'Tricuspid regurgitation', (n) => { updateParams({ tr: clamp((n ?? 80) / 100, 0, 1) }, { label: 'TR' }); });
  add('Change', 'Pregnancy', (n) => { updateParams({ gestation: clamp(Math.round(n ?? 24), 0, 40) }, { label: 'Pregnancy' }); });
  add('Change', 'Splanchnic arteriolar tone', (n) => { updateParams({ splanchnicTone: clamp((n ?? 60) / 100, 0.4, 2.5) }, { label: 'Splanchnic tone' }); });
  for (const [id, name] of VESSELS) {
    add('Change', `Narrow the ${name}`, (n) => { updateParams((p) => { const v = clamp((n ?? 70) / 100, 0, 0.95); if (v <= 0) delete p.stenosis[id]; else p.stenosis[id] = v; return p; }, { label: `${name} stenosis` }); });
    add('Change', `Clot the ${name}`, (n) => { updateParams((p) => { const v = clamp((n ?? 100) / 100, 0, 1); if (v <= 0) delete p.thrombus[id]; else p.thrombus[id] = v; return p; }, { label: `${name} thrombus` }); });
  }
  for (const k of Object.keys(DRUGS) as (keyof typeof DRUGS)[]) add('Treat', DRUGS[k].label, () => { updateParams((p) => { p.drugs[k] = !p.drugs[k]; return p; }, { label: DRUGS[k].label }); });
  add('Treat', 'Diuretics', () => { updateParams((p) => { p.diuretics = !p.diuretics; return p; }, { label: 'Diuretics' }); });
  add('Treat', 'Anticoagulation', () => { updateParams((p) => { p.anticoag = !p.anticoag; return p; }, { label: 'Anticoagulation' }); });
  add('Treat', proc('band').label, () => { proc('band').run(env); });
  add('Treat', 'Paracentesis', (n) => { env.action({ kind: 'paracentesis', mL: clamp(n ?? 5, 1, 10) * 1000, albumin: true }); });
  add('Treat', '1 L crystalloid', () => { giveFluid(env, 'crystalloid'); });
  add('Treat', '1 unit PRBC', () => { giveFluid(env, 'prbc'); });
  add('Treat', 'BRTO', () => { updateParams((p) => { p.occluded.C5 = true; return p; }, { label: 'BRTO' }); });
  // (The tamponade tube: the gastric balloon first, drawn up against the cardia; the esophageal balloon second, on a tube whose gastric balloon is up.)
  add('Treat', 'Gastric balloon', () => { updateParams((p) => { p.balloonGas = !p.balloonGas; if (!p.balloonGas) p.balloonEso = false; return p; }, { label: 'Gastric balloon' }); });
  add('Treat', 'Esophageal balloon', () => { updateParams((p) => { p.balloonEso = !p.balloonEso; if (p.balloonEso) p.balloonGas = true; return p; }, { label: 'Esophageal balloon' }); });
  for (const s of SURGICAL) add('Treat', shuntName(s), () => { placeShunt(env, s.id); });
  for (const [id, name] of REMOVE) {
    const s = SURGICAL.find((x) => x.id === id)!;
    add('Treat', `Remove ${name}`, () => { removeShunt(env, id); }, (P) => (s.key === 'portocaval' ? !!P?.portocaval : s.on(P)));
  }
  return t;
}
const NAMES = table(NO_ENV);

/** The work behind a command of the Change or Treat group, or null when it is not one of the orders. */
export function commandWork(env: Env, group: string, title: string): Work | null { return table(env).get(`${group}/${title}`)?.work ?? null; }
/** Whether the search offers a command now (a take-down only for what is in place). */
export function commandOffered(group: string, title: string): boolean { const c = NAMES.get(`${group}/${title}`); return !c || c.when(currentParams()); }  // (the take-downs read `P?.`, so no patient offers none of them)
/** Whether a command of the Change or Treat group does its 2D work here (for the parity claims). */
export const isOrderCommand = (group: string, title: string): boolean => NAMES.has(`${group}/${title}`);
