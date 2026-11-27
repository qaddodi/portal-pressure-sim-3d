// Everything that opens over the figure from the bars: the main menu, Settings, Search, Help, the Guide and the Reset dialog. All stay in the page and fade.
// The dialogs are the dialog shell's (surface/Dialog.tsx): a size-l one (a page, the Guide, Search) stands in the sheets' clip, so on a phone it is a sheet that tucks behind the dock;
// a size-s question stands over everything.
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
import { SheetClip } from './SheetClip.tsx';
import { CaseGuardDialog, CaseOwnLine } from '../case/CaseGuard.tsx';
import { Dialog } from '../surface/Dialog.tsx';

function ResetDialog() {
  const open = useShell((s) => s.dialog === 'reset');
  const close = () => useShell.setState({ dialog: null });
  return (
    <Dialog id="reset" size="s" open={open} role="alertdialog" label={RESET.title} onCancel={close} className="sh-dialog">
      <h2>{RESET.title}</h2>
      <p>{RESET.body}</p>
      <div className="sh-btns">
        <button type="button" className="sh-btn" onClick={close}>{RESET.cancel}</button>
        <button type="button" className="sh-btn" data-danger="true" onClick={resetEverything}>{RESET.go}</button>
      </div>
    </Dialog>
  );
}

export function Sheets() {
  const talk = useTalkOn();
  const device = useUi((s) => s.device);
  return (
    <>
      {!talk && <InApp><ActionCard /></InApp>}
      {!talk && <InApp><TreatCard /></InApp>}
      <SheetClip id="sheets">
        <UMenu />
        {figureRowsOwner(device) === 'sheet' && !talk && <LayersSheet />}
        {!talk && <SettingsSheet place="top" />}
        <HistorySheet />
        <TimelineSheet />
        <DifferencesSheet />
        <WhySheet />
        <SearchSheet />
        <HelpMenu />
        <Guide />
        <PageDialog />
      </SheetClip>
      <ResetDialog />
      <DeckDialogs />
      <CaseOwnLine hidden={talk} />
      <CaseGuardDialog />
    </>
  );
}
