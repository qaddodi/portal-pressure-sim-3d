// A case's stops (docs/approved/play-the-case.md, Mohammad's pick 1, 26 Nov: "every key moment by default, with a course able to change, add or drop one"): the story's start, each key
// moment and today, in order, each with the shot a slide would take there. The default shot follows what the moment is (a bleed frames the bleeding varix, a TIPS the Circuit at the
// stent, a medicine the portal flow ...); a course's `play.stops` (baked as days) changes a stop's fields or drops it. Pure: the story and the entries in, the stops out.
import type { Chapter, Moment } from '../timeline/story.ts';
import { momentKey } from '../timeline/story-view.ts';
import { BLEED_SAY, GLUE_LOOK, SCOPE_LOOK } from './looks.ts';
import type { CaseLook, CaseStopBaked, Stop, StopShot } from './types.ts';

/** The fields of a History entry the stops read (the page's Entry and a baked one both have them). */
export interface StopEntryIn { kind: string; label: string; day: number; snap?: unknown; evId?: string; keys?: readonly string[]; action?: boolean; step?: string }

export const START_KIND = 'Start', TODAY_KIND = 'Today';

const has = (es: readonly StopEntryIn[], ids: readonly number[], test: (e: StopEntryIn) => boolean): boolean => ids.some((i) => { const e = es[i]; return !!e && test(e); });
const keyed = (k: string) => (e: StopEntryIn) => !!e.keys?.some((x) => x === k || x.startsWith(k));

/** The shot a moment takes when its course says none. Read from every entry of the moment's day, the strongest first: a bleed, a procedure, an action, a medicine, an event. */
export function defaultShot(m: Moment, es: readonly StopEntryIn[]): StopShot {
  const ids = m.ids;
  if (m.type !== 'key') return { view: 'anatomic', cam: 'fit' };
  if (has(es, ids, (e) => e.evId === 'VARIX_RUPTURE')) return { view: 'anatomic', cam: has(es, ids, (e) => e.evId === 'VARIX_RUPTURE' && /gastric/i.test(e.label)) ? 'fundus' : 'bleed' };
  if (has(es, ids, keyed('tips'))) return { view: 'circuit', cam: 'tips' };
  if (has(es, ids, keyed('occ:C5')) || has(es, ids, keyed('occ:C2'))) return { view: 'anatomic', cam: 'fundus' };
  if (has(es, ids, (e) => !!e.action && /^Paracentesis/.test(e.label))) return { view: 'anatomic', cam: 'fit' };
  if (has(es, ids, (e) => !!e.action && /^Band/.test(e.label))) return { view: 'anatomic', cam: 'varices' };
  if (m.kind === 'Medicine') return { view: 'circuit', cam: 'portal', lens: 'flow' };
  if (has(es, ids, (e) => e.step === 'angioplasty')) return { view: 'anatomic', cam: 'hepatic' };
  if (has(es, ids, keyed('contractility'))) return { view: 'anatomic', cam: 'heart' };
  if (has(es, ids, (e) => e.evId === 'COURSE_doppler')) return { view: 'circuit', cam: 'tips' };
  if (has(es, ids, (e) => e.evId === 'RED_WALE' || e.evId === 'BLEED_RISK')) return { view: 'anatomic', cam: 'varices' };
  // (a gradient crossing its threshold: where the resistance is, the sinusoid in its lobule)
  if (has(es, ids, (e) => e.evId === 'CSPH')) return { view: 'lobule', cam: 'lobule:sinusoid' };
  return { view: 'anatomic', cam: 'fit' };
}

/** the entry a moment stops on: the last of its day that kept the model (History's "Show on the figure" goes to the same one), or -1 */
const entryOf = (es: readonly StopEntryIn[], ids: readonly number[]): number => { for (let k = ids.length - 1; k >= 0; k--) if (es[ids[k]!]?.snap) return ids[k]!; return -1; };

/** The bleed a moment holds (its rupture entry), if any. */
const ruptureOf = (es: readonly StopEntryIn[], ids: readonly number[]): StopEntryIn | undefined => ids.map((i) => es[i]).find((e) => e?.evId === 'VARIX_RUPTURE');
/** Where a bleed is: a fundal varix, or the esophageal ones. */
const siteOf = (e: StopEntryIn): 'GV' | 'VAR' => (/gastric/i.test(e.label) ? 'GV' : 'VAR');

