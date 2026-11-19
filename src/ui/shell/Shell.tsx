// The UI layer above the stage. The cards thread replaces this file's body: top bar, look picker, cards, wallet.
// Until then it shows the engine's headline numbers so the hookup can be seen working on a device.
import { useEngine } from '../../engine/index.ts';
import { useSettings } from '../../state/settings.ts';
import { LOOK_IDS, LOOK_LABELS, type LookChoice } from '../../looks/looks.ts';

const fmt = (n: number | null) => (n == null ? '–' : n.toFixed(1));

export function Shell() {
  const { hvpg, whvp, fhvp, status } = useEngine();
  const { look, setLook } = useSettings();
  const choices: LookChoice[] = [...LOOK_IDS, 'system'];
  return (
    <div style={{ position: 'fixed', left: 'max(16px, var(--safe-l))', top: 'max(16px, var(--safe-t))', zIndex: 'var(--z-chrome)' as unknown as number, background: 'var(--surface)', border: '1px solid var(--edge)', borderRadius: 16, padding: '16px 20px', maxWidth: 340 }}>
      <div style={{ font: '600 11px var(--ui)', letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--text-2)' }}>Engine hookup · {status}</div>
      <div style={{ font: '600 26px/1.18 var(--display)', margin: '6px 0 2px' }}>HVPG {fmt(hvpg)} mmHg</div>
      <div style={{ color: 'var(--text-2)', fontSize: 13 }}>WHVP {fmt(whvp)} · FHVP {fmt(fhvp)} · cirrhosis with CSPH</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        {choices.map((c) => (
          <button key={c} onClick={() => setLook(c)} aria-pressed={look === c}
            style={{ background: look === c ? 'var(--accent)' : 'transparent', color: look === c ? 'var(--surface)' : 'var(--text)', border: '1px solid var(--edge)', borderRadius: 999, padding: '4px 12px', fontSize: 13 }}>
            {LOOK_LABELS[c]}
          </button>
        ))}
      </div>
    </div>
  );
}
