// The app shell. Layers, bottom to top: the stage (3D, one canvas), tags, cards, chrome. Each layer is owned by its own folder:
//   scene/Stage.tsx (scene thread) · ui/tags (deck thread) · ui/cards + wallet (cards thread) · ui/shell + settings (cards thread)
// The shell mounts the pieces in this order and adds nothing of its own, so each thread edits only its folder.
import { Stage } from './scene/Stage.tsx';
import { LabelLayer } from './scene/labels/LabelLayer.tsx';
import { CircuitCaptions } from './scene/circuit/CircuitCaptions.tsx';
import { LobuleCaptions } from './scene/lobule/LobuleCaptions.tsx';
import { SinusoidCaptions } from './scene/sinusoid/SinusoidCaptions.tsx';
import { ProteinLegend } from './scene/sinusoid/ProteinLegend.tsx';
import { Shell } from './ui/shell/Shell.tsx';
import { useEngine } from './engine/index.ts';
import { BuildPill } from './ui/shell/BuildPill.tsx';
import { AppBoundary } from './ui/shell/AppBoundary.tsx';
import { CardBoundary } from './ui/cards/CardBoundary.tsx';
import { useShell } from './ui/shell/store.ts';
import { ContextNote } from './scene/ContextNote.tsx';

export function App() {
  const status = useEngine((s) => s.status);
  const view = useShell((s) => s.view);
  return (
    <>
      {/* two safety nets (P0-1): the figure's own (the shell keeps working), and the overlays' (a caption that throws is dropped, the figure and the controls stay); main.tsx puts the root one around the whole app */}
      <AppBoundary layer="figure"><Stage /></AppBoundary>
      <CardBoundary resetKey={view}>
        <LabelLayer />
        <CircuitCaptions />
        <LobuleCaptions />
        <SinusoidCaptions />
        <ProteinLegend />
      </CardBoundary>
      <ContextNote />
      <Shell />
      {import.meta.env.VITE_CHANNEL === 'preview' && <BuildPill />}
      {status === 'crashed' && <CrashNotice />}
    </>
  );
}

function CrashNotice() {
  const crash = useEngine((s) => s.crash);
  return (
    <div role="alert" style={{ position: 'fixed', inset: 'auto 16px 16px', zIndex: 'var(--z-chrome)' as unknown as number, background: 'var(--surface)', border: '1px solid var(--edge)', borderRadius: 16, padding: 16 }}>
      <strong>The simulation stopped.</strong>
      <div style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 4, whiteSpace: 'pre-wrap' }}>{crash}</div>
      <button style={{ marginTop: 12 }} onClick={() => location.reload()}>Reload</button>
    </div>
  );
}
