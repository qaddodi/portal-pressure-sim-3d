// The app shell. Layers, bottom to top: the stage (3D, one canvas), tags, cards, chrome. Each layer is owned by its own folder:
//   scene/Stage.tsx (scene thread) · ui/tags (deck thread) · ui/cards + wallet (cards thread) · ui/shell + settings (cards thread)
// The shell mounts the pieces in this order and adds nothing of its own, so each thread edits only its folder.
import { Stage } from './scene/Stage.tsx';
import { Shell } from './ui/shell/Shell.tsx';
import { useEngine } from './engine/index.ts';
import { BuildPill } from './ui/shell/BuildPill.tsx';

export function App() {
  const status = useEngine((s) => s.status);
  return (
    <>
      <Stage />
      <Shell />
      <BuildPill />
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
