// The debug page's benches (the 2D gallery/benches): small measurements that answer one question each and print a table to copy. Each returns text; none runs per frame.
import { contrastTable } from '../contrast.ts';
import { collectCards } from '../screen/raw.ts';
import { appSnapshot } from '../screen/app.ts';
import { recorder, mountWatch } from '../watch/mount.ts';
import { useSettings } from '../../../state/settings.ts';
import { UI } from '../../strings.generated.ts';
import { liveCatalog, openEntry, settle, sleep, memoryMB, setLook } from './live.ts';
import { LOOK_IDS } from '../../../looks/looks.ts';

export interface Bench { id: string; label: string; about: string; run(log: (t: string) => void): Promise<string> }
const pad = (v: unknown, n: number) => String(v).padEnd(n);

export const BENCHES: Bench[] = [
  { id: 'looks', label: 'Looks table', about: 'Contrast of every look\'s text and signal colours on its card and ground (4.5:1 text, 3:1 marks).', run: async () => {
    const rows = contrastTable();
    return ['look   pair                      ratio  need  ok', ...rows.map((r) => `${pad(r.look, 6)} ${pad(`${r.fg} on ${r.on}`, 25)} ${pad(r.ratio, 6)} ${pad(r.need, 5)} ${r.ok ? 'yes' : 'NO'}`), `${rows.filter((r) => !r.ok).length} of ${rows.length} fail`].join('\n');
  } },
  { id: 'words', label: 'Words dump', about: 'Every line of words on the cards showing now, with its size and role, for reading the text in one place.', run: async () => {
    const cards = collectCards(document, window);
    return cards.length ? cards.map((c) => `## ${c.id} (${Math.round(c.w)}x${Math.round(c.h)} at ${Math.round(c.x)},${Math.round(c.y)})\n${c.texts.map((t) => `${pad(t.role, 6)} ${pad(`${t.px}px`, 7)} ${t.text}`).join('\n')}`).join('\n\n') : 'No card is showing. Open a slide or a sheet first.';
  } },
  { id: 'camera', label: 'Camera moves', about: 'Flies view to view and judges each move with the motion rules (one straight move, no stop part way, no turning back).', run: async (log) => {
    const rec = recorder() ?? mountWatch({ dot: false });
    rec.clear();
    const cat = liveCatalog().filter((e) => e.section === 'view');
    const out: string[] = [];
    for (const id of ['view:lobule', 'view:sinusoid', 'view:anatomic', 'view:sinusoid', 'view:anatomic']) {
      const e = cat.find((x) => x.id === id); if (!e) continue;
      log(`to ${e.label}`);
      await openEntry(e); await sleep(200); const s = await settle({ timeoutMs: 15000, quietMs: 400 });
      out.push(`${pad(`to ${e.label}`, 20)} ${s.settled ? 'settled' : 'NOT settled'} in ${s.ms} ms`);
    }
    const f = rec.findings().filter((x) => x.rule === 'camera-straight' || x.rule === 'flash' || x.rule === 'label-slide');
    return [...out, '', f.length ? f.map((x) => `[${x.rule}] ${x.what}: ${x.where} (${x.at})`).join('\n') : 'No camera, flash or label finding in these moves.'].join('\n');
  } },
  { id: 'memory', label: 'Memory loop', about: 'Opens a talk and leaves it ten times and prints the memory estimate after each, so a leak shows as a climb.', run: async (log) => {
    const cat = liveCatalog(), a = cat.find((e) => e.section === 'slide'), b = cat.find((e) => e.section === 'view');
    if (!a || !b) return 'No talk to loop on in this build.';
    const rows: string[] = ['loop  gpu MB  heap MB'];
    for (let i = 1; i <= 10; i++) {
      log(`loop ${i} of 10`);
      await openEntry(a); await settle({ timeoutMs: 20000 }); await openEntry(b); await settle({ timeoutMs: 20000 });
      const m = appSnapshot().memory; rows.push(`${pad(i, 5)} ${pad(m.gpuMB ?? '-', 7)} ${m.heapMB ?? '-'}`);
    }
    return rows.join('\n');
  } },
  { id: 'looks-walk', label: 'Looks walk', about: 'Switches through the five looks with this screen open and prints each look\'s self-check findings.', run: async (log) => {
    const { screenNow } = await import('../packet/sources.ts');
    const rows: string[] = [], was = useSettings.getState().look;
    for (const l of LOOK_IDS) { log(l); setLook(l); await sleep(300); await settle({ timeoutMs: 8000, quietMs: 300 }); const f = screenNow().findings as { rule: string; what: string }[]; rows.push(`${pad(l, 6)} ${f.length ? f.map((x) => `[${x.rule}] ${x.what}`).join('; ') : 'clean'}`); }
    setLook(was);
    return rows.join('\n');
  } },
  { id: 'model', label: 'Model table', about: 'Loads each preset and prints its pressures after a second, as the engine gives them.', run: async (log) => {
    const rows: string[] = ['patient                       HVPG  WHVP  FHVP  PV    IVC   RA'];
    for (const p of UI.presets.slice(0, 8)) {
      log(p.label);
      await openEntry({ id: `patient:${p.id}`, section: 'patient', label: p.label, group: p.group });
      await sleep(1200);
      const r = appSnapshot().readings, f = (v: number | null) => pad(v == null ? '-' : Math.round(v * 10) / 10, 5);
      rows.push(`${pad(p.label.slice(0, 28), 29)} ${f(r.hvpg!)} ${f(r.whvp!)} ${f(r.fhvp!)} ${f(r.pv!)} ${f(r.ivc!)} ${f(r.ra!)}`);
    }
    return rows.join('\n');
  } },
  { id: 'switches', label: 'Diagnostics switches', about: 'Frame rate and frame breakdown on the screen (Settings rows), toggled here.', run: async () => {
    const s = useSettings.getState(); s.set('showFps', !s.showFps); s.set('showBreakdown', !s.showBreakdown);
    const n = useSettings.getState();
    return `Show frame rate: ${n.showFps ? 'on' : 'off'}\nShow frame breakdown: ${n.showBreakdown ? 'on' : 'off'}\nGPU memory estimate now: ${memoryMB() ?? 'unknown'} MB`;
  } },
];
