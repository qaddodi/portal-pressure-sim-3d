// ?stress, inside one frame (`?audit=capture&stress=<layout>`, audit/capture-child.ts): the layout's slides, its transitions, its menus and sheets, each as a picture with an entry that says what
// it shows and which checks it passed (stress/report.ts). Files go up as they are made (`partial`), so a frame that is stopped or dies keeps what it
// had. The outer page (stress/outer.ts) joins the layouts.
import { captureAllDecks } from '../audit/capture-all.ts';
import { capturePromoExtras } from '../audit/capture-promo-extra.ts';
import { drawShot } from '../audit/capture-shot.ts';
import { cardBoxes } from '../audit/card-boxes.ts';
import { stillPage, sleep } from '../audit/capture-settle.ts';
import { baseOf } from '../promo/slides.ts';
import { useShell } from '../../shell/store.ts';
import { useUi } from '../../ui-store.ts';
import type { ZipFile } from '../../capture/zip.ts';
import { STRESS_SLIDES, STRESS_MOVES, STRESS_MENUS, STRESS_SHEETS, STRESS_RATIO, MENU_MOVE_ID, MOVE_SHOTS, layoutSteps, type StressLayout } from './plan.ts';
import { cardChecks, type Entry, type LayoutRun, type Check } from './report.ts';
import { playMove, standAt, menuKit, sheetKit, clearScreen, type MoveShot } from './moves.ts';

export interface StressUi {
  layout: StressLayout;
  status(s: string): void;
  progress(done: number, total: number): void;
  stop(): boolean;
  /** files as they are made (a frame that is cut off keeps them) */
  partial(files: ZipFile[]): void;
}
export interface StressResult { files: ZipFile[]; run: LayoutRun; shots: number; stopped: boolean }

const enc = new TextEncoder(), dec = new TextDecoder();
const real = (ms: number): number => ms;
/** A slide's capture JSON, the part this run reads. */
interface SlideJson {
  deck: string; deckTitle: string; stop: number; of: number; step: number; beat: number; title: string; card?: string;
  cards?: { card: string; box: number; content: number; past: number }[]; link?: string;
}

