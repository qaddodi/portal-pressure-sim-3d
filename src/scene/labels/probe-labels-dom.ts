// The Tests devices' readings on the figure, written to the label layer's DOM (probe-labels.ts decides, this writes): the FibroScan probe's screen number. Built once;
// each frame writes transform and opacity only (a number's words are written when they change, as the station labels' are, never in a frame of motion).
import { probeLabel, scanText, scanTransform } from './probe-labels.ts';

export interface ProbeLabelsDom { paint(): void; destroy(): void }

export function buildProbeLabels(root: HTMLElement): ProbeLabelsDom {
  const mk = (tag: string, cls: string, parent: HTMLElement): HTMLElement => { const e = document.createElement(tag); e.className = cls; parent.appendChild(e); return e; };
  // the FibroScan probe's screen: "5.0 kPa"
  const scan = mk('div', 'pl pl-scan', root), sv = mk('span', 'pl-scan-val', scan), su = mk('span', 'pl-scan-unit', scan);
  su.textContent = 'kPa';
  let sTx = '', sOp = '', sTxt = '';

  const show = (el: HTMLElement, on: boolean): void => { if (on) el.setAttribute('data-on', ''); else el.removeAttribute('data-on'); };

  return {
    paint(): void {
      // ── the probe's screen ──
      const s = probeLabel.scan, sa = s.on ? s.alpha : 0;
      if (sa > 0.002) {
        const t = scanText(s.k);
        if (t !== sTxt) { sTxt = t; sv.textContent = t; }
        const tx = scanTransform(s.x, s.y, s.turn);
        if (tx !== sTx) { sTx = tx; scan.style.transform = tx; }
        show(scan, true);
      } else show(scan, false);
      const so = String(Math.round(sa * 1000) / 1000);
      if (so !== sOp) { sOp = so; scan.style.opacity = so; }

    },
    destroy(): void { scan.remove(); },
  };
}
