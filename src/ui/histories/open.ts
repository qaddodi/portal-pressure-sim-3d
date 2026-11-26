// Opening a model patient: the patient as they are today (the model restored to the snapshot the course ended on) with their history in place: History's lines, and the days the timeline
// chart draws. The page's own load of a patient (patients/index.ts loadPatient) with `restore` for `preset`: the worker takes the state at once (a jump frame, nothing blends across it),
// the page's copy of the settings follows, and the feed lays the baked days in when that frame arrives.
import { engine, useEngine } from '../../engine/index.ts';
import { clock } from '../../clock/frame.ts';
import { setParams } from '../../engine/store.ts';
import { sanitizeParams } from '../../engine/hales/portal/scenario.js';
import { presetStarted } from '../action/params.ts';
import { useShell } from '../shell/store.ts';
import { PATIENT_FAILED } from '../shell/words.ts';
import { timeline, patientLabel } from '../timeline/index.ts';
import { useCompare } from '../compare/store.ts';
import { feed } from '../tests/feed.ts';
import { switchBegins, switchLands, switchEnds } from '../patients/switching.ts';
import { LOAD } from './index.generated.ts';
import { historyOf } from './meta.ts';
import { entriesOf } from './entries.ts';
import { caseAsk } from '../case/guard.ts';
import { useCase } from '../case/store.ts';

/** how long the days may take to come in before the patient opens anyway */
const DAYS_WAIT_MS = 1500;
let gen = 0;

/** Open a model patient as they are today. False when there is no such patient (or it could not be read). */
export async function openHistory(id: string): Promise<boolean> {
  const load = LOAD[id];
  if (!load || !historyOf(id)) return false;
  // (in a case, another patient, or this one opened again as they are today, ends it: it asks first, case/guard.ts; the case's own opening passes)
  const q = caseAsk(id === useCase.getState().id ? 'restart' : 'patient', id === useCase.getState().id ? '' : patientLabel(id));
  if (q && !(await q)) return false;
  const mine = ++gen;
  switchBegins();
  let baked;
  try { baked = await load(); } catch (e) {
    if (mine === gen) { switchEnds(); useShell.getState().say(PATIENT_FAILED, 'bad'); }
    console.error(e);
    return false;
  }
  if (mine !== gen) return false;
  useCompare.getState().stop();
  const params = sanitizeParams(baked.snap.params);
  const landed = feed.seedDays(baked.days);   // (laid in when the frame that replaced the model's state arrives)
  engine().send({ type: 'restore', snap: baked.snap });
  setParams(params); presetStarted(id, params as Parameters<typeof presetStarted>[1]);
  useEngine.setState({ presetId: id });
  useShell.setState({ patientId: id });
  timeline.adopt(entriesOf(baked, patientLabel(id)), baked.snap.params);
  // (the card or the chart that opens next draws the days: it waits for them, a second at most, so it never shows the last patient's)
  await Promise.race([landed, new Promise<void>((done) => { clock.afterReal(done, DAYS_WAIT_MS, 'histories-open'); })]);
  if (mine !== gen) return false;
  switchLands();
  return true;
}

/** Another patient is being loaded: a history that was still on its way is let go (and its days with it). */
export function historyLetGo(): void { gen++; feed.seedDays(null); }
