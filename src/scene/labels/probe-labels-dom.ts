// The Tests devices' readings on the figure, written to the label layer's DOM (probe-labels.ts decides, this writes): the FibroScan probe's screen number and the Doppler gate's callout. Built once;
// each frame writes transform and opacity only (a number's words are written when they change, as the station labels' are, never in a frame of motion).
import { clock } from '../../clock/frame.ts';
import { probeLabel, scanText, scanTransform, dopCalloutAt, type DopPick } from './probe-labels.ts';
import { probeCards } from '../devices/probes/cards.ts';
import { probeAvoid } from './probe-boxes.ts';
import { useUi } from '../../ui/ui-store.ts';
import { BAR } from '../../ui/layout/plan.ts';
import type { Box } from '../devices/probes/screen.ts';

const px = (n: number): number => Math.round(n * 100) / 100;

export interface ProbeLabelsDom { paint(): void; destroy(): void }

export function buildProbeLabels(root: HTMLElement): ProbeLabelsDom {
  const mk = (tag: string, cls: string, parent: HTMLElement): HTMLElement => { const e = document.createElement(tag); e.className = cls; parent.appendChild(e); return e; };
  // the FibroScan probe's screen: "5.0 kPa"
  const scan = mk('div', 'pl pl-scan', root), sv = mk('span', 'pl-scan-val', scan), su = mk('span', 'pl-scan-unit', scan);
  su.textContent = 'kPa';
  // the Doppler gate's callout: the vessel's name, its velocity and the unit
  const dop = mk('div', 'pl pl-dop', root), dn = mk('span', 'pl-dop-name', dop), dv = mk('span', 'pl-dop-val', dop), du = mk('span', 'pl-dop-unit', dop);
  du.textContent = 'cm/s';
  let sTx = '', sOp = '', sTxt = '', dTx = '', dOp = '', dName = '', dVal = '', dNone = false, dW = 0, dH = 0, keep = -1;
  const pick: DopPick = { x: 0, y: 0, slot: 0, clear: true };
  const view: Box = { x0: 0, y0: 0, x1: 0, y1: 0 };

  // the callout's size, told by the browser when its words change (never read in a frame)
  const ro = new ResizeObserver((es) => { for (const e of es) if (e.target === dop) { dW = (e.target as HTMLElement).offsetWidth; dH = (e.target as HTMLElement).offsetHeight; clock.invalidate('probe-labels'); } });
  ro.observe(dop);

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

      // ── the Doppler gate's callout ──
      const d = probeLabel.dop, da = d.on && !d.waiting ? d.alpha : 0;
      if (da > 0.002) {
        const val = d.none ? 'No flow' : d.vel;
        if (d.name !== dName) { dName = d.name; dn.textContent = d.name; }
        if (val !== dVal || d.none !== dNone) { dVal = val; dNone = d.none; dv.textContent = val; if (d.none) dop.setAttribute('data-none', ''); else dop.removeAttribute('data-none'); }
        if (!dW) return;   // (its size comes from the observer below, once its words are in: the callout waits, invisible, for it)
        const u = useUi.getState().vp;
        view.x0 = u.safe.left + 4; view.y0 = u.safe.top + BAR + 4; view.x1 = u.w - u.safe.right - 4; view.y1 = u.h - u.safe.bottom - 4;
        dopCalloutAt({ x: d.gx, y: d.gy }, d.ang, dW, dH, view, probeCards(), d.body, probeAvoid(), keep, pick);
        keep = pick.clear ? pick.slot : -1;
        const tx = `translate3d(${px(pick.x)}px,${px(pick.y)}px,0)`;
        if (tx !== dTx) { dTx = tx; dop.style.transform = tx; }
        show(dop, true);
      } else { show(dop, false); keep = -1; }
      const dOpS = String(Math.round(da * 1000) / 1000);
      if (dOpS !== dOp) { dOp = dOpS; dop.style.opacity = dOpS; }
    },
    destroy(): void { ro.disconnect(); scan.remove(); dop.remove(); },
  };
}
