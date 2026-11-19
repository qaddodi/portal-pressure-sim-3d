// The app's side of the look board (WP11): an address with `capture` (preview copy or a local run only) makes the page apply one look-board state in place and hand out its canvas.
//   ?capture&look=dark&preset=cirr-decomp&view=circuit&chevrons=0&orbit=25
// `window.__look.apply(state)` moves the page to another state without reloading (the board visits a device's states one after another that way); `capture()` reads the canvas in the
// frame that draws it (look-hook.ts) and returns a PNG. The look, the figure's switches and the patient are set in memory only: nothing here writes the viewer's own settings.
import { useSettings } from '../state/settings.ts';
import { useShell } from '../ui/shell/store.ts';
import { useEngine } from '../engine/index.ts';
import { clock } from '../clock/frame.ts';
import { cel } from '../scene/api.ts';
import { parseState, type LookState } from './look-states.ts';
import { lookCapture } from './look-hook.ts';

export interface CaptureInfo { settled: boolean; ms: number; w: number; h: number; look: string; view: string; preset: string; build: string }
export interface LookApi { apply(s: Partial<LookState> & { chevrons?: boolean }): Promise<{ settled: boolean; ms: number }>; capture(): Promise<{ blob: Blob; info: CaptureInfo }>; ready: Promise<{ settled: boolean; ms: number }> }

const sleep = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
async function until(test: () => boolean, ms: number): Promise<boolean> { const t0 = performance.now(); while (!test()) { if (performance.now() - t0 > ms) return false; await sleep(50); } return true; }

/** The look and the figure's switches, set before the first paint (held in memory only: the viewer's own saved settings are not touched). */
export function applyBefore(search: string): void {
  const st = parseState(search);
  if (!st) return;
  if (st.look) useSettings.setState({ look: st.look as never, lookChosen: true });
  const f = useShell.getState().figure;
  if (!st.chevrons) useShell.setState({ figure: { ...f, chevrons: false, keyChevrons: false } });
}

let cur: { preset?: string; view?: string; look?: string; orbit: number } = { orbit: 0 };

async function apply(s: Partial<LookState> & { chevrons?: boolean }) {
  const { settle } = await import('../ui/debug/page/live.ts');
  const { loadPatient } = await import('../ui/patients/index.ts');
  const { goToView } = await import('../ui/shell/view-actions.ts');
  const { play } = await import('../ui/shell/transport.ts');
  if (s.look && s.look !== cur.look) { useSettings.setState({ look: s.look as never, lookChosen: true }); cur.look = s.look; }
  if (s.chevrons !== undefined) { const f = useShell.getState().figure; useShell.setState({ figure: { ...f, chevrons: s.chevrons, keyChevrons: false } }); }
  await until(() => useEngine.getState().status === 'ready' && useEngine.getState().frames > 0, 60000);
  if (s.preset && s.preset !== useEngine.getState().presetId) {
    const f0 = useEngine.getState().frames;
    await loadPatient(s.preset); cur.preset = s.preset;
    await until(() => useEngine.getState().frames >= f0 + 3, 15000);   // (the new patient's own frames reach the figure before the model is paused)
  }
  play(false);   // the model stands still, so two captures of one state are the same picture
  await sleep(250);
  if (s.view && s.view !== useShell.getState().view) { cur.view = s.view; goToView(s.view); }
  const turn = s.orbit ?? 0;
  if (turn !== cur.orbit || turn) { cur.orbit = turn; if (cel.rig.setOrbit((turn * Math.PI) / 180)) clock.invalidate('look-orbit'); }
  clock.invalidate('look-apply');
  await sleep(300);
  return settle({ timeoutMs: 30000, quietMs: 900 });
}

function capture(): Promise<{ blob: Blob; info: CaptureInfo }> {
  return new Promise((ok, no) => {
    const give = window.setTimeout(() => { no(new Error('no frame was drawn to read')); }, 8000);
    lookCapture.ask((canvas) => {
      canvas.toBlob((blob) => {
        window.clearTimeout(give);
        if (!blob) { no(new Error('the canvas gave no picture')); return; }
        ok({ blob, info: { settled: true, ms: 0, w: canvas.width, h: canvas.height, look: document.documentElement.dataset.look ?? '', view: useShell.getState().view, preset: useEngine.getState().presetId ?? '', build: String(import.meta.env.VITE_BUILD ?? 'dev') } });
      }, 'image/png');
    });
    clock.invalidate('look-capture');
  });
}

/** Mount `window.__look` and apply the address's own state. */
export function mountLookCapture(search: string): void {
  const st = parseState(search);
  if (!st) return;
  const ready = apply(st);
  (window as unknown as { __look: LookApi }).__look = { apply, capture, ready };
}
