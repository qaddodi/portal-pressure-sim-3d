// The card's quiet status and the Doppler's vessel (2D dock.js updateHeader / paintTitle). The status is the model's state in two words: nothing while it runs, "Paused", or the day count once days have
// passed ("Day 41", "Paused · Day 41"); the head shows it, and its title the vessel the Doppler reads beside the name, while the tabs are folded away (the 2D stylesheet hides both while the tabs are
// shown, app-09-tests.css .dock-head.tabbed). Made when the state or the day changes, never per frame.
import { useShell } from '../../shell/store.ts';
import { useTests } from '../store.ts';
import { useDopplerProbe } from '../doppler/probe-state.ts';
import { EDGES } from '../../../engine/hales/portal/topology.js';

const EDGE_LABEL = new Map<string, string>((EDGES as { id: string; label?: string }[]).map((e) => [e.id, e.label ?? e.id]));

/** The words of the status (2D dayText and the Paused case). */
export function statusWords(running: boolean, day: number): string {
  return day > 0 ? (running ? `Day ${day}` : `Paused · Day ${day}`) : running ? '' : 'Paused';
}
/** The vessel the Doppler reads, named for the title: only while the Doppler is the one instrument up. */
export function dopplerVessel(pane: string, second: string | null, probe: string | undefined): string {
  return pane === 'doppler' && !second && probe ? EDGE_LABEL.get(probe) ?? '' : '';
}

export function useTestsStatus(): { text: string; state: 'live' | 'paused'; vessel: string } {
  const running = useShell((s) => s.transport.running), day = useShell((s) => s.transport.day);
  const pane = useTests((s) => s.pane), second = useTests((s) => s.second), probe = useDopplerProbe((s) => s.probe);
  return { text: statusWords(running, day), state: running ? 'live' : 'paused', vessel: dopplerVessel(pane, second, probe) };
}
