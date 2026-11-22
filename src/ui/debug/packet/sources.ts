// What the page can say for a bug packet (the 2D app's packet/sources.js): the screen report with its findings, the recorder's last seconds with the motion rules run over
// them, the state link, the device and the build. Everything is optional: a build without the recorder still makes a packet, and the packet says what it lacks.
// Runs on a tap, never in a frame.
import { buildPacket } from '../core/packet.copied.js';
import { appSnapshot } from '../screen/app.ts';
import { collectDom } from '../screen/raw.ts';
import { buildScreen, screenText } from '../screen/build.ts';
import { recorder } from '../watch/mount.ts';
import { captureState, stateLink, baseOf, diffParams, type PacketState } from './state.ts';
import { presetBase, currentParams } from '../../action/params.ts';
import { caughtCount } from '../caught.ts';
import { recentFaults } from '../../../boot/crash-net.ts';
import { useShell } from '../../shell/store.ts';
import { useSettings } from '../../../state/settings.ts';
import { readerList } from '../core/registry.copied.js';
import { buildLabel } from '../../shell/build-pill.ts';
import { intentLog } from '../../../scene/intent-log.ts';
import { shaderFailures } from '../../../debug/shader-fail.ts';

/** The sliders: what was changed from the loaded patient's own settings (a difference, never the whole tree), or null for none or when no patient base is known. */
export function paramsDelta(): Record<string, unknown> | null {
  const base = presetBase(), now = currentParams();
  return base && now ? diffParams(base, now) : null;
}

/** The state of the app as it is now: the patient, the talk and slide, the look, the figure's switches, the camera, the picked vessel and the sliders. */
export function stateNow(app = appSnapshot()): PacketState {
  const sh = useShell.getState();
  return captureState(app, { figure: { ...sh.figure } as Record<string, unknown>, labels: sh.figure.labelLevel, running: sh.transport.running, speed: sh.transport.speed, params: paramsDelta() });
}

/** The screen report as it is now, with the self-check findings (the state rules; the motion rules when the recorder holds a history). */
export function screenNow(detail: 'summary' | 'full' = 'summary'): Record<string, any> {
  const rec = recorder();
  const history = rec ? Object.assign(rec.samples(), { events: rec.events() }) : undefined;
  return buildScreen({ app: appSnapshot(), dom: collectDom(), detail, history });
}
export { screenText, readerList };

export function buildInfo(): { release: string; badge: string; commit: string } {
  const build = String(import.meta.env.VITE_BUILD ?? 'dev');
  const label = buildLabel(import.meta.env.VITE_BUILD as string | undefined);
  const badge = document.getElementById('preview-badge')?.textContent?.replace(/\s+/g, ' ').trim() || (label ? `PREVIEW · ${label}` : 'Live site');
  return { release: build, badge, commit: /^[0-9a-f]{7,40}$/.test(build) ? build : (label.match(/[0-9a-f]{7,40}/)?.[0] ?? '') };
}

export function deviceInfo(): Record<string, unknown> {
  const app = appSnapshot();
  return { ua: navigator.userAgent, screen: `${innerWidth}x${innerHeight}`, dpr: devicePixelRatio || 1, renderer: app.memory.renderer ?? '', quality: String(useSettings.getState().figureDetail), look: app.look };
}

/**
 * The packet for the screen as it is now. note: what the person wrote. Never throws: a part that cannot be made is named in the packet's `missing` or in a finding.
 */
export async function packetNow({ note = '' }: { note?: string } = {}): Promise<Record<string, any>> {
  const app = appSnapshot();
  const state = stateNow(app);
  const log = intentLog();
  if (log.length) state.log = log;   // (the last 60 s of what asked the figure to change: `npm run debug -- packet replay`)
  const link = stateLink(state, baseOf(location));
  let screen: Record<string, any> | null = null, text = '', findings: unknown[] | null = null, history: unknown = null, watchFindings: unknown[] = [];
  const rec = recorder();
  if (rec) {
    try { history = rec.exportHistory(10); } catch { /* the recorder is off */ }
    try { watchFindings = rec.findings().map((f) => ({ rule: f.rule, what: f.what, where: f.where, why: f.why, owner: f.owner, at: f.at, scope: 'motion' })); } catch { /* ditto */ }
  }
  try {
    const full = screenNow('summary');
    text = screenText(full);
    const { findings: f, ...rest } = full;
    findings = (f as unknown[]) ?? [];
    screen = rest;
  } catch (e) {
    text = `(the screen report failed: ${(e as Error)?.message ?? e})`;
    findings = [{ rule: 'screen-failed', what: 'The screen report could not be made', where: String((e as Error)?.message ?? e) }];
  }
  // a program this device's driver refused is the first thing a bug packet says: the parts that wore it are drawn plain (src/debug/shader-guard.ts)
  const refused = shaderFailures().map((f) => ({ rule: 'shader-failed', what: `A ${f.kind} shader was refused by this device's driver (${f.meshes} part${f.meshes === 1 ? '' : 's'} drawn plain)`, where: f.log.replace(/\s+/g, ' ').slice(0, 400), why: 'A GPU refuses a program no node test compiles; open ?gl for every program', owner: 'src/debug/shader-guard.ts', scope: 'gpu' }));
  if (refused.length) findings = [...refused, ...(findings ?? [])];
  // the errors the page kept (handlers, timers, promises, a clock system, a boundary's catch: boot/crash-net.ts) go in the report as findings, so Send feedback carries them
  const faults = recentFaults().slice(-5).map((f) => ({ rule: 'uncaught-error', what: `${f.site}: ${f.message}`, where: f.stack }));
  if (faults.length) findings = [...(findings ?? []), ...faults];
  const mem = app.memory;
  return buildPacket({ state, link, screen, screenText: text, history, findings, watchFindings, device: deviceInfo(), build: buildInfo(), health: { errors: caughtCount(), ...(mem.gpuMB != null ? { gpuMB: Math.round(mem.gpuMB) } : {}) } }, { note });
}
