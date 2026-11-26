// ?audit's case pass: every model patient's case played with Play the case (ui/case), and every stop photographed. It reuses the slide pass's own pipeline, not a copy of
// it: the same settling (capture-settle.ts,
// "still" means the camera, the clock's motion, the fades, the charts and every reading printed on the cards have stopped), the same picture (capture-shot.ts drawShot), the
// same contact sheet and the same zip.
// For each case: the patient opens as they came, the case plays from stop to stop with Continue (the days run, the camera sets off, the figure eases onto the stop's model),
// and at every stop the screen is taken
// once it has settled: the figure with the stop card and the case bar. On a phone the sheet is also pulled up; and each "Look closer here" button is pressed (a Tests card
// or a view), taken, and put back.
// Files go under `cases/<NN-id>/`, with `cases/manifest.json` indexing all of it. Nothing is sent anywhere.
import { HISTORIES } from '../../histories/index.generated.ts';
import { readBox } from '../../layout-snap.ts';
import { talkOn } from '../../../state/deck.ts';
import { leaveTalk } from '../../shell/talk.ts';
import { clock } from '../../../clock/frame.ts';
import { latest } from '../../../engine/index.ts';
import { useCase } from '../../case/store.ts';
import { useTests } from '../../tests/store.ts';
import { useShell } from '../../shell/store.ts';
import { VIEWS } from '../../shell/views.ts';
import type { Stop } from '../../case/types.ts';
import { sleep, until, pad2, tagWords, stillPage, sheet, startCaptureClock, showLanded, type SettleKit } from './capture-settle.ts';
import { drawShot } from './capture-shot.ts';
import { cardBoxes } from './card-boxes.ts';
import { stopBase, pulledBase, lookBase, caseFolder, stopIssues, casesReadme, manifestJson, totalsOf } from './capture-cases-plan.ts';
import type { CaseRec, StopRec, LookRec, Manifest, Box } from './capture-cases-plan.ts';
import { feedbackBuild, commitOf } from '../../../boot/release.ts';
import { stampTime } from '../../capture/capture-model.ts';
import { zipBlob, type ZipFile } from '../../capture/zip.ts';

export interface CasesUi {
  /** the model patients to play (ids, in the menu's order) */
  ids: readonly string[];
  status(s: string): void;
  /** pictures done, and about how many there will be */
  progress(done: number, total: number): void;
  stop(): boolean;
  /** the page clock's speed for the run (default 60) */
  speed?: number;
  /** land every state at once, no animation played (see skipAnimations) */
  skip?: boolean;
  /** take the look-closer pictures too (default yes) */
  looks?: boolean;
}
export interface CasesResult {
  files: ZipFile[]; manifest: Manifest; notes: string[];
  shots: number; cases: number; stops: number; secs: number; stopped: boolean; speed: number;
  zip: Blob; zipName: string; collages: { name: string; blob: Blob }[];
}

/** The ids of every model patient, in the menu's order. */
export const everyCaseId = (): string[] => HISTORIES.map((h) => h.id);

const box = (el: Element | null): Box | null => {
  if (!el) return null;
  const r = readBox(el);
  return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
};
const SHOWN = '.cs-card[data-on="true"]';
/** The case bar and the stop card standing now, as boxes: what a stop's screen is judged by (stopIssues). */
const caseBoxes = (): { card: Box | null; bar: Box | null } => ({ card: box(document.querySelector(SHOWN)), bar: box(document.querySelector('.case-bar[data-on="true"]')) });
const caseUp = (): boolean => useCase.getState().phase === 'stop' && !!document.querySelector('.case-bar[data-on="true"]');
const titleShown = (): string => (document.querySelector(`${SHOWN} .cs-title`)?.textContent ?? '').trim();
/** The day the model stands on, rounded (the frame's own). */
const modelDay = (): number | null => (latest.frame ? Math.round(latest.frame.day) : null);

/** Still, for a stop: its card is up with this stop's words, the case is at it, and the bar is up. */
const stopKit = (i: number, stop: Stop): SettleKit => ({
  cardUp: () => !!document.querySelector(SHOWN) && !!document.querySelector('.case-bar[data-on="true"]'),
  extra: () => {
    const s = useCase.getState();
    if (s.phase !== 'stop' || s.at !== i) return 'the case has not reached this stop yet';
    return titleShown() === stop.title ? '' : 'the stop card has not taken this stop\'s words yet';
  },
});
/** Still, for a look: the Tests card is up (or the view has come), the stop's card has made way or stays. */
const lookKit: SettleKit = { cardUp: () => !!document.querySelector('.case-bar[data-on="true"]') };

const isView = (t: string): boolean => VIEWS.some((v) => v.id === t);
/** The card or view a Look closer button names is up now. */
function lookOpen(tool: string): boolean {
  if (isView(tool)) return useShell.getState().view === tool;
  const t = useTests.getState();
  return t.open && (t.pane === tool || t.second === tool);
}

