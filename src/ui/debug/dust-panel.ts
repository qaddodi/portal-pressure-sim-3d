// ?dust: the hidden tuning panel for the blood's dust (Mohammad, 20 Nov: "the ability to edit it (hidden setting) ... on the real deal"). The Dust Lab's own sliders, selects and colour, on the REAL figure: each move sets the
// dust tuner's target (scene/blood/dust.ts), so the values glide there and nothing snaps; Copy settings puts the settings on the clipboard as the lab's own JSON text; Apply reads pasted text (Copy's, or the lab's, whose
// scenario, vessel and camera keys are skipped); the presets are his two picks and a few of the lab's. "Keep on this device" remembers the settings in this browser for the next ?dust visit (it changes nothing for anyone else).
// It exists only when the page address has ?dust, draws nothing per frame (DOM, written when a control moves) and is not part of any card.
import { flagOn } from './flags.ts';
import { dustTuner } from '../../scene/blood/dust.ts';
import { DUST_COLORS, DUST_NUMERIC, DUST_PRESETS, DUST_SELECTS, dustDefaults, dustText, parseDust, type DustSettings, type Group } from '../../scene/blood/dust-spec.ts';

const KEEP_KEY = 'dust.keep.v1';
const GROUPS: readonly Group[] = ['Particles', 'Lane streaks', 'Colour', 'Flow', 'Lesions'];

/** Settings kept on this device (or null): the saved text, parsed over the defaults. */
export function keptDust(storage: Pick<Storage, 'getItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null): DustSettings | null {
  try { const t = storage?.getItem(KEEP_KEY); return t ? parseDust(t) : null; } catch { return null; }
}

