import { useState } from 'react';
import { LOOK_IDS, LOOK_LABELS, LOOKS, lookVars, type LookId } from '../../../looks/looks.ts';
import type { DeviceClass } from '../../layout/device.ts';
import { Chart, ChartEnv } from '../Chart.tsx';
import { CHARTS, chartScore } from '../registry.ts';
import '../charts.css';

const WIDTHS: { id: string; label: string; w: number; device: DeviceClass }[] = [
  { id: 'phone', label: 'iPhone', w: 300, device: 'phone-portrait' },
  { id: 'side', label: 'iPhone sideways', w: 330, device: 'phone-landscape' },
  { id: 'mac', label: 'Mac', w: 360, device: 'desktop' },
  { id: 'ipad', label: 'iPad', w: 430, device: 'tablet-portrait' },
];

/** ?charts: every ported chart as a specimen, at the card widths of the four devices, in the look you pick. */
export function ChartsGallery() {
  const [look, setLook] = useState<LookId>(() => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const L = LOOKS[look], score = chartScore();
  const vars = lookVars(look) as React.CSSProperties;
  return (
    <div style={{ ...vars, position: 'fixed', inset: 0, overflow: 'auto', background: L.bg, color: L.text, font: '14px/1.4 var(--ui, system-ui)', padding: '16px', zIndex: 9999 }}>
      <h1 style={{ font: '600 20px/1.2 var(--ui, system-ui)', margin: '0 0 4px' }}>Charts</h1>
      <p style={{ margin: '0 0 12px', color: L.text2 }}>{score.done} of {score.of} charts ported. Each specimen is drawn on the GPU at the width of a card on that device.</p>
      <div role="tablist" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0 0 18px' }}>
        {LOOK_IDS.map((id) => (
          <button key={id} role="tab" aria-selected={id === look} onClick={() => setLook(id)}
            style={{ font: '600 13px var(--ui, system-ui)', padding: '6px 12px', borderRadius: 999, border: `1px solid ${L.edge}`, background: id === look ? L.accent : 'transparent', color: id === look ? L.card : L.text }}>{LOOK_LABELS[id]}</button>
        ))}
      </div>
      {CHARTS.filter((c) => c.status === 'done').map((c) => (
        <section key={c.kind} style={{ margin: '0 0 28px' }}>
          <h2 style={{ font: '600 16px/1.3 var(--ui, system-ui)', margin: '0 0 2px' }}>{c.kind}</h2>
          <p style={{ margin: '0 0 10px', color: L.text2 }}>{c.what}{c.slides ? ` · ${c.slides} slides in the 2D decks` : ''}</p>
          {c.specimens.map((s) => (
            <div key={s.id} style={{ margin: '0 0 16px' }}>
              <div style={{ color: L.text3, margin: '0 0 6px' }}>{s.label}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
                {WIDTHS.map((w) => (
                  <div key={w.id} style={{ width: w.w + 28 }}>
                    <div style={{ color: L.text3, font: '500 12px var(--ui, system-ui)', margin: '0 0 4px' }}>{w.label}, {w.w} px</div>
                    <div style={{ background: L.card, border: `1px solid ${L.edge}`, borderRadius: 14, padding: 14 }}>
                      <ChartEnv.Provider value={{ look, device: w.device }}>
                        <div style={{ width: w.w }}><Chart tag={`chart:gallery:${c.kind}`} deps={[look]} label={s.label} build={s.build} /></div>
                      </ChartEnv.Provider>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
      <section>
        <h2 style={{ font: '600 16px/1.3 var(--ui, system-ui)', margin: '0 0 6px' }}>Still to port</h2>
        <p style={{ margin: 0, color: L.text2 }}>{CHARTS.filter((c) => c.status !== 'done').map((c) => c.kind).join(', ') || 'None'}</p>
      </section>
    </div>
  );
}
