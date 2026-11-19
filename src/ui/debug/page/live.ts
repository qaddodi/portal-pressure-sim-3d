// The debug page's hands on the real app: the catalog from the app's own tables, opening a specimen the way the app opens it, "is the page still?", the screen's self-checks,
// the journeys of the Phone check and the Full check. Debug only; every call is a tap or a step of a walk, never a frame.
import { UI } from '../../strings.generated.ts';
import { builtinDecks } from '../../../decks/registry.ts';
import { useShell, type Sheet } from '../../shell/store.ts';
import { goToView } from '../../shell/view-actions.ts';
import { startTalk, leaveTalk } from '../../shell/talk.ts';
import { loadPatient } from '../../menu/patients.ts';
import { cel } from '../../../scene/api.ts';
import { clock } from '../../../clock/frame.ts';
import { useSettings } from '../../../state/settings.ts';
import type { LookChoice } from '../../../looks/looks.ts';
import { waitQuiet, QUIET_LONG_MS, POLL_MS } from '../core/settle.copied.js';
import { buildCatalog, type Entry } from './catalog.ts';
import type { Journey } from './check.ts';
import type { Problem } from './sweep.ts';
import { screenNow } from '../packet/sources.ts';
import { appSnapshot } from '../screen/app.ts';
import { caughtCount } from '../caught.ts';

const SHEETS: Sheet[] = ['settings', 'search', 'help', 'menu', 'history', 'guide', 'blood', 'layers', 'lens', 'speed', 'jump'];

export const liveCatalog = (): Entry[] => buildCatalog({
  views: UI.views.filter((v) => v.id !== 'circuit').map((v) => ({ id: v.id, label: v.label })),
  sheets: SHEETS.filter(Boolean) as string[],
  decks: builtinDecks().map((d) => ({ id: d.id, title: d.title, slides: d.slides.map((s) => ({ title: s.title })) })),
  patients: UI.presets.map((p) => ({ id: p.id, label: p.label, group: p.group })),
});

const leave = () => { if (useShell.getState().mode === 'deck') leaveTalk(); useShell.setState({ sheet: null, dialog: null }); };
export const sleep = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/** Opens a specimen the way the app opens it: a view pill, a sheet, a talk at a stop, a patient. */
export async function openEntry(e: Entry): Promise<void> {
  const [kind, a, b] = e.id.split(':');
  if (kind === 'view') { leave(); if (!goToView(a as 'anatomic' | 'lobule' | 'sinusoid')) throw new Error(`the ${a} view is not drawn yet`); return; }
  if (kind === 'sheet') { leave(); useShell.getState().open(a as Exclude<Sheet, null>); return; }
  if (kind === 'slide') { useShell.setState({ sheet: null }); if (!startTalk(a!, Number(b))) throw new Error(`no talk called ${a}`); return; }
  if (kind === 'patient') { leave(); await loadPatient(a!); return; }
  throw new Error(`do not know how to open ${e.id}`);
}

/** True while something is still arriving: the camera, a card leaving or not yet styled, fonts, a running animation that will end. */
export function busy(doc: Document = document): boolean {
  try {
    if (cel.rig.isMoving) return true;
    if (doc.querySelector('.dk-card[data-phase="out"], .dk-plate[data-phase="out"]')) return true;
    if (doc.fonts && doc.fonts.status === 'loading') return true;
    return doc.getAnimations().some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getTiming().iterations) && !(a.effect as KeyframeEffect | null)?.target?.closest?.('[data-debug]'));
  } catch { return false; }
}
export const settle = (o: { timeoutMs?: number; quietMs?: number } = {}): Promise<{ settled: boolean; ms: number }> =>
  waitQuiet(busy, { timeoutMs: o.timeoutMs ?? 60000, quietMs: o.quietMs ?? QUIET_LONG_MS, pollMs: POLL_MS });

export const problems = (): Problem[] => (screenNow('summary').findings as { rule: string; what: string; where?: string }[] ?? []).map((f) => ({ kind: f.rule, text: f.what, where: f.where }));
export const memoryMB = (): number | null => appSnapshot().memory.gpuMB;
export const setLook = (look: string): void => useSettings.getState().setLook(look as LookChoice);
export { caughtCount, clock };

const step = (journey: string, label: string, run: () => Promise<void> | void) => ({ journey, label, run });

/** The journeys of the Phone check (short) and the Full check (long ones last). They are the moves a person makes: view to view, sheet after sheet, slide to slide, patient to patient. */
export function journeys(): Journey[] {
  const cat = liveCatalog();
  const open = (id: string) => { const e = cat.find((x) => x.id === id); return e ? () => openEntry(e) : () => { throw new Error(`${id} is not in this build`); }; };
  const has = (id: string) => cat.some((e) => e.id === id);
  const decks = builtinDecks();
  return [
    { id: 'views', label: 'Figure views, straight from view to view', steps: () => ['view:lobule', 'view:sinusoid', 'view:anatomic', 'view:sinusoid', 'view:lobule', 'view:anatomic'].filter(has).map((id) => step('views', id.replace('view:', 'to '), open(id))) },
    { id: 'sheets', label: 'Every sheet and menu', steps: () => SHEETS.map((s) => `sheet:${s}`).filter(has).map((id) => step('sheets', id.replace('sheet:', ''), open(id))).concat([step('sheets', 'close', leave)]) },
    { id: 'hvpg', label: 'HVPG, wedge and subtraction (slides 5 and 6)', steps: () => (has('slide:hvpg:5') ? [5, 6, 7].map((n) => step('hvpg', `slide ${n}`, open(`slide:hvpg:${n}`))).concat([step('hvpg', 'leave', leave)]) : []) },
    { id: 'patients', label: 'Patients', steps: () => UI.presets.slice(0, 4).map((p) => step('patients', p.label, open(`patient:${p.id}`))) },
    { id: 'decks', label: 'The first slide of every talk', steps: () => decks.map((d) => step('decks', d.title, open(`slide:${d.id}:1`))).concat([step('decks', 'leave', leave)]) },
    { id: 'long', label: 'Every slide of the first three talks', full: true, steps: () => decks.slice(0, 3).flatMap((d) => d.slides.map((s, i) => step('long', `${d.title} ${i + 1}. ${s.title}`, open(`slide:${d.id}:${i + 1}`)))).concat([step('long', 'leave', leave)]) },
  ];
}
