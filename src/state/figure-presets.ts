// Figure presets: Cool, Balanced and Rich, three named settings of the ten figure switches (Blur effect, Figure detail, Auto detail, Sharp while moving and the six Figure depth
// switches; review R6, approved by the owner 25 Nov 2026). A preset is nothing stored: it writes the ten switches in one save, and the sheet reads the preset back by comparing them,
// so a phone that sets one switch under More simply reads "Custom". Pure (no DOM), so tests/figure-presets.test.ts runs it in node.
import { DEPTH_KEYS, FIGURE_DETAIL_DEFAULT, onPhone, type Settings } from './settings.ts';

export const PRESET_IDS = ['cool', 'balanced', 'rich'] as const;
export type PresetId = (typeof PRESET_IDS)[number];

/** The ten switches a preset sets. Look, Keyboard shortcuts and Diagnostics are not the figure's and a preset leaves them alone. */
export const PRESET_KEYS = ['blur', 'figureDetail', 'autoDetail', 'sharpMoving', ...DEPTH_KEYS] as const;
export type PresetKey = (typeof PRESET_KEYS)[number];
export type PresetValues = Pick<Settings, PresetKey>;

const SOFT = 0, SHARP = 2;   // (indexes into FIGURE_DETAIL: Soft 1x, Standard 1.5x, Sharp 2x)

/**
 * Cool: the low-cost end, for a phone, an old laptop or a long talk. Everything that asks the GPU for more than the flat figure is off: the soft 1x picture that stays 1x in a gesture, no frosted glass,
 *   no blood streaks, no soft light on the organs, no tilt, no depth of field, no living fluid, no device shadows. Auto detail stays on, so it can still soften further on a slow device.
 * Balanced: what the app starts with (a phone starts with the blood streaks off, as `parseSettings` has it, so Balanced is that on a phone too).
 * Rich: every effect on at the sharpest picture, held there (Auto detail off): for a Mac that has the room.
 */
export function presetValues(id: PresetId, phone: boolean = onPhone()): PresetValues {
  switch (id) {
    case 'cool': return { blur: false, figureDetail: SOFT, autoDetail: true, sharpMoving: false, organDepth: false, tilt: false, dof: false, particles: false, fluidSurface: false, deviceShadow: false };
    case 'balanced': return { blur: true, figureDetail: FIGURE_DETAIL_DEFAULT, autoDetail: true, sharpMoving: true, organDepth: true, tilt: true, dof: true, particles: !phone, fluidSurface: true, deviceShadow: true };
    case 'rich': return { blur: true, figureDetail: SHARP, autoDetail: false, sharpMoving: true, organDepth: true, tilt: true, dof: true, particles: true, fluidSurface: true, deviceShadow: true };
  }
}

/** The preset these settings are exactly, or null when the switches are a mix of the owner's own ("Custom"). */
export function presetOf(s: Pick<Settings, PresetKey>, phone: boolean = onPhone()): PresetId | null {
  return PRESET_IDS.find((id) => { const v = presetValues(id, phone); return PRESET_KEYS.every((k) => s[k] === v[k]); }) ?? null;
}
