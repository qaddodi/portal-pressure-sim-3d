// Everything that opens over the figure from the bars: the main menu, Settings, Search, Help, the Guide and the Reset dialog. All stay in the page and fade.
import { useRef } from 'react';
import { useShell } from './store.ts';
import { SettingsSheet } from '../settings/SettingsSheet.tsx';
import { UMenu } from '../menu/UMenu.tsx';
import { SearchSheet } from '../search/SearchSheet.tsx';
import { HelpMenu, Guide } from './HelpSheets.tsx';
import { LayersSheet } from './FigureMenu.tsx';
import { figureRowsOwner } from './room.ts';
import { useUi } from '../ui-store.ts';
import { HistorySheet } from '../history/HistorySheet.tsx';
import { TimelineSheet } from '../bigtime/TimelineSheet.tsx';
import { DifferencesSheet } from '../compare/CompareUi.tsx';
import { WhySheet } from '../why/WhySheet.tsx';
import { RESET } from './words.ts';
import { resetEverything } from './reset.ts';
import { DeckDialogs } from '../deck/DeckDialogs.tsx';
import { TreatCard } from '../treat/TreatCard.tsx';
import { InApp } from './InApp.tsx';
import { PageDialog } from './Pages.tsx';
import { ActionCard } from '../action/ActionCard.tsx';
import { useTalkOn } from '../../state/deck.ts';

function ResetDialog() {
  const open = useShell((s) => s.dialog === 'reset');
  const ref = useRef<HTMLDivElement>(null);
  const close = () => useShell.setState({ dialog: null });
  return (
    <>
      <div className="sh-scrim" data-open={open} onPointerDown={close} />
      <div ref={ref} className="sh-dialog" data-open={open} role="alertdialog" aria-modal="true" aria-label={RESET.title} inert={!open}>
        <h2>{RESET.title}</h2>
        <p>{RESET.body}</p>
        <div className="sh-btns">
          <button type="button" className="sh-btn" onClick={close}>{RESET.cancel}</button>
          <button type="button" className="sh-btn" data-danger="true" onClick={resetEverything}>{RESET.go}</button>
        </div>
      </div>
    </>
  );
}

export function Sheets() {
  const talk = useTalkOn();
  const device = useUi((s) => s.device);
  return (
    <>
      <UMenu />
      {!talk && <InApp><ActionCard /></InApp>}
      {!talk && <InApp><TreatCard /></InApp>}
      {figureRowsOwner(device) === 'sheet' && !talk && <LayersSheet />}
      {!talk && <SettingsSheet place="top" />}
      <HistorySheet />
      <TimelineSheet />
      <DifferencesSheet />
      <WhySheet />
      <SearchSheet />
      <HelpMenu />
      <Guide />
      <ResetDialog />
      <PageDialog />
      <DeckDialogs />
    </>
  );
}
