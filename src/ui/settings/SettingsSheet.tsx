// The Settings sheet: the 2D app's rows, in its order and words (rows.ts, from the inventory). The same sheet opens from the top bar's gear (a panel under it), from the
// phone's bottom bar (a sheet from the foot) and from the presenter pill's gear (a panel above it). While a talk is on, the Model rows and Reset are left out, as in 2D.
import { useEffect, useState } from 'react';
import { UI } from '../strings.generated.ts';
import { useSettings, FIGURE_DETAIL, FLOW_MARKS } from '../../state/settings.ts';
import type { LookChoice } from '../../looks/looks.ts';
import { useShell } from '../shell/store.ts';
import { useUi } from '../ui-store.ts';
import { Frame } from '../shell/Frame.tsx';
import { Icon } from '../shell/icons.tsx';
import { runFeature } from '../shell/features.ts';
import { usesBottomBar } from '../shell/room.ts';
import { FULLSCREEN, FLOW_LABEL, FLOW_MARKS_TITLE } from '../shell/words.ts';
import { feedbackEmail, feedbackHref } from '../shell/feedback.ts';
import { SECTIONS, type Row } from './rows.ts';

const ICON: Record<string, string> = { 'Send feedback': 'mail', History: 'clock', Help: 'help', 'Enter full screen': 'fullscreen', 'Blur effect': 'layers', 'Sharp while moving': 'layers', 'Keyboard shortcuts': 'grid', 'Advanced physiology': 'sliders', 'Show frame rate': 'gauge', 'Show frame breakdown': 'gauge', 'Reset everything…': 'reset' };
const SWITCH: Record<string, 'blur' | 'sharpMoving' | 'keys' | 'showFps' | 'showBreakdown'> = { 'Blur effect': 'blur', 'Sharp while moving': 'sharpMoving', 'Keyboard shortcuts': 'keys', 'Show frame rate': 'showFps', 'Show frame breakdown': 'showBreakdown' };

function Switch({ row }: { row: Row }) {
  const key = SWITCH[row.label];
  const on = useSettings((s) => s[key]);
  return (
    <button type="button" role="switch" className="sh-row" aria-checked={on} onClick={() => useSettings.getState().set(key, !on)}>
      <Icon n={ICON[row.label] ?? 'info'} /><span className="sh-t">{row.label}</span><span className="sh-sw" aria-hidden="true" />{row.hint && <span className="sh-d">{row.hint}</span>}
    </button>
  );
}

function FigureDetail() {
  const at = useSettings((s) => s.figureDetail);
  const set = (i: number) => useSettings.getState().set('figureDetail', Math.max(0, Math.min(FIGURE_DETAIL.length - 1, i)));
  const less = UI.settings.find((r) => r.label === 'Figure detail: Less detail')!.label.replace('Figure detail: ', '');
  const more = UI.settings.find((r) => r.label === 'Figure detail: More detail')!.label.replace('Figure detail: ', '');
  return (
    <>
      <div className="sh-title">Figure detail</div>
      <div className="sh-fig" role="group" aria-label="Figure detail">
        <button type="button" aria-label={less} title={`${less} (softer, runs cooler)`} disabled={at === 0} onClick={() => set(at - 1)}>−</button>
        <button type="button" className="sh-fig-now" aria-pressed={at === 1} aria-label={`Figure detail: back to ${FIGURE_DETAIL[1].name}`} title={`Back to ${FIGURE_DETAIL[1].name}`} onClick={() => set(1)}>{FIGURE_DETAIL[at].name}</button>
        <button type="button" aria-label={more} title={`${more} (sharper, runs warmer)`} disabled={at === FIGURE_DETAIL.length - 1} onClick={() => set(at + 1)}>+</button>
      </div>
    </>
  );
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
  return <button type="button" className="sh-row" onClick={() => { useShell.getState().close(); open(); }}><Icon n="help" /><span className="sh-t">What&apos;s wrong here?</span></button>;
}

