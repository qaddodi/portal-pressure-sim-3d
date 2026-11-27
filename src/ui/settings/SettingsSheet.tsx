// The Settings menu, on 2D's menu markup (main.js openSettings: .menu.app-menu with titled .menu-group sections, .menu-item and .lens-opt rows, the look tiles, the Figure detail steps).
// The 2D app's rows, in its order and words (rows.ts, from the inventory). The same sheet opens from the top bar's gear (a panel under it), from the
// phone's bottom bar (a sheet from the foot) and from the presenter pill's gear (a panel above it). While a talk is on, the Model rows and Reset are left out, as in 2D.
// Model: Advanced physiology is a page of this menu (Advanced.tsx, the 2D panel's own rows); From readings opens the 2D flow in its own menu (readings/FromReadings.tsx).
import { Fragment, useEffect, useState } from 'react';
import { UI } from '../strings.generated.ts';
import { useSettings, FIGURE_DETAIL } from '../../state/settings.ts';
import { DEPTH_ROWS, AUTO_DETAIL_ROW, LITE_ROW, BUILD_PILL_ROW } from './depth-rows.ts';
import { buildLabel, buildNote } from '../shell/build-pill.ts';
import { useUpdate } from '../../pwa/update-state.ts';
import { loadNewestBuild } from '../../boot/reload.ts';
import { FigurePresets, useFigurePreset } from './FigurePresets.tsx';
import { MORE_NOW, MORE_PAGE_TITLE } from './preset-rows.ts';
import type { LookChoice } from '../../looks/looks.ts';
import { useShell } from '../shell/store.ts';
import { useUi } from '../ui-store.ts';
import { MenuGroup, MenuItem, MenuToggle } from '../shell/Menu.tsx';
import { Menu, type MenuPage } from '../surface/Menu.tsx';
import { HelpRows } from '../shell/HelpSheets.tsx';
import { HistoryList } from '../history/HistoryList.tsx';
import { HIST } from '../history/words.ts';
import { I } from '../shell/icons.tsx';
import { barRowsInSettings } from '../shell/room.ts';
import { FULLSCREEN, CAPTURE, RECORD } from '../shell/words.ts';
import { useRecording, recordAvailable, toggleRecording, warmRecording, recordRow } from '../capture/record-model.ts';
import { feedbackEmail } from '../shell/feedback.ts';
import { sendFeedback } from '../shell/send-feedback.ts';
import { SECTIONS, settingsRow, type Row } from './rows.ts';
import { Advanced } from './Advanced.tsx';
import { FromReadings, FR_WORDS, openFromReadings, warmFromReadings } from '../readings/FromReadings.tsx';
import { useTalkOn } from '../../state/deck.ts';
import { clock } from '../../clock/frame.ts';
import { originName, useOrigin } from '../shell/origin.ts';

const ICON: Record<string, string> = { 'Send feedback': 'mail', History: 'clock', Help: 'help', 'Enter full screen': 'fullscreen', 'Blur effect': 'layers', 'Sharp while moving': 'layers', 'Keyboard shortcuts': 'grid', 'Advanced physiology': 'sliders', 'Show frame rate': 'gauge', 'Show frame breakdown': 'gauge', 'Reset everything…': 'reset' };
const SWITCH: Record<string, 'blur' | 'sharpMoving' | 'keys' | 'showFps' | 'showBreakdown'> = { 'Blur effect': 'blur', 'Sharp while moving': 'sharpMoving', 'Keyboard shortcuts': 'keys', 'Show frame rate': 'showFps', 'Show frame breakdown': 'showBreakdown' };

function Switch({ row }: { row: Row }) {
  const key = SWITCH[row.label];
  const on = useSettings((s) => s[key]);
  return <MenuToggle checked={on} icon={ICON[row.label] ?? 'info'} label={row.label} sub={row.hint} onChange={(v) => useSettings.getState().set(key, v)} />;
}

