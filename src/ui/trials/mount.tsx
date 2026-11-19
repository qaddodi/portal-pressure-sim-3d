// ?trials: the Trials pane on its own, over the app's ground (the Tests card, B11, mounts the same pane). One line in main.tsx calls mountTrials(); it does nothing without ?trials in the address.
import { createRoot } from 'react-dom/client';

export function mountTrials(): void {
  if (!new URLSearchParams(location.search).has('trials')) return;
  void import('./TrialsPane.tsx').then(({ TrialsPane }) => {
    const host = document.createElement('div');
    host.className = 'tr-host';
    host.style.cssText = 'position:fixed;inset:0;z-index:30;overflow:auto;padding:16px;background:var(--bg);color:var(--text);max-width:560px;margin:0 auto';
    document.body.append(host);
    createRoot(host).render(<TrialsPane />);
  });
}