function Item({ row }: { row: Row }) {
  const close = () => useShell.getState().close();
  const fs = useFullscreen();
  const l = row.label;
  if (l === 'Send feedback') {
    const email = feedbackEmail();
    if (!email) return <WrongHere />;
    return <><button type="button" className="sh-row" onClick={() => { close(); location.href = feedbackHref(email, { build: `PREVIEW · ${String(import.meta.env.VITE_BUILD ?? 'local').split('@').pop()}`, device: navigator.userAgent, screen: `${innerWidth} × ${innerHeight} at ${devicePixelRatio}×`, view: location.href }); }}><Icon n="mail" /><span className="sh-t">{l}</span></button><WrongHere /></>;
  }
  if (l === 'Enter full screen') {
    if (!fs.can) return /iPhone|iPod/.test(navigator.userAgent) && !matchMedia('(display-mode: standalone)').matches ? <p className="sh-note">{FULLSCREEN.iphone}</p> : null;
    return <button type="button" className="sh-row" title={FULLSCREEN.hint} onClick={fs.toggle}><Icon n="fullscreen" /><span className="sh-t">{fs.on ? FULLSCREEN.exit : FULLSCREEN.enter}</span></button>;
  }
  const go = () => {
    if (l === 'Help') useShell.setState({ sheet: 'help' });
    else if (l === 'Reset everything…') useShell.setState({ sheet: null, dialog: 'reset' });
    else if (l === 'History') { close(); runFeature('history', l); }
    else if (l === 'Advanced physiology') { close(); runFeature('advanced', l); }
  };
  return <button type="button" className="sh-row" onClick={go}><Icon n={ICON[l] ?? 'info'} /><span className="sh-t">{l}</span>{l === 'Help' && <Icon n="chev-right" className="sh-chev" />}</button>;
}

function Look({ row }: { row: Row }) {
  const id = row.label.toLowerCase() as LookChoice;
  const cur = useSettings((s) => s.look);
  return <button type="button" role="radio" className="sh-row" aria-checked={cur === id} onClick={() => useSettings.getState().setLook(id)}><span className="sh-look" data-look={id} aria-hidden="true" /><span className="sh-t">{row.label}</span>{cur === id && <Icon n="check" />}</button>;
}

function FlowMarks() {
  const cur = useSettings((s) => s.flowMarks);
  return (
    <>
      <div className="sh-title">{FLOW_MARKS_TITLE}</div>
      <div className="sh-seg-row" role="radiogroup" aria-label={FLOW_MARKS_TITLE}>
        {FLOW_MARKS.map((f) => <button key={f} type="button" role="radio" aria-checked={cur === f} aria-pressed={cur === f} title={FLOW_LABEL[f][1]} onClick={() => useSettings.getState().setFlowMarks(f)}>{FLOW_LABEL[f][0]}</button>)}
      </div>
      <p className="sh-note">{FLOW_LABEL[cur][1]}</p>
    </>
  );
}

export function SettingsSheet({ place = 'top' }: { place?: 'top' | 'bar' }) {
  const talk = useShell((s) => s.mode === 'deck');
  const phone = usesBottomBar(useUi((s) => s.device));
  return (
    <Frame kind="settings" label={UI.topbar.find((t) => t.id === 'btnSettings')!.label!} place={place}>
      {SECTIONS.map((sec, i) => {
        const rows = sec.rows.filter((r) => !(r.phone && !phone) && !(r.talk === false && talk));
        if (!rows.length) return null;
        return (
          <div key={i}>
            {i > 0 && !sec.title && <div className="sh-sep" />}
            {sec.title && <div className="sh-title">{sec.title}</div>}
            {rows.map(({ row }) => {
              if (row.label.startsWith('Figure detail: ')) return null;
              if (row.label === 'Figure detail') return <FigureDetail key={row.label} />;
              if (row.kind === 'switch') return <Switch key={row.label} row={row} />;
              if (row.kind === 'look') return <Look key={row.label} row={row} />;
              return <Item key={row.label} row={row} />;
            })}
            {sec.title === 'Appearance' && <FlowMarks />}
          </div>
        );
      })}
    </Frame>
  );
}