/** 2D figureMpControl: − · the step in words · +, as `.seg.full.menu-seg.text-size.fig-mp` (ts-a, ts-reset). */
function FigureDetail() {
  const at = useSettings((s) => s.figureDetail);
  const set = (i: number) => useSettings.getState().set('figureDetail', Math.max(0, Math.min(FIGURE_DETAIL.length - 1, i)));
  const less = UI.settings.find((r) => r.label === 'Figure detail: Less detail')!.label.replace('Figure detail: ', '');
  const more = UI.settings.find((r) => r.label === 'Figure detail: More detail')!.label.replace('Figure detail: ', '');
  return (
    <>
      <div className="menu-title">Figure detail</div>
      <div className="seg full menu-seg text-size fig-mp" role="group" aria-label="Figure detail">
        <button type="button" className="ts-a ts-sm" aria-label={less} title={`${less} (softer, runs cooler)`} disabled={at === 0} onClick={() => set(at - 1)}>−</button>
        <button type="button" className="ts-reset" aria-label={`Figure detail: back to ${FIGURE_DETAIL[1].name}`} aria-pressed={at === 1} title={`Back to ${FIGURE_DETAIL[1].name}`} onClick={() => set(1)}>{FIGURE_DETAIL[at].name}</button>
        <button type="button" className="ts-a ts-lg" aria-label={more} title={`${more} (sharper, runs warmer)`} disabled={at === FIGURE_DETAIL.length - 1} onClick={() => set(at + 1)}>+</button>
      </div>
    </>
  );
}

/** Auto detail (3D only, N1): the figure's own governor (scene/detail-governor.ts) may take detail off when frames run slow. */
function AutoDetail() {
  const on = useSettings((s) => s.autoDetail);
  return <MenuToggle checked={on} icon={AUTO_DETAIL_ROW.icon} label={AUTO_DETAIL_ROW.label} sub={AUTO_DETAIL_ROW.hint} onChange={(v) => useSettings.getState().set('autoDetail', v)} />;
}

/**
 * Lite figure (3D only): on where the device chose it ("Chosen for this device") or the person did; the switch is how the full figure is tried, or the
 * lite one asked for. A person's choice stands (state/lite.ts).
 */
function LiteFigure() {
  const on = useSettings((s) => s.lite), by = useSettings((s) => s.liteBy);
  const sub = on && by === 'device' ? LITE_ROW.hintDevice : LITE_ROW.hint;
  return <MenuToggle checked={on} icon={LITE_ROW.icon} label={LITE_ROW.label} sub={sub} onChange={(v) => useSettings.getState().setLite(v, 'person')} />;
}

/**
 * Preview pill (3D only, preview builds only): the switch for the orange tab at the top edge, shown by default. The line under it names this build in plain words, so the commit
 * stays reachable with the pill hidden, and the row under it loads the newest build as the pill's tap does (boot/reload.ts).
 */
function BuildPillRow() {
  const on = useSettings((s) => s.showBuildPill);
  const newer = useUpdate((u) => u.commit);
  const [busy, setBusy] = useState(false);
  const reload = () => { if (busy) return; setBusy(true); void loadNewestBuild(); };
  const note = buildNote(buildLabel(import.meta.env.VITE_BUILD as string | undefined), newer);
  return (<>
    <MenuToggle checked={on} icon={BUILD_PILL_ROW.icon} label={BUILD_PILL_ROW.label} sub={BUILD_PILL_ROW.hint} onChange={(v) => useSettings.getState().set('showBuildPill', v)} />
    <small className="fs-hint">{note}</small>
    <MenuItem icon="reset" label={busy ? BUILD_PILL_ROW.reloading : newer !== null ? BUILD_PILL_ROW.updateNow : BUILD_PILL_ROW.update} title={BUILD_PILL_ROW.updateHint} onClick={reload} />
  </>);
}

