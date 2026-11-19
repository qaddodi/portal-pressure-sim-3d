// ?gl: one line per GLSL program the app can use, green or red, with this device's driver log and Copy. Open it once per build on the iPhone, the iPad and the Mac: about twenty
// seconds for a real-GPU answer, no Actions run, no headless browser (docs/atlas-look-plan.md section 8.1, layer 2). It borrows the scene's WebGL context (the app makes two, ever).
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import fibroText from '../ui/tests/fibro/copied/fibro-gl.copied.js?raw';
import { flagOn } from '../ui/debug/flags.ts';
import { cel } from '../scene/api.ts';
import { type Limits, type Row, checkText, runGlCheck } from './gl-check-run.ts';
import { whenRenderer } from './gl-ref.ts';
import { onShaderFailure, shaderFailureLine, shaderFailures } from './shader-fail.ts';

const build = String(import.meta.env.VITE_BUILD ?? 'dev');

function GlCheck() {
  const [res, setRes] = useState<{ limits: Limits; rows: Row[] } | null>(null);
  const [err, setErr] = useState('');
  const [, bump] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    whenRenderer((r) => { runGlCheck(r, cel.scene, cel.rig.camera, fibroText).then((x) => live && setRes(x), (e) => live && setErr(String(e?.message ?? e))); });
    const off = onShaderFailure(() => bump((n) => n + 1));
    return () => { live = false; off(); };
  }, []);
  const text = res ? checkText(res.limits, res.rows, build) + (shaderFailures().length ? `\n\nFAILED IN THE APP: ${shaderFailureLine()}\n${shaderFailures().map((f) => f.log).join('\n---\n')}` : '') : '';
  const bad = res ? res.rows.filter((r) => !r.ok).length : 0;
  const mono = 'ui-monospace,Menlo,monospace';
  return (
    <div style={{ position: 'fixed', left: 8, top: 8, zIndex: 'var(--z-perf)' as unknown as number, maxWidth: 'min(640px,94vw)', maxHeight: '88vh', overflow: 'auto', padding: '10px 12px', borderRadius: 12, background: 'rgba(0,0,0,.84)', color: '#fff', font: `12px/1.4 ${mono}` }}>
      <div style={{ fontWeight: 700 }}>?gl · every shader program on this device</div>
      {err && <div style={{ color: '#ff8a80' }}>{err}</div>}
      {!res && !err && <div>compiling…</div>}
      {res && <>
        <div style={{ opacity: .75 }}>{res.limits.renderer} · {res.limits.version}</div>
        <div style={{ opacity: .75 }}>attributes {res.limits.attributes} · varyings {res.limits.varyings} · uniforms {res.limits.vertexUniforms}/{res.limits.fragmentUniforms} · units {res.limits.textureUnits} · highp {res.limits.highpFragment ? 'yes' : 'NO'}</div>
        <div style={{ margin: '6px 0', fontWeight: 700, color: bad ? '#ff8a80' : '#8de08d' }}>{bad ? `${bad} of ${res.rows.length} programs FAILED` : `all ${res.rows.length} programs link`}</div>
        {res.rows.map((r) => (
          <div key={r.name} style={{ margin: '3px 0' }}>
            <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 5, marginRight: 6, background: r.ok ? (r.warn.length ? '#ffc400' : '#43d36b') : '#ff5252' }} />
            {r.name} <span style={{ opacity: .55 }}>({r.how}, {r.ms} ms)</span>
            {r.warn.length > 0 && <div style={{ color: '#ffd54f', marginLeft: 15 }}>over this device's limits: {r.warn.join('; ')}</div>}
            {r.log && <div style={{ color: '#ff8a80', marginLeft: 15, whiteSpace: 'pre-wrap' }}>{r.log}</div>}
          </div>
        ))}
        {shaderFailures().length > 0 && <div style={{ marginTop: 6, color: '#ff8a80' }}>In the app: {shaderFailureLine()}</div>}
        <button style={{ marginTop: 8, font: `12px ${mono}`, padding: '3px 10px', borderRadius: 6, border: '1px solid #fff6', background: '#fff2', color: '#fff' }}
          onClick={() => { void navigator.clipboard?.writeText(text).then(() => setCopied(true), () => undefined); }}>{copied ? 'Copied' : 'Copy'}</button>
      </>}
    </div>
  );
}

/** ?gl on the address (any copy, live or preview: it only reads the device's compiler). Does nothing without it, and its code is only fetched then. */
export function mountGl(): void {
  if (!flagOn('gl')) return;
  const host = document.createElement('div');
  document.body.append(host);
  createRoot(host).render(<GlCheck />);
}
