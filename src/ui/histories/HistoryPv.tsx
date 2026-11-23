// A model patient's card in the menu (look B, mock 2): what it is and how far along, the portal vein pressure over the whole course with its steps in words, what happened in a sentence, and
// the two doors: Open patient (as they are today) and Open as a chart (the timeline chart with the whole history). It folds open under the row (the ⓘ) and shows beside the panel for a mouse.
import { Chart } from '../charts/Chart.tsx';
import { courseScene } from './course-scene.ts';
import { useShell } from '../shell/store.ts';
import { openHistory } from './open.ts';
import type { HistoryMeta } from './types.ts';

/** Open the patient, then the menu goes; the chart too when asked (the chart waits for the patient's days: openHistory comes back once they are in). */
export async function openFromMenu(id: string, asChart: boolean): Promise<void> {
  if (!(await openHistory(id))) return;
  const sh = useShell.getState();
  if (asChart) sh.open('timeline'); else sh.close();
}

export function HistoryPv({ h }: { h: HistoryMeta }) {
  return (
    <div className="um-pv-in pt hh-pv">
      <span className="um-pv-meta">{`${h.group} · ${h.where}`}</span>
      <h3>{h.name}</h3>
      <span className="hp-cap">{`Portal vein pressure over ${h.months} months (0 to ${h.max} mmHg)`}</span>
      <div className="hh-course" aria-hidden="true"><Chart tag="menu-history" glide={false} deps={[h.id]} label={`${h.name}: portal vein pressure over the course`} build={(c) => courseScene(h, c)} /></div>
      <p>{h.story}</p>
      <div className="um-acts">
        <button type="button" className="btn sm primary" onClick={() => void openFromMenu(h.id, false)}>Open patient</button>
        <button type="button" className="btn sm ghost" onClick={() => void openFromMenu(h.id, true)}>Open as a chart</button>
      </div>
    </div>
  );
}
