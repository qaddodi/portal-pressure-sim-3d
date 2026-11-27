// ?promotion's pictures that are not slides of a talk (promo/slides.ts `Target`):
//  - `history:<case>[:<stop>]`: a model patient's case at a stop (Play the case): the figure, the stop card and the case bar, whose strip is the patient's chronological timeline;
//  - `overview[:<tab>]`: the menu's first screens.
// It reuses the capture's own parts, not a copy of them: the same settling (capture-settle.ts), the same picture (capture-shot.ts drawShot, a PNG at the frame's pixel ratio),
// the case's own start and jump (case/run.ts, as capture-cases.ts plays it), and the same files (`<base>.png` and `<base>.json`, the base from promo/slides.ts baseOf) that the
// outer page frames. Like the slide pass it goes straight to what is named (a stop is jumped to, as the bar's own buttons do, never walked to) and takes the screen as it opens,
// at the page's own speed. Nothing is saved to the browser.
import { HISTORIES } from '../../histories/index.generated.ts';
import { targetOf, baseOf, stopIndex } from '../promo/slides.ts';
import { useShell, type MenuTab } from '../../shell/store.ts';
import { openHistory } from '../../histories/open.ts';
import { useCase } from '../../case/store.ts';
import { talkOn } from '../../../state/deck.ts';
import { leaveTalk } from '../../shell/talk.ts';
import { sleep, until, stillPage, showLanded, startCaptureClock, RELEASED, type SettleKit } from './capture-settle.ts';
import { drawShot } from './capture-shot.ts';
import { cardBoxes } from './card-boxes.ts';
import { caseUp, modelDay, stopKit } from './capture-cases.ts';
import type { ZipFile } from '../../capture/zip.ts';

export interface ExtraUi {
  /** the keys to take, as typed (`history:hist-bleed:3`, `overview:patients`) */
  keys: readonly string[];
  /** the frame's pixel ratio */
  ratio: number;
  status(s: string): void;
  progress(done: number, total: number): void;
  stop(): boolean;
  partial?(files: ZipFile[]): void | Promise<void>;
  release?: boolean;
}
export interface ExtraResult { files: ZipFile[]; notes: string[]; shots: number; secs: number; stopped: boolean }

/** The case a history key names, as the menu has it. */
const metaOf = (id: string) => HISTORIES.find((h) => h.id === id);
/** Still, for the menu: it stands open on the tab asked for with its rows in. */
const menuKit = (tab: MenuTab): SettleKit => ({
  cardUp: () => !!document.querySelector('.menu-group, .menu-item'),
  extra: () => { const s = useShell.getState(); return s.sheet === 'menu' && s.menuTab === tab ? '' : 'the menu has not opened on its tab yet'; },
});

/** Still, for the chart: the sheet is open with its card in. */
const chartKit: SettleKit = {
  cardUp: () => !!document.querySelector('.bt'),
  extra: () => (useShell.getState().sheet === 'timeline' ? '' : 'the chart has not opened yet'),
};

/** Still, for History's panel: it is open with the case's days in. */
const timelineKit: SettleKit = {
  cardUp: () => !!document.querySelector('.hs-when'),
  extra: () => (useShell.getState().sheet === 'history' ? '' : "History's panel has not opened yet"),
};