/** What a bleed's two stops look at by default: the bleeding stop opens the scope's own view of it (an esophageal bleed, the Endoscopy card) or looks at the fundus (a fundal one: the esophageal scope shows
 *  no varix there); what is done about it looks again (the bands, or the glue to watch). A course's own `look` replaces these. */
const bleedLooks = (site: 'GV' | 'VAR', bleeding: boolean): { look: CaseLook[]; open: CaseLook | null } =>
  bleeding ? (site === 'VAR' ? { look: [SCOPE_LOOK], open: SCOPE_LOOK } : { look: [], open: null }) : { look: site === 'VAR' ? [SCOPE_LOOK] : [GLUE_LOOK], open: null };

/** The course's own word on a moment: one anchored to a step it holds, else the day's last moment (a day can hold two: a bleed, and what is done about it). */
function ownOf(own: readonly CaseStopBaked[], es: readonly StopEntryIn[], m: Moment, lastOnDay: boolean): CaseStopBaked | undefined {
  return own.find((o) => o.step && m.ids.some((i) => es[i]?.step === o.step)) ?? own.find((o) => !o.step && o.day === m.day && lastOnDay);
}

/** The case's stops: the start, every key moment and today that kept the model, in order, with the course's own word on each applied (by its step or day). A bleed whose model was kept as it
 *  bled has two stops on its day: the bleeding itself, then what is done about it. */
export function stopsOf(chapters: readonly Chapter[], es: readonly StopEntryIn[], own: readonly CaseStopBaked[] = []): Stop[] {
  const out: Stop[] = [], bleeding: boolean[] = [];
  /** the bleed the moment before ended at (its rupture), when it is the same day: this moment is what is done about it */
  let after: StopEntryIn | null = null;
  const moments = chapters.flatMap((c) => c.moments).filter((m) => m.type === 'start' || m.type === 'key' || m.type === 'today');
  moments.forEach((m, k) => {
    const entry = entryOf(es, m.ids);
    if (entry < 0) return;
    const rupture = m.type === 'key' ? ruptureOf(es, m.ids) : undefined;
    const atBleed = !!rupture && es[entry] === rupture;
    const lastOnDay = !moments.slice(k + 1).some((x) => x.day === m.day && entryOf(es, x.ids) >= 0);
    const mine = ownOf(own, es, m, lastOnDay);
    if (mine?.drop && m.type === 'key') return;   // (the start and today are always stops: the case begins and ends on them)
    const base = defaultShot(m, es);
    // (a course that names its own camera names its own shot; one that names only a view, a lens or labels keeps the default camera with them)
    const shot: StopShot = mine?.cam
      ? { view: mine.view ?? 'anatomic', cam: mine.cam, ...(mine.lens ? { lens: mine.lens } : {}) }
      : { ...base, ...(mine?.view ? { view: mine.view } : {}), ...(mine?.lens ? { lens: mine.lens } : {}) };
    if (mine?.labels?.length) shot.labels = [...mine.labels];
    const title = m.type === 'today' ? (m.head?.title ?? TODAY_KIND) : m.head.title;
    const source = rupture ?? (after && after.day === m.day ? after : null);
    const bl = source ? bleedLooks(siteOf(source), atBleed) : null;
    after = atBleed ? rupture! : null;
    out.push({
      key: momentKey(m), type: m.type, day: m.day, entry, title,
      kind: m.type === 'start' ? START_KIND : m.type === 'today' ? TODAY_KIND : m.kind,
      shot, look: (mine?.look ?? bl?.look ?? []).slice(0, 3), open: mine?.open ?? bl?.open ?? null,
      say: mine?.say ?? (atBleed ? BLEED_SAY[siteOf(rupture!)] : null),
    });
    bleeding.push(atBleed);
  });
  // (two stops on one day are one: the later, which is the day's end; but a bleed's own stop stands before what is done about it)
  return out.filter((s, i) => !(out[i + 1] && out[i + 1]!.day === s.day && !bleeding[i]));
}

/** The stop a day falls nearest (the strip let go of there), the earlier on a tie. */
export function nearestStop(stops: readonly Stop[], day: number): number {
  let best = 0;
  for (let i = 1; i < stops.length; i++) if (Math.abs(stops[i]!.day - day) < Math.abs(stops[best]!.day - day)) best = i;
  return best;
}
