// The "Figure depth (3D only)" rows of Settings: the five steps beyond 2D the owner approved on 19 Nov 2026 ("Yes do all properly"), each behind its own switch so the figure can be
// compared with 2D. Words are short and plain; 2D has no such rows (they are not in the parity table).
import type { DepthKey } from '../../state/settings.ts';

export interface DepthRow { key: DepthKey; label: string; hint: string; icon: string }
/** The Blood menu's own row for the same switch (Moving blood, under the chevrons): the setting is the one `particles`, so the two rows always agree; the figure's streaks ease in and out (cells.ts). */
export const STREAKS_ROW = { key: 'particles' as const, label: 'Blood streaks', hint: 'Fine particles carried by the flow', icon: 'dust' };
export const DEPTH_ROWS: readonly DepthRow[] = [
  { key: 'organDepth', label: 'Organ depth', hint: 'Soft light and shade on the organs', icon: 'liver' },
  { key: 'tilt', label: 'Gentle tilt', hint: 'The figure leans a few degrees with the pointer or device', icon: 'layers' },
  { key: 'dof', label: 'Depth of field', hint: 'Softens the far side in the liver dive (laptop only)', icon: 'layers' },
  { key: 'particles', label: 'Blood streaks', hint: 'Fine streaks along the flow, faster in the middle, turbulent at forks (off: chevrons only)', icon: 'chevrons' },
  { key: 'fluidSurface', label: 'Living fluid', hint: 'Ascites with soft edges, a rippling surface and a pale rim (off: as 2D draws it)', icon: 'layers' },
  { key: 'deviceShadow', label: 'Device shadows', hint: 'A soft shadow under catheters and scopes, on the tissue beneath (off: as 2D draws them)', icon: 'layers' },
];

/** Auto detail (N1): 3D only, so it is not in the 2D parity table. It sits under the Figure detail steps it works with. */
export const AUTO_DETAIL_ROW = { label: 'Auto detail', hint: 'Lets the figure soften itself when it runs slow, and sharpen again when it settles. Figure detail is the most it will use', icon: 'layers' };

/**
 * Lite figure (3D only, state/lite.ts): a calmer figure for a machine that cannot run the full one. Chosen by the device when it can tell, and the
 * person's to turn on or off. Not in the 2D parity table.
 */
export const LITE_ROW = { label: 'Lite figure', hintDevice: 'Chosen for this device', hint: 'A calmer figure for slower devices: it draws less and moves at about 20 frames a second', icon: 'layers' };