export async function capturePromoExtras(ui: ExtraUi): Promise<ExtraResult> {
  const t0 = new Date().getTime(), files: ZipFile[] = [], notes: string[] = [], enc = new TextEncoder(), encoding: Promise<void>[] = [], flushed = new Set<string>();
  const real = (ms: number) => ms, putBack = startCaptureClock(1, false);
  let shots = 0, stopped = false, done = 0;
  const flush = async (): Promise<void> => {
    await Promise.all(encoding);
    const fresh = files.filter((f) => !flushed.has(f.name));
    for (const f of fresh) flushed.add(f.name);
    if (fresh.length) await ui.partial?.(fresh);
    if (ui.release) for (const f of fresh) f.data = RELEASED;
  };
  /** Settle (with `kit`), take the screen and keep it as `<base>.png` with its state in `<base>.json`. */
  const take = async (key: string, title: string, kit: SettleKit, what: Record<string, unknown>): Promise<boolean> => {
    const r = await stillPage(real, false, false, { ...kit, stop: ui.stop });
    if (r.moving && ui.stop()) return false;
    if (r.moving) notes.push(`${key}: still not still after the wait (${r.moving}); taken as it was`);
    await showLanded(false, real);
    const shot = await drawShot({ ratio: ui.ratio, png: true, thumb: false });
    if (!shot) { notes.push(`${key}: could not be drawn`); return false; }
    for (const m of shot.missing) notes.push(`${key}: a picture of the page did not load and is missing from the picture: ${m}`);
    const base = baseOf(key);
    encoding.push(shot.encoded.then((data) => { if (data) files.push({ name: `${base}.png`, data }); }));
    files.push({ name: `${base}.json`, data: enc.encode(JSON.stringify({ key, title, ...what, cards: cardBoxes(document), ...shot.record }, null, 1)) });
    shots++; done++; ui.progress(done, ui.keys.length);
    return true;
  };
  try {
    const run = await import('../../case/run.ts');
    // (a talk or a case left open would stand under what is taken: every picture starts from the free figure)
    const clear = async (): Promise<void> => {
      if (talkOn()) { leaveTalk(); await sleep(real(200)); }
      if (useCase.getState().phase !== 'off') { run.endCase(); await sleep(real(120)); }
      useShell.setState({ sheet: null, dialog: null });
    };
    const targets = ui.keys.map((k) => ({ key: k, t: targetOf(k) }));
    // the cases first, each played from its first stop once and every stop asked for of it taken in order; then the menu's screens
    const byCase = new Map<string, { key: string; stop: number | null }[]>();
    for (const { key, t } of targets) if (t?.kind === 'history') byCase.set(t.id, [...(byCase.get(t.id) ?? []), { key, stop: t.stop }]);
    for (const [id, asks] of byCase) {
      if (ui.stop()) { stopped = true; break; }
      const meta = metaOf(id);
      if (!meta) { for (const a of asks) notes.push(`${a.key}: there is no model patient called ${id}`); continue; }
      await clear();
      ui.status(`${meta.name}: opening the case`);
      if (!(await run.startCase(id))) { for (const a of asks) notes.push(`${a.key}: the case did not start (the patient would not open, or it has fewer than two stops)`); continue; }
      await until(caseUp, real(25000));
      if (!caseUp()) notes.push(`${meta.name}: the case bar did not come up after 25 s; the stops are taken as they stand`);
      const stops = [...useCase.getState().stops];
      for (const a of [...asks].sort((x, y) => (stopIndex(x.stop, stops.length) ?? 0) - (stopIndex(y.stop, stops.length) ?? 0))) {
        if (ui.stop()) { stopped = true; break; }
        const i = stopIndex(a.stop, stops.length);
        if (i === null) { notes.push(`${a.key}: ${meta.name} has ${stops.length} stops`); continue; }
        const stop = stops[i]!;
        ui.status(`${meta.name}: stop ${i + 1} of ${stops.length}, Day ${stop.day} “${stop.title}”`);
        if (useCase.getState().at !== i || useCase.getState().phase !== 'stop') run.goStop(i);
        await until(() => useCase.getState().phase === 'stop' && useCase.getState().at === i, real(5000));
        await until(() => { const d = modelDay(); return d === null || Math.abs(d - stop.day) <= 1; }, real(4000));
        const md = modelDay();
        if (md !== null && Math.abs(md - stop.day) > 1) notes.push(`${a.key}: the model stands on Day ${md} and the stop says Day ${stop.day}`);
        await take(a.key, stop.title, stopKit(i, stop), { case: id, caseName: meta.name, stop: i + 1, of: stops.length, day: stop.day, modelDay: md });
      }
      run.endCase(); await sleep(real(120));
      await flush();
    }
    // the full chart of a case: the patient as they are today (Open patient) with the timeline chart open, as "See as a chart" opens it
    for (const { key, t } of targets) {
      if (!t || (t.kind !== 'chart' && t.kind !== 'timeline')) continue;
      if (ui.stop()) { stopped = true; break; }
      const meta = metaOf(t.id);
      if (!meta) { notes.push(`${key}: there is no model patient called ${t.id}`); continue; }
      await clear();
      ui.status(`${meta.name}: opening the patient and its ${t.kind}`);
      if (!(await openHistory(t.id))) { notes.push(`${key}: the patient would not open`); continue; }
      const chart = t.kind === 'chart';
      useShell.getState().open(chart ? 'timeline' : 'history');
      await until(() => !!document.querySelector(chart ? '.bt' : '.hs-when'), real(8000));
      await take(key, `${meta.name}, ${chart ? 'as a chart' : 'the timeline'}`, chart ? chartKit : timelineKit, { case: t.id, caseName: meta.name, view: t.kind });
      await flush();
    }
    for (const { key, t } of targets) {
      if (!t || t.kind !== 'overview') continue;
      if (ui.stop()) { stopped = true; break; }
      await clear();
      ui.status(`the menu on its ${t.tab} tab`);
      useShell.setState({ menuTab: t.tab, menuQuery: '' });
      useShell.getState().open('menu');
      await until(() => !!document.querySelector('.menu-group, .menu-item'), real(8000));
      await take(key, `Menu, ${t.tab}`, menuKit(t.tab), { menuTab: t.tab });
      await flush();
    }
  } finally {
    putBack();
    try { (await import('../../case/run.ts')).endCase(); } catch { /* the case code never loaded */ }
    useShell.setState({ sheet: null });
  }
  await flush();
  return { files: ui.release ? files.filter((f) => !flushed.has(f.name)) : files, notes, shots, secs: Math.round((new Date().getTime() - t0) / 100) / 10, stopped };
}
