// The inspector's state and its named settings, with no DOM and no scene (a Node test loads it): what the panel holds, the camera's named views, the presets for hunting a speck, and the text Copy puts on the clipboard.
import { partDefault, type PartView } from '../../../scene/vessels/debug-view.ts';
import type { JoinsMode, Leave } from '../../../scene/vessels/skin/joins-mode.ts';

export type { Leave };
export interface InspectState {
  /** the junction method (old: the overlapping tubes; mesh: the SMV-SV confluence; mesh2: every junction) */
  joins: JoinsMode;
  /** paint the pixels a skin would drop, in the colour of the reason (`?joins=debug`) */
  drop: boolean;
  /** a skin without its flow marks or its ink, compiled that way (`?joins=nomarks`, `noink`) */
  leave: Leave;
  tube: PartView;
  skin: PartView;
  /** the layers not drawn, and the layers drawn as wireframe, by id (scene.inspectLayers) */
  hidden: string[];
  wired: string[];
  /** the anti-aliasing pass */
  aa: boolean;
  /** the free orbit: the drag turns the figure all the way round, and nothing springs back */
  free: boolean;
  yawDeg: number;
  pitchDeg: number;
}

export const defaultState = (joins: JoinsMode = 'mesh2'): InspectState => ({ joins, drop: false, leave: '', tube: partDefault(), skin: partDefault(), hidden: [], wired: [], aa: true, free: false, yawDeg: 0, pitchDeg: 0 });

/** The camera's named views: the yaw (0 the front, positive swings the camera to the viewer's right) and the tilt above the horizon, in degrees. */
export const VIEWS: readonly { id: string; label: string; yaw: number; pitch: number }[] = [
  { id: 'front', label: 'Front', yaw: 0, pitch: 0 },
  { id: 'back', label: 'Back', yaw: 180, pitch: 0 },
  { id: 'left', label: 'Left', yaw: -90, pitch: 0 },
  { id: 'right', label: 'Right', yaw: 90, pitch: 0 },
  { id: 'top', label: 'Top', yaw: 0, pitch: 88 },
  { id: 'bottom', label: 'Bottom', yaw: 0, pitch: -88 },
];

/** A setting for hunting a speck: it says which part to take away (or show in another way), so the speck either goes or stays. Each returns the state it makes from the one given. */
export interface Preset { id: string; label: string; hint: string; make(s: InspectState): InspectState }
const both = (s: InspectState, patch: Partial<PartView>): InspectState => ({ ...s, tube: { ...s.tube, ...patch }, skin: { ...s.skin, ...patch } });
export const PRESETS: readonly Preset[] = [
  { id: 'marks-off', label: 'No flow marks', hint: 'Dust and chevrons off on tubes and skins (the skins compiled without them): a speck that goes was a mark.', make: (s) => ({ ...both(s, { dust: false, heads: false }), leave: 'marks' }) },
  { id: 'dust-off', label: 'No dust', hint: 'Only the dust off (tubes and skins), the chevrons stay.', make: (s) => both(s, { dust: false }) },
  { id: 'heads-off', label: 'No chevrons', hint: 'Only the chevrons off (tubes and skins), the dust stays.', make: (s) => both(s, { heads: false }) },
  { id: 'ink-off', label: 'No ink', hint: 'The outline off on tubes and skins (the skins compiled without it): a speck that goes was ink.', make: (s) => ({ ...both(s, { ink: false }), leave: 'ink' }) },
  { id: 'flat', label: 'Flat colour', hint: 'No cel bands: the body colour alone. A speck that stays is not the shading.', make: (s) => both(s, { shade: 1 }) },
  { id: 'normals', label: 'Normals', hint: 'The surface normal as colour: a NaN or a flipped normal shows as a black or a hard-edged patch.', make: (s) => both(s, { shade: 2 }) },
  { id: 'who', label: 'Who draws it', hint: 'Every tube its own colour, every skin solid magenta: which pixels are skin and which are tube.', make: (s) => ({ ...s, tube: { ...s.tube, tint: true }, skin: { ...s.skin, colour: '#ff00ff', amount: 0.55 } }) },
  { id: 'drops', label: 'Dropped pixels', hint: 'Skin pixels the shader would drop are painted: red a back face, cyan the presence dither, yellow no alpha, magenta past the ink band.', make: (s) => ({ ...s, drop: true }) },
  { id: 'old', label: 'Old joins', hint: 'The old overlapping tubes with no skins: a speck that stays is not a skin.', make: (s) => ({ ...s, joins: 'old' }) },
];

/** What Copy puts on the clipboard: one line each, so a paste in a thread says exactly what was on (and the other thread can set the same). */
export function stateText(s: InspectState, build = ''): string {
  const part = (p: PartView) => `shade=${p.shade} dust=${+p.dust} heads=${+p.heads} ink=${+p.ink} tint=${+p.tint} colour=${p.colour}@${p.amount}`;
  return [
    `inspector${build ? ` · ${build}` : ''}`,
    `joins=${s.joins} drop=${+s.drop} leave=${s.leave || 'none'} aa=${+s.aa}`,
    `tubes ${part(s.tube)}`,
    `skins ${part(s.skin)}`,
    `hidden=[${s.hidden.join(',')}] wire=[${s.wired.join(',')}]`,
    `camera free=${+s.free} yaw=${s.yawDeg.toFixed(1)} pitch=${s.pitchDeg.toFixed(1)}`,
  ].join('\n');
}

/** An angle in degrees into -180 .. 180. */
export const wrapDeg = (d: number): number => { const m = ((d + 180) % 360 + 360) % 360 - 180; return m === -180 && d > 0 ? 180 : m; };
