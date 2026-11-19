// ?charts: the charts gallery (see ChartsGallery.tsx). One line in main.tsx calls mountCharts(); it does nothing without ?charts in the address,
// and the gallery's code is only fetched then.
import { createRoot } from 'react-dom/client';

export function mountCharts(): void {
  if (!new URLSearchParams(location.search).has('charts')) return;
  void import('./ChartsGallery.tsx').then(({ ChartsGallery }) => {
    const host = document.createElement('div');
    document.body.append(host);
    createRoot(host).render(<ChartsGallery />);
  });
}
