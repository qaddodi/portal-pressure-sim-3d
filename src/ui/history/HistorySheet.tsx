import { Frame } from '../shell/Frame.tsx';
import { HistoryList } from './HistoryList.tsx';
import { HIST } from './words.ts';
import './history.css';

/** History: a panel at the right on a laptop or an iPad on its side (2D: the card in Treat's place), a sheet from the foot on a phone. Kept current while open. */
export function HistorySheet() {
  return <Frame kind="history" label={HIST.title}><HistoryList /></Frame>;
}
