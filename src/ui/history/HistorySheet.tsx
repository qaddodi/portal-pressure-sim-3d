import { ShellPanel } from '../surface/Panel.tsx';
import { HistoryList } from './HistoryList.tsx';
import { HIST } from './words.ts';
import './history.css';

/** History: a panel at the right on a laptop or an iPad on its side (2D: the card in Treat's place), a sheet from the foot on a phone. Kept current while open. Its box goes to the one
 *  room channel while it stands beside the figure (the panel shell, surface/Panel.tsx): the figure is panned (never zoomed) into what it leaves and the names keep off it (Mac promotion
 *  pictures of history:<case>:timeline, 27 Nov: a wide empty black area at the left and names running under the panel, before it took room). */
export function HistorySheet() {
  return <ShellPanel id="history" label={HIST.title}><HistoryList /></ShellPanel>;
}