function useFullscreen() {
  const [on, setOn] = useState(false);
  useEffect(() => { const f = () => setOn(!!document.fullscreenElement); f(); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  const can = typeof document !== 'undefined' && !!document.fullscreenEnabled && !!document.documentElement.requestFullscreen;
  return { on, can, toggle: () => { void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined); } };
}

/** "What's wrong here?" (2D main.js: after Send feedback, on the preview copy only, where the bug packet has loaded): the same sheet as holding the orange PREVIEW pill. */
function WrongHere() {
  const open = (window as unknown as { pps?: { packet?: { open?: () => void } } }).pps?.packet?.open;
  if (!open) return null;
  return <MenuItem icon="help" label="What's wrong here?" onClick={() => { useShell.getState().close(); open(); }} />;
}

/** Capture screen (3D only): one picture of the whole screen, for troubleshooting. The sheet lets go first, so it is not in the picture; the code is fetched when the row is first tapped. */
function CaptureRow() {
  const talk = useTalkOn();
  const touch = typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 1;
  return (<>
    <MenuItem icon="camera" label={CAPTURE.row} kb={touch ? null : '⌥⇧S'} title={CAPTURE.hint} onClick={() => { void import('../capture/capture.ts').then((m) => m.captureScreen({ settle: true })); }} />
    <RecordRow touch={touch} />
    {talk ? <MenuItem icon="grid" label={CAPTURE.deckRow} title={CAPTURE.deckHint} onClick={() => { void import('../capture/capture-deck.ts').then((m) => m.captureThisDeck()); }} /> : null}
  </>);
}

// Record window: a video of this window. Shown only where the browser can share a window and write video (iPhone and older browsers: not at all).
// While recording the row is Stop, in the colour of a warning; the press runs inside the tap (record.ts has no import() before the browser's question).
function RecordRow({ touch }: { touch: boolean }) {
  const phase = useRecording((s) => s.phase);
  // (the recording code is fetched as Settings opens, so the press is not waiting on it)
  useEffect(() => { void warmRecording(); }, []);
  if (!recordAvailable()) return null;
  const on = phase === 'recording';
  const label = recordRow(phase, RECORD), kb = touch || phase !== 'idle' ? null : '⌥⇧R';
  return (
    <MenuItem
      icon={on ? 'close' : 'projector'} label={label} kb={kb} title={on ? RECORD.stopHint : RECORD.hint}
      className={on ? 'rec-on' : undefined} onClick={() => { void toggleRecording(); }}
    />
  );
}

/** How long after Settings opens a page it was asked for is pushed (the menu has its box by then, so the page slides in from the right rather than appearing with the menu). */
export const ASK_PAGE_MS = 60;
type PageId = 'history' | 'help' | 'advanced' | 'figure';
function Item({ row, push }: { row: Row; push(p: PageId): void }) {
  const close = () => useShell.getState().close();
  const fs = useFullscreen();
  const l = row.label;
  if (l === 'Send feedback') {
    const email = feedbackEmail();
    if (!email) return <WrongHere />;
    return <><MenuItem icon="mail" label={l} onClick={() => { close(); void sendFeedback(email); }} /><WrongHere /></>;
  }
  if (l === 'Enter full screen') {
    if (!fs.can) return /iPhone|iPod/.test(navigator.userAgent) && !matchMedia('(display-mode: standalone)').matches ? <small className="mm-role-note fs-hint">{FULLSCREEN.iphone}</small> : null;
    return <MenuItem icon="fullscreen" label={fs.on ? FULLSCREEN.exit : FULLSCREEN.enter} title={FULLSCREEN.hint} onClick={fs.toggle} />;
  }
  const go = () => {
    if (l === 'Help') push('help');
    else if (l === 'Reset everything…') useShell.setState({ sheet: null, dialog: 'reset' });
    else if (l === 'History') push('history');
    else if (l === 'Advanced physiology') push('advanced');
  };
  return <MenuItem icon={ICON[l] ?? 'info'} label={l} onClick={go} />;
}

/** 2D look-chooser.js: the looks as a grid of tiles, each drawing its look (a ground, a card on it, two lines of ink and a bar of the accent); System shows Light and Dark side by side. */
const half = (id: string) => <i className="look-half" data-look={id}><i className="look-card"><b /><b className="short" /><u /></i></i>;
function Looks({ names }: { names: Row[] }) {
  const cur = useSettings((s) => s.look);
  return (
    <div className="look-grid" role="group" aria-label="Appearance">
      {names.map((row) => {
        const id = row.label.toLowerCase() as LookChoice;
        return (
          <button key={id} type="button" className="look-tile" data-look={id} aria-pressed={cur === id} onClick={() => useSettings.getState().setLook(id)}>
            <span className="look-chip" aria-hidden="true">{id === 'system' ? <>{half('light')}{half('dark')}</> : half(id)}</span><span className="look-name">{row.label}</span><i className="look-spin" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

/** Figure depth (3D only): the five switches that go beyond 2D, each on its own so the figure can be compared with 2D (depth-rows.ts). */
function DepthGroup() {
  return (
    <MenuGroup title="Figure depth (3D only)">
      {DEPTH_ROWS.map((r) => <DepthSwitch key={r.key} row={r} />)}
    </MenuGroup>
  );
}
function DepthSwitch({ row }: { row: (typeof DEPTH_ROWS)[number] }) {
  const on = useSettings((s) => s[row.key]);
  return <MenuToggle checked={on} icon={row.icon} label={row.label} sub={row.hint} onChange={(v) => useSettings.getState().set(row.key, v)} />;
}

/** The page behind Figure's "More" row (review R6): the nine switches the presets set, each on its own, as the sheet showed them before the presets. Changing one reads as Custom on the main page. */
function FigureMore() {
  const at = useFigurePreset();
  return (<>
    <small className="fs-hint">{MORE_NOW(at)}</small>
    <MenuGroup title="Display">
      <Switch row={settingsRow('Display', 'Blur effect')} />
      <FigureDetail />
      <AutoDetail />
      <Switch row={settingsRow('Display', 'Sharp while moving')} />
    </MenuGroup>
    <DepthGroup />
  </>);
}

export function SettingsSheet({ place = 'top' }: { place?: 'top' | 'bar' }) {
  const talk = useTalkOn();
  const phone = barRowsInSettings(useUi((s) => s.device));
  const label = UI.topbar.find((t) => t.id === 'btnSettings')!.label!;
  // History and Help are pages inside this menu (2D menu recs P4): they slide in over the rows with a back row, and the menu stays open
  const [pageId, setPageId] = useState<PageId | null>(null);
  const open = useShell((s) => s.sheet === 'settings');
  // A page another place asked for (the chart's "What happened" on a phone asks for History): pushed once the menu is up,
  // so it slides in from the right over the rows exactly as a tapped row's page does
  const asked = useShell((s) => s.settingsPage);
  useEffect(() => {
    if (!asked) return;
    if (!open) { useShell.setState({ settingsPage: null }); return; }
    const id = clock.after(() => { setPageId(asked); useShell.setState({ settingsPage: null }); }, ASK_PAGE_MS, 'settings-page');
    return () => clock.cancel(id);
  }, [asked, open]);
  useEffect(() => { if (!open) setPageId(null); else void warmFromReadings().catch(() => undefined); }, [open]);   // (From readings is loaded by the time its row is tapped)
  // Back from a page returns to where Settings was opened from when it was opened from somewhere (the chart's "What happened" on a phone), else to the rows
  const origin = useOrigin('settings'), backName = originName(origin);
  const back = () => { setPageId(null); if (origin && pageId === 'history') useShell.getState().returnBack(); };
  const hist: MenuPage = { back: backName ?? label, title: HIST.title, body: <HistoryList /> };
  const page: MenuPage | null = pageId === 'history' ? hist : pageId === 'help' ? { back: label, title: 'Help', body: <HelpRows /> } : pageId === 'advanced' ? { back: label, title: 'Advanced physiology', body: <Advanced /> } : pageId === 'figure' ? { back: label, title: MORE_PAGE_TITLE, body: <FigureMore /> } : null;
  return (<>
    <Menu id="settings" label={label} title={label} cls="app-menu" width="m" align="end" side={place === 'bar' ? 'above' : 'below'} page={page} onBack={back}>
      {SECTIONS.map((sec, i) => {
        const rows = sec.rows.filter((r) => !(r.phone && !phone) && !(r.talk === false && talk));
        if (!rows.length) return null;
        return (<Fragment key={i}>
          <MenuGroup title={sec.title}>
            {sec.title === 'Display' ? <LiteFigure /> : null}
            {sec.title === 'Appearance' ? <Looks names={rows.map((r) => r.row)} /> : rows.map(({ row }) => {
              if (row.label.startsWith('Figure detail: ') || row.label === 'Blur effect' || row.label === 'Sharp while moving') return null;   // (under Figure > More: FigureMore)
              if (row.label === 'Figure detail') return <FigurePresets key={row.label} onMore={() => setPageId('figure')} />;
              if (row.kind === 'switch') return <Switch key={row.label} row={row} />;
              return <Item key={row.label} row={row} push={setPageId} />;
            })}
            {sec.title === 'Diagnostics' && import.meta.env.VITE_CHANNEL === 'preview' ? <BuildPillRow /> : null}
            {i === 0 ? <CaptureRow /> : null}
            {sec.title === 'Model' ? <MenuItem icon="rewind" label={FR_WORDS.title} kb={FR_WORDS.sub} title={FR_WORDS.hint} onClick={openFromReadings} /> : null}
          </MenuGroup>
        </Fragment>);
      })}
    </Menu>
    <FromReadings />
  </>);
}