/** Every model patient's case, played and photographed. */
export async function captureCases(ui: CasesUi): Promise<CasesResult> {
  const at = new Date(), t0 = new Date().getTime(), enc = new TextEncoder();
  const files: ZipFile[] = [], collages: { name: string; blob: Blob }[] = [], notes: string[] = [], encoding: Promise<void>[] = [], records: CaseRec[] = [];
  const every = everyCaseId(), ids = every.filter((id) => ui.ids.includes(id));
  const speed = ui.speed && ui.speed > 1 ? ui.speed : 60, real = (ms: number) => ms * speed, skip = !!ui.skip, wantLooks = ui.looks !== false;
  const build = feedbackBuild(import.meta.env.VITE_RELEASE, import.meta.env.VITE_BUILD, import.meta.env.VITE_CHANNEL);
  const putBack = startCaptureClock(speed, skip);
  const missing = new Set<string>();
  let shape = { w: 0, h: 0 }, done = 0, shots = 0, stopped = false, avgPerCase = 9;
  try {
    const run = await import('../../case/run.ts');
    // (a talk left open would stand under the case: the case is played from the free figure)
    if (talkOn()) { if (skip) clock.setDrawing(false); leaveTalk(); await sleep(real(200)); }
    for (const [c, id] of ids.entries()) {
      if (ui.stop()) { stopped = true; break; }
      const meta = HISTORIES.find((h) => h.id === id)!, folder = caseFolder(every, id), dir = `cases/${folder}`;
      const rec: CaseRec = { id, name: meta.name, folder, preset: meta.preset, group: meta.group, stops: [], sheet: null, notes: [] };
      records.push(rec);
      const note = (s: string): void => { rec.notes.push(s); notes.push(`${meta.name}: ${s}`); };
      ui.status(`${meta.name}: opening the case (${c + 1} of ${ids.length})`);
      if (skip) clock.setDrawing(false);
      const started = await run.startCase(id);
      if (!started) { note('the case did not start (the patient would not open, or it has fewer than two stops)'); continue; }
      await until(caseUp, real(25000));
      if (!caseUp()) { note('the case bar did not come up after 25 s; the stops are taken as they stand'); }
      const stops = [...useCase.getState().stops], thumbs: { n: string; title: string; img: HTMLCanvasElement }[] = [];
      const planned = stops.reduce((n, s) => n + 1 + (wantLooks ? s.look.length : 0), 0);
      const total = (): number => done + planned + Math.max(0, ids.length - c - 1) * avgPerCase;
      const doneBefore = done;
      /** Settle at the stop and take its picture: `name` is the file's base, `what` says which picture it is. */
      const shoot = async (name: string, what: Record<string, unknown>, label: string, i: number, issues?: string[]): Promise<string | null> => {
        const s = stops[i]!;
        const r = await stillPage(real, false, skip, issues ? stopKit(i, s) : lookKit);
        if (r.moving) note(`stop ${i + 1} "${s.title}": still not still after the wait (${r.moving}); taken as it was`);
        await showLanded(skip, real);
        const shot = await drawShot({ ratio: Math.min(devicePixelRatio, 2) });
        if (!shot) { note(`stop ${i + 1} "${s.title}": ${label} could not be drawn`); return null; }
        for (const m of shot.missing) if (!missing.has(m)) { missing.add(m); note(`a picture of the page did not load and is missing from the pictures: ${m}`); }
        shape = shot.shape;
        const found = caseBoxes();
        if (issues) issues.push(...stopIssues(found.card, found.bar, { w: innerWidth, h: innerHeight }));
        const meta2 = enc.encode(JSON.stringify({
          case: id, caseName: meta.name, stop: i + 1, of: stops.length, day: s.day, modelDay: modelDay(), title: s.title, kind: s.kind, type: s.type, shot: s.shot, ...what,
          phase: useCase.getState().phase, words: tagWords(), found, cards: cardBoxes(document), ...shot.record,
        }, null, 1));
        const file = `${dir}/${name}.jpg`;
        encoding.push(shot.encoded.then((data) => { if (data) files.push({ name: file, data }); }));
        files.push({ name: `${dir}/${name}.json`, data: meta2 });
        thumbs.push({ n: `${i + 1} ${label}`, title: s.title, img: shot.thumb });
        shots++; done++;
        ui.progress(done, total());
        return file;
      };
      for (let i = 0; i < stops.length; i++) {
        if (ui.stop()) { stopped = true; break; }
        const stop = stops[i]!, base = stopBase(i + 1, stop.day, stop.title);
        let arrived: StopRec['arrived'] = 'first';
        ui.status(`${meta.name}: stop ${i + 1} of ${stops.length}, Day ${stop.day} “${stop.title}”`);
        if (i > 0) {
          // (Continue as the card's button does: the days run on the engine's time-lapse, the camera sets off, the figure eases onto the stop's model; the stop is the one the case says)
          if (skip) clock.setDrawing(false);
          arrived = 'played';
          if (!run.continueCase()) arrived = 'jumped';
          await until(() => useCase.getState().phase === 'stop' && useCase.getState().at === i, real(30000));
          if (useCase.getState().phase !== 'stop' || useCase.getState().at !== i) {
            note(`stop ${i + 1} "${stop.title}": Continue did not land on it within 30 s; gone to it directly`);
            if (skip) clock.setDrawing(false);
            run.goStop(i); arrived = 'jumped';
            await until(() => useCase.getState().phase === 'stop' && useCase.getState().at === i, real(5000));
          }
        }
        const sr: StopRec = {
          n: i + 1, day: stop.day, title: stop.title, kind: stop.kind, type: stop.type, key: stop.key, shot: stop.shot, arrived,
          picture: null, pulled: null, looks: [], issues: [],
        };
        rec.stops.push(sr);
        // (the model stands on the stop's own day: the walk ends on the kept model, eased in; a frame that has not caught up says so)
        await until(() => { const d = modelDay(); return d === null || Math.abs(d - stop.day) <= 1; }, real(4000));
        const md = modelDay();
        if (md !== null && Math.abs(md - stop.day) > 1) sr.issues.push(`the model stands on Day ${md} and the stop says Day ${stop.day}`);
        sr.picture = await shoot(base, { step: 'stop' }, 'stop', i, sr.issues);
        // the iPhone's sheet pulled up: Look closer here and the figure's line are in view (a person pulls it up to use them)
        const pull = document.querySelector<HTMLElement>('.cs-phone .cs-grab');
        if (pull && stop.look.length && sr.picture) {
          if (skip) clock.setDrawing(false);
          pull.click(); await sleep(real(60));
          sr.pulled = await shoot(pulledBase(base), { step: 'pulled-up' }, 'pulled up', i);
          if (skip) clock.setDrawing(false);
          document.querySelector<HTMLElement>('.cs-phone .cs-grab')?.click(); await sleep(real(60));
        }
        // Look closer here: each button pressed, the card or view it opens taken, then put back (the stop's shot again, the Tests card closed)
        const nLooks = wantLooks && sr.picture ? stop.look.length : 0;
        for (let j = 0; j < nLooks; j++) {
          if (ui.stop()) { stopped = true; break; }
          const look = stop.look[j]!, lr: LookRec = { tool: look.tool, label: look.label, file: null, opened: false };
          sr.looks.push(lr);
          const btn = document.querySelectorAll<HTMLElement>(`${SHOWN} .cs-look button`)[j];
          if (!btn) { note(`stop ${i + 1} "${stop.title}": the button "${look.label}" is not on the card`); continue; }
          ui.status(`${meta.name}: stop ${i + 1}, look closer: ${look.label}`);
          if (skip) clock.setDrawing(false);
          btn.click();
          await until(() => lookOpen(look.tool), real(4000));
          lr.opened = lookOpen(look.tool);
          lr.file = await shoot(lookBase(base, j, look.label), { step: 'look', look: { tool: look.tool, label: look.label, opened: lr.opened } }, `look ${j + 1}`, i);
          if (skip) clock.setDrawing(false);
          if (useTests.getState().open) useTests.getState().close();
          const shotNow = await import('../../case/shot.ts');
          shotNow.showShot(stop.shot);
          await until(() => caseUp() && titleShown() === stop.title, real(4000));
        }
      }
      avgPerCase = Math.max(2, Math.round((done - doneBefore) || avgPerCase));
      // the case's contact sheet, once its pictures are taken
      if (thumbs.length) {
        const png = await sheet(meta.name, thumbs, shape);
        if (png) {
          rec.sheet = `${dir}/00-contact-sheet.png`;
          collages.push({ name: `${folder}-contact-sheet.png`, blob: png });
          files.push({ name: rec.sheet, data: new Uint8Array(await png.arrayBuffer()) });
        }
      }
      if (skip) clock.setDrawing(false);
      run.endCase();
      await sleep(real(120));
      if (stopped) break;
    }
  } finally {
    putBack();
    try { (await import('../../case/run.ts')).endCase(); } catch { /* the case code never loaded */ }
  }
  await Promise.all(encoding);
  const secs = Math.round((new Date().getTime() - t0) / 100) / 10;
  const manifest: Manifest = {
    kind: 'portal-pressure-cases', version: 1, build, made: stampTime(at), screen: `${innerWidth}x${innerHeight}`, ratio: Math.min(devicePixelRatio, 2), speed, walk: 'play', looks: wantLooks, stopped,
    cases: records, totals: totalsOf(records), notes,
  };
  files.push({ name: 'cases/manifest.json', data: enc.encode(manifestJson(manifest)) });
  files.push({ name: 'cases/README.txt', data: enc.encode(casesReadme(manifest)) });
  const commit = commitOf(import.meta.env.VITE_BUILD) || 'local', p2 = pad2;
  const stamp = `${at.getFullYear()}${p2(at.getMonth() + 1)}${p2(at.getDate())}-${p2(at.getHours())}${p2(at.getMinutes())}${p2(at.getSeconds())}`;
  files.sort((a, b) => (a.name < b.name ? -1 : 1));
  return {
    files, manifest, notes, shots, cases: records.length, stops: manifest.totals.stops, secs, stopped, speed,
    zip: zipBlob(files, at), zipName: `portal-pressure-cases-${commit}-${stamp}.zip`, collages,
  };
}
