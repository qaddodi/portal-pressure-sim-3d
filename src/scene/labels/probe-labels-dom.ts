// The Tests devices' readings on the figure, written to the label layer's DOM (probe-labels.ts decides, this writes): the FibroScan probe's screen number. Built once;
// each frame writes transform and opacity only (a number's words are written when they change, as the station labels' are, never in a frame of motion).
import { DOP_LINE_PX, DOP_RIM_STROKE_PX, probeLabel, scanText, scanTransform, strokeTransform } from './probe-labels.ts';

/** How long a reading takes to leave or come back with the picture's settling (ms). */
export const READ_FADE_MS = 240;
export interface ProbeLabelsDom { /** `settled`: the body stands still (no dive); `dt`: the frame's ms. The readings ease out when it does not and back when it does. */ paint(settled?: boolean, dt?: number): void; destroy(): void }

export function buildProbeLabels(root: HTMLElement): ProbeLabelsDom {
  const mk = (tag: string, cls: string, parent: HTMLElement): HTMLElement => { const e = document.createElement(tag); e.className = cls; parent.appendChild(e); return e; };
  // the FibroScan probe's screen: "5.0 kPa"
  const scan = mk('div', 'pl pl-scan', root), sv = mk('span', 'pl-scan-val', scan), su = mk('span', 'pl-scan-unit', scan);
  su.textContent = 'kPa';
  let sTx = '', sOp = '', sTxt = '';
  // the Doppler's marks: four strokes, each a black rim under a white line, thin and over the figure (the beam is the figure's, 3D)
  const strokes = [0, 1, 2, 3].map((i) => {
    const rim = mk('i', 'pl pl-dl pl-dl-rim', root), line = mk('i', 'pl pl-dl pl-dl-line', root);
    rim.style.setProperty('--w', `${DOP_RIM_STROKE_PX[i]}px`); line.style.setProperty('--w', `${DOP_LINE_PX[i]}px`);
    return { rim, line, tx: '', op: '' };
  });

  let gate = 1;
  const show = (el: HTMLElement, on: boolean): void => { if (on) el.setAttribute('data-on', ''); else el.removeAttribute('data-on'); };

  return {
    paint(settled = true, dt = 16): void {
      gate = Math.min(1, Math.max(0, gate + (settled ? dt : -dt) / READ_FADE_MS));
      // ── the probe's screen ──
      const s = probeLabel.scan, sa = s.on ? s.alpha * gate : 0;
      if (sa > 0.002) {
        const t = scanText(s.k);
        if (t !== sTxt) { sTxt = t; sv.textContent = t; }
        const tx = scanTransform(s.x, s.y, s.turn);
        if (tx !== sTx) { sTx = tx; scan.style.transform = tx; }
        show(scan, true);
      } else show(scan, false);
      // ── the Doppler's marks ──
      const d = probeLabel.dop, da = d.on ? d.alpha * gate : 0;
      strokes.forEach((st, i) => {
        const a = da > 0.002 && !(d.shut && i !== 0) ? da : 0, L = d.lines;
        if (a > 0) { const tx = strokeTransform(L[i * 4]!, L[i * 4 + 1]!, L[i * 4 + 2]!, L[i * 4 + 3]!); if (tx !== st.tx) { st.tx = tx; st.rim.style.transform = tx; st.line.style.transform = tx; } }
        const o = String(Math.round(a * 1000) / 1000);
        if (o !== st.op) { st.op = o; st.rim.style.opacity = o; st.line.style.opacity = o; }
        show(st.rim, a > 0); show(st.line, a > 0);
      });
      const so = String(Math.round(sa * 1000) / 1000);
      if (so !== sOp) { sOp = so; scan.style.opacity = so; }

    },
    destroy(): void { scan.remove(); for (const st of strokes) { st.rim.remove(); st.line.remove(); } },
  };
}