export async function runStress(ui: StressUi): Promise<StressResult> {
  const t0 = new Date().getTime(), L = ui.layout, total = layoutSteps(L), entries: Entry[] = [], notes: string[] = [];
  let shots = 0, stopped = false, base = 0;
  const label = L.label;
  const bump = (n: number): void => { base += n; ui.progress(Math.min(base, total), total); };

  // --- slides: the capture's own pass over the picked slides, with no choice pictures (they are a deck-wide audit's, not a stress run's)
  ui.status(`${label}: key slides`);
  const pick = new Set(STRESS_SLIDES.map((s) => s.key));
  const slideBase = base;
  const slides = await captureAllDecks({
    pick, decks: null, release: true, noChoices: true,
    status: (s) => ui.status(`${label}: ${s}`), stop: ui.stop,
    progress: (n) => ui.progress(Math.min(slideBase + n, total), total),
    partial: (fs) => {
      const out: ZipFile[] = [];
      for (const f of fs) {
        if (!/\.(jpg|json)$/.test(f.name)) continue;   // (the contact sheets and the README are a full audit's)
        const flat = `slides/${f.name.replace(/\//g, '-')}`;
        if (f.name.endsWith('.jpg')) { out.push({ name: flat, data: f.data }); continue; }
        try {
          const j = JSON.parse(dec.decode(f.data)) as SlideJson;
          const where = `${j.deckTitle} ${j.stop}`;
          entries.push({
            section: 'slides', layout: label, file: flat.replace(/\.json$/, '.jpg'), title: `${where}: ${j.title}${j.card ? ` (${j.card})` : ''}`,
            state: `talk ${j.deck}, slide ${j.stop} of ${j.of - 2}, step ${j.step}, beat ${j.beat}, ${j.card ? `the card ${j.card}` : 'one view'}`,
            link: j.link, checks: cardChecks(j.cards), issues: [],
          });
        } catch { notes.push(`${f.name}: its state file could not be read`); }
      }
      shots += out.length;
      ui.partial(out);
    },
  });
  notes.push(...slides.notes);
  bump(STRESS_SLIDES.length);
  if (slides.stopped || ui.stop()) stopped = true;

  // --- transitions: the slowed press, three pictures each
  if (L.moves && !stopped) {
    const one = async (id: string, why: string, ready: () => Promise<string | null>, press: () => void, kit: Parameters<typeof playMove>[1]): Promise<void> => {
      ui.status(`${label}: transition ${id}`);
      const problem = await ready();
      // (a talk that would not open or has no Next to press has no move to photograph: it is said, not faked)
      if (problem && /not in the catalog|did not open|has no Next|is the last/.test(problem)) { notes.push(`transition ${id}: ${problem}`); bump(MOVE_SHOTS); return; }
      const r = await playMove(press, kit, ui.stop);
      const files: ZipFile[] = [];
      for (const s of r.shots) files.push(await fileOf(id, s));
      const link = r.shots[r.shots.length - 1]?.link;
      for (const s of r.shots) {
        const check: Check[] = s.name === 'end' ? r.checks : [{ name: 'cards keep their size after they land', ok: r.checks[0]?.ok ?? true, detail: r.checks[0]?.detail }];
        entries.push({
          section: 'moves', layout: label, file: `moves/${id}-${s.name}.jpg`, title: `${id}, ${s.name}`,
          state: `${why}; ${s.name === 'end' ? 'the settled end' : `${s.atMs} ms after the press, page slowed`}`,
          link, checks: check, issues: s.name === 'start' ? [...(problem ? [problem] : []), ...r.issues] : [],
        });
      }
      shots += files.length;
      ui.partial(files);
      bump(MOVE_SHOTS);
    };
    for (const m of STRESS_MOVES) {
      if (ui.stop()) { stopped = true; break; }
      await one(m.id, m.why, () => standAt(m.deck, m.from, ui.stop), () => { useUi.getState().move('next'); }, { cardUp: () => !!document.querySelector('.dk-card[data-phase="in"]') });
    }
    if (!stopped && !ui.stop()) {
      await one(MENU_MOVE_ID, 'the menu rises over the free figure', async () => { await clearScreen(); useShell.setState({ menuTab: 'present',
        menuQuery: '' }); return null; }, () => useShell.getState().open('menu'), menuKit);
      useShell.setState({ sheet: null });
    }
    if (ui.stop()) stopped = true;
  }

  // --- menus and pages, then the sheets
  if (L.menus && !stopped) {
    const m0 = base;
    ui.status(`${label}: menus`);
    const x = await capturePromoExtras({
      keys: STRESS_MENUS, ratio: STRESS_RATIO, status: (s) => ui.status(`${label}: ${s}`), stop: ui.stop, progress: (n) => ui.progress(Math.min(m0 + n, total), total), release: true,
      partial: (fs) => {
        const out: ZipFile[] = [];
        for (const f of fs) {
          if (f.name.endsWith('.png')) { out.push({ name: `menus/${f.name}`, data: f.data }); continue; }
          if (!f.name.endsWith('.json')) continue;
          try {
            const j = JSON.parse(dec.decode(f.data)) as { key: string; title: string; cards?: SlideJson['cards']; link?: string };
            entries.push({ section: 'menus', layout: label, file: `menus/${baseOf(j.key)}.png`, title: j.title || j.key, state: j.key, link: j.link, checks: cardChecks(j.cards), issues: [] });
          } catch { notes.push(`${f.name}: its state file could not be read`); }
        }
        shots += out.length;
        ui.partial(out);
      },
    });
    notes.push(...x.notes);
    bump(STRESS_MENUS.length);
    if (x.stopped || ui.stop()) stopped = true;
    for (const name of STRESS_SHEETS) {
      if (stopped || ui.stop()) { stopped = true; break; }
      ui.status(`${label}: the ${name} sheet`);
      await clearScreen();
      useShell.getState().open(name);
      const r = await stillPage(real, false, false, { ...sheetKit(name), stop: ui.stop });
      await sleep(real(60));
      const s = await drawShot({ ratio: STRESS_RATIO, thumb: false });
      if (!s) { notes.push(`the ${name} sheet could not be drawn`); bump(1); continue; }
      const data = await s.encoded;
      if (!data) { notes.push(`the ${name} sheet could not be encoded`); bump(1); continue; }
      const file = `menus/sheet-${name}.jpg`;
      ui.partial([{ name: file, data }]);
      shots++;
      entries.push({ section: 'menus', layout: label, file, title: `${name[0]!.toUpperCase()}${name.slice(1)} sheet`, state: `the ${name} sheet open over the free figure`,
        link: s.record.link, checks: cardChecks(cardBoxes(document)), issues: r.moving ? [`not still when taken (${r.moving})`] : [] });
      useShell.setState({ sheet: null });
      bump(1);
    }
  }
  await clearScreen();
  const run: LayoutRun = { layout: L.id, label, entries, notes, secs: Math.round((new Date().getTime() - t0) / 100) / 10, ...(stopped ? { ended: 'stopped' } : {}) };
  return { files: [{ name: 'entries.json', data: enc.encode(JSON.stringify(run)) }], run, shots, stopped };
}

/** One frame of a move as a file. */
async function fileOf(id: string, s: MoveShot): Promise<ZipFile> {
  return { name: `moves/${id}-${s.name}.jpg`, data: (await s.encoded) ?? new Uint8Array(0) };
}
