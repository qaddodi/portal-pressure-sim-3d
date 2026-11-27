import { create } from 'zustand';
import { engine } from '../../engine/index.ts';
import { useShell } from '../shell/store.ts';
import { announce } from '../timeline/announce.ts';
import type { Explanation } from './model.ts';

interface WhyState { metric: string | null; state: 'loading' | 'ready' | 'failed'; result: Explanation | null }
export const useWhy = create<WhyState>(() => ({ metric: null, state: 'loading', result: null }));

/** Open Why? for a metric (a readout's "Why?" link, 2D chart's onWhy). The same metric again closes it. The answer comes from the worker's `explain`. */
export async function openWhy(metric: string): Promise<void> {
  const sh = useShell.getState();
  if (sh.panels.why && useWhy.getState().metric === metric) { sh.closePanel('why'); return; }
  useWhy.setState({ metric, state: 'loading', result: null });
  sh.open('why');
  try {
    const { result } = (await engine().request({ type: 'explain', metric })) as unknown as { result?: Explanation };
    if (useWhy.getState().metric !== metric) return;
    if (!result) { useWhy.setState({ state: 'failed' }); return; }
    useWhy.setState({ state: 'ready', result });
    announce(`${result.label}. ${result.sentence}`);
  } catch {
    if (useWhy.getState().metric === metric) useWhy.setState({ state: 'failed' });
  }
}