export function mountDust(): void {
  if (!flagOn('dust') || document.getElementById('dust-panel')) return;
  const kept = keptDust();
  if (kept) { dustTuner.replace(kept); dustTuner.snap(); }

  const css = document.createElement('style');
  css.textContent = `
#dust-pill{position:fixed;left:8px;top:8px;z-index:var(--z-perf,100);padding:3px 10px;border-radius:999px;border:1px solid #fff8;background:#445;color:#fff;font:600 11px/18px ui-monospace,Menlo,monospace;pointer-events:auto}
#dust-panel{position:fixed;left:8px;top:36px;z-index:var(--z-perf,100);width:min(380px,94vw);max-height:calc(100vh - 56px);overflow:auto;-webkit-overflow-scrolling:touch;padding:10px 12px;border-radius:12px;background:rgba(14,16,24,.92);color:#fff;font:11px/1.35 ui-monospace,Menlo,monospace;pointer-events:auto;user-select:text;-webkit-user-select:text;display:none}
#dust-panel h4{margin:10px 0 4px;font:700 11px/1.2 ui-monospace,Menlo,monospace;color:#9ec4ff;text-transform:uppercase;letter-spacing:.06em}
#dust-panel .row{display:grid;grid-template-columns:1fr 54px;gap:2px 8px;align-items:center;margin:3px 0}
#dust-panel .row label{grid-column:1/3}
#dust-panel input[type=range]{width:100%;margin:0}
#dust-panel .val{text-align:right;color:#cde}
#dust-panel select,#dust-panel button,#dust-panel textarea{font:11px ui-monospace,Menlo,monospace;color:#fff;background:#fff2;border:1px solid #fff6;border-radius:6px;padding:3px 8px}
#dust-panel select{width:100%;margin:2px 0}
#dust-panel textarea{width:100%;height:120px;box-sizing:border-box;background:#0008;user-select:text;-webkit-user-select:text}
#dust-panel .bar{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
#dust-panel .msg{min-height:14px;color:#ffd58a}`;
  document.head.append(css);

  const pill = document.createElement('button'); pill.id = 'dust-pill'; pill.textContent = 'Dust';
  const box = document.createElement('div'); box.id = 'dust-panel';
  document.body.append(pill, box);
  pill.onclick = () => { box.style.display = box.style.display === 'block' ? 'none' : 'block'; };

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, kids: (Node | string)[] = []): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids); return e; };
  const msg = el('div', { className: 'msg' });
  const json = el('textarea', { spellcheck: false });
  const inputs = new Map<string, () => void>();
  const refreshText = () => { if (document.activeElement !== json) json.value = dustText(dustTuner.settings()); };
  const change = (k: string, v: number | string) => { dustTuner.set({ [k]: v }); preset.value = 'edited'; refreshText(); };

  const preset = el('select');
  preset.append(el('option', { value: 'edited', textContent: 'Edited (custom)', hidden: true }), ...DUST_PRESETS.map(([n], i) => el('option', { value: String(i), textContent: `${i + 1}. ${n}` })));
  preset.onchange = () => {
    const p = DUST_PRESETS[Number(preset.value)];
    if (!p) return;
    dustTuner.replace({ ...dustDefaults(), ...p[1] });
    inputs.forEach((f) => f()); refreshText(); msg.textContent = `${p[0]}: easing in.`;
  };
  box.append(el('div', {}, ['Dust · ', el('span', { className: 'val', textContent: 'values glide, nothing snaps' })]), preset);
  // B-safe: one tap for the test "do the specks depend on the load": half the lanes, one train (the defaults come back with the second tap)
  const full = { lanes: Number(dustDefaults().lanes), trains: Number(dustDefaults().trains) };
  const safe = el('button', { textContent: 'B-safe: half the lanes, one train' });
  let isSafe = false;
  safe.onclick = () => {
    isSafe = !isSafe;
    dustTuner.set(isSafe ? { lanes: Math.max(4, Math.round(full.lanes / 2)), trains: 1 } : { lanes: full.lanes, trains: full.trains });
    safe.textContent = isSafe ? 'B-safe is ON (tap for the full B)' : 'B-safe: half the lanes, one train';
    inputs.forEach((f) => f()); preset.value = 'edited'; refreshText();
  };
  box.append(el('div', { className: 'bar' }, [safe]));

  for (const g of GROUPS) {
    box.append(el('h4', { textContent: g }));
    for (const r of DUST_SELECTS.filter((q) => q[4] === g)) {
      const s = el('select');
      for (const [v, label] of r[2]) s.append(el('option', { value: v, textContent: label }));
      s.value = String(dustTuner.settings()[r[0]]);
      s.onchange = () => change(r[0], s.value);
      inputs.set(r[0], () => { s.value = String(dustTuner.settings()[r[0]]); });
      box.append(el('label', { textContent: r[1] }), s);
    }
    for (const r of DUST_COLORS.filter((q) => q[3] === g)) {
      const c = el('input', { type: 'color', value: String(dustTuner.settings()[r[0]]) });
      c.oninput = () => change(r[0], c.value);
      inputs.set(r[0], () => { c.value = String(dustTuner.settings()[r[0]]); });
      box.append(el('div', { className: 'row' }, [el('label', { textContent: r[1] }), c]));
    }
    for (const r of DUST_NUMERIC.filter((q) => q[6] === g)) {
      const val = el('span', { className: 'val' });
      const inp = el('input', { type: 'range', min: String(r[2]), max: String(r[3]), step: String(r[4]), value: String(dustTuner.settings()[r[0]]) });
      const show = () => { val.textContent = String(Number(Number(dustTuner.settings()[r[0]]).toFixed(3))); };
      inp.oninput = () => { change(r[0], Number(inp.value)); show(); };
      inputs.set(r[0], () => { inp.value = String(dustTuner.settings()[r[0]]); show(); });
      show();
      box.append(el('div', { className: 'row' }, [el('label', { textContent: r[1] }), inp, val]));
    }
  }

  const copy = async (): Promise<void> => {
    const text = dustText(dustTuner.settings());
    json.value = text;
    try { await navigator.clipboard.writeText(text); msg.textContent = 'Copied. Paste it into the thread.'; }
    catch { json.focus(); json.select(); msg.textContent = 'Could not copy by itself: the text is selected, press copy yourself.'; }
  };
  const apply = (): void => {
    try { dustTuner.applyText(json.value); inputs.forEach((f) => f()); preset.value = 'edited'; msg.textContent = 'Applied: easing in.'; }
    catch (e) { msg.textContent = `That is not valid settings text: ${(e as Error).message}`; }
  };
  const bar = el('div', { className: 'bar' }, [
    el('button', { textContent: 'Copy settings', onclick: () => { void copy(); } }),
    el('button', { textContent: 'Apply', onclick: apply }),
    el('button', { textContent: 'Reset', onclick: () => { dustTuner.replace(dustDefaults()); inputs.forEach((f) => f()); preset.value = '0'; refreshText(); msg.textContent = 'Reset to the default.'; } }),
    el('button', { textContent: 'Keep on this device', onclick: () => { try { localStorage.setItem(KEEP_KEY, dustText(dustTuner.settings())); msg.textContent = 'Kept: this browser opens ?dust with these.'; } catch { msg.textContent = 'This browser would not keep it. Use Copy settings.'; } } }),
    el('button', { textContent: 'Forget', onclick: () => { try { localStorage.removeItem(KEEP_KEY); msg.textContent = 'Forgotten.'; } catch { /* storage unavailable */ } } }),
  ]);
  json.onfocus = () => { /* the text is being edited: the panel stops overwriting it */ };
  json.onblur = refreshText;
  box.append(el('h4', { textContent: 'Settings text' }), bar, json, msg);
  refreshText();
  if (!kept) preset.value = '0';
}
