// The two names over the split orbit's figures ("Healthy", "Schistosomiasis"): plain words in the slide's type, no pill, no box. Their opacity eases (CSS), nothing else about them moves.
import { useSplitUi } from './split.ts';

export function SplitLabels() {
  const { on, left, right, lx, rx, y } = useSplitUi();
  const base = { position: 'absolute', top: y + 8, transform: 'translateX(-50%)', opacity: on ? 1 : 0, transition: 'opacity 420ms cubic-bezier(.2, .8, .2, 1)', pointerEvents: 'none', userSelect: 'none', font: '600 13px/1.2 var(--font-ui)', color: 'var(--text)', whiteSpace: 'nowrap' } as const;
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <span style={{ ...base, left: lx }}>{left}</span>
      <span style={{ ...base, left: rx }}>{right}</span>
    </div>
  );
}
