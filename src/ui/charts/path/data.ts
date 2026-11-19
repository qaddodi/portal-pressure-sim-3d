// What the path card reads from the 3D engine, as the 2D app's tool-path.js reads it from its store: the model's liver stiffness, platelets, spleen stiffness and HVPG as the tiles print them
// (path-data.js patientFor), over the slide's own facts. Pure; the card calls them.
import type { DeviceClass } from '../../layout/device.ts';
import type { Fingerprint } from '../fmt.ts';
import { patientOf } from './model.ts';

/** The readings the path algorithms take from the model (tile keys, engine units), from an engine frame's metrics (the same fields the engine's fingerprintOf reads). Null where the frame has none. */
export function pathFingerprint(m: { lsm?: number | null; ssm?: number | null; spleen?: { platelets?: number | null } | null; hvpg?: number | null; whvp?: number | null; fhvp?: number | null } | null | undefined): Fingerprint | null {
  if (!m) return null;
  const hvpg = m.hvpg ?? (Number.isFinite(m.whvp) && Number.isFinite(m.fhvp) ? m.whvp! - m.fhvp! : null);
  return { lsm: m.lsm ?? null, plt: m.spleen?.platelets ?? null, ssm: m.ssm ?? null, hvpg };
}

/** The patient a slide's tool names (tool.patient) with the model's readings over it. */
export const pathPatient = (of: string, patient: Record<string, unknown> | null | undefined, fp?: Fingerprint | null) => patientOf(of, patient, fp);

/** Whether this device draws the small map (2D: the phone layout, a phone or an iPad held upright; a phone held sideways has the wallet column and draws the chart a Mac does). */
export const phoneLayout = (d: DeviceClass) => d === 'phone-portrait' || d === 'tablet-portrait';
