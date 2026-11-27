// ?audit's capture, whatever it takes: the slides of the talks (capture-all.ts), every history case played (capture-cases.ts), or both, in ONE zip. The self-test panel (`?audit=here`) and the frame
// the Mac's outer page holds (`?audit=capture`) both start here, so a case run goes through the same door, the same speed and skip choices, the same stop and the same progress as a slide run.
import { captureAllDecks, type AllUi, type AllResult } from './capture-all.ts';
import { captureCases, everyCaseId } from './capture-cases.ts';
import { capturePromoExtras } from './capture-promo-extra.ts';
import { casesReadme, type CaptureWhat } from './capture-cases-plan.ts';
import { zipBlob } from '../../capture/zip.ts';

export interface RunUi extends AllUi {
  what: CaptureWhat;
  /** the model patients to play when `what` takes cases (default every one) */
  cases?: readonly string[] | null;
  /** the look-closer pictures of each stop (default yes) */
  looks?: boolean;
  /** the promotion set's pictures that are not slides (`history:<case>[:<stop>]`, `overview[:<tab>]`, promo/slides.ts): taken after the picked slides, or alone when no slide is picked */
  extras?: readonly string[];
}
export interface RunResult extends AllResult { /** stops played and photographed (0 when no cases were taken) */ caseStops: number; cases: number }

export async function runCapture(ui: RunUi): Promise<RunResult> {
  // (a promotion run of extras: the picked slides, if any, then the extras; with no slide picked it takes none, never every slide)
  if (ui.promo && ui.extras?.length) return runPromoWithExtras(ui);
  const slides = ui.what !== 'cases', cases = ui.what !== 'slides';
  let first: AllResult | null = null, n0 = 0, total0 = 0;
  if (slides) {
    first = await captureAllDecks({ ...ui, progress: (n, total) => { n0 = n; total0 = total; ui.progress(n, total); } });
    if (!cases || first.stopped) return { ...first, caseStops: 0, cases: 0 };
  }
  const c = await captureCases({
    ids: ui.cases ?? everyCaseId(), status: ui.status, stop: ui.stop, speed: ui.speed, skip: ui.skip, looks: ui.looks,
    progress: (n, total) => ui.progress(n0 + n, total0 + total), partial: ui.partial, release: ui.release,
  });
  const at = new Date(), files = [...(first?.files ?? []), ...c.files];
  // (a run of cases alone has the README at the top too: the first thing a person opens)
  if (!first) files.unshift({ name: 'README.txt', data: new TextEncoder().encode(casesReadme(c.manifest)) });
  return {
    files, secs: Math.round(((first?.secs ?? 0) + c.secs) * 10) / 10,
    perSlide: first?.perSlide ?? { waitMs: c.shots ? Math.round((c.secs * 1000) / c.shots) : 0, drawMs: 0 }, speed: c.speed,
    zip: ui.release ? new Blob([]) : zipBlob(files, at), zipName: first ? first.zipName.replace(/\.zip$/, '-and-cases.zip') : c.zipName,
    collages: [...(first?.collages ?? []), ...c.collages], shots: (first?.shots ?? 0) + c.shots, decks: first?.decks ?? 0,
    stopped: c.stopped, notes: [...(first?.notes ?? []), ...c.notes], caseStops: c.stops, cases: c.cases,
  };
}

/** ?promotion with extras: the slides picked (none when the address has no `pick`), then each extra, in one result. */
async function runPromoWithExtras(ui: RunUi): Promise<RunResult> {
  let first: RunResult | null = null, n0 = 0, total0 = 0;
  if (ui.pick && ui.pick.size) {
    first = await runCapture({ ...ui, extras: undefined, what: 'slides', progress: (n, total) => { n0 = n; total0 = total; ui.progress(n, total); } });
    if (first.stopped) return first;
  }
  const x = await capturePromoExtras({
    keys: ui.extras!, ratio: ui.promo!.ratio, status: ui.status, stop: ui.stop, progress: (n, total) => ui.progress(n0 + n, total0 + total), partial: ui.partial, release: ui.release,
  });
  const at = new Date(), files = [...(first?.files ?? []), ...x.files];
  return {
    files, secs: Math.round(((first?.secs ?? 0) + x.secs) * 10) / 10, perSlide: first?.perSlide ?? { waitMs: 0, drawMs: 0 }, speed: 1,
    zip: ui.release ? new Blob([]) : zipBlob(files, at), zipName: first?.zipName ?? 'portal-pressure-promotion-extras.zip', collages: first?.collages ?? [],
    shots: (first?.shots ?? 0) + x.shots, decks: first?.decks ?? 0, stopped: x.stopped, notes: [...(first?.notes ?? []), ...x.notes], caseStops: 0, cases: 0,
  };
}
