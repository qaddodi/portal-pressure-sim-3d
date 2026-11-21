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
  { key: 'hideBehind', label: 'Hide vessels behind organs', hint: 'The liver hides the IVC and lumbar vein where it is in front (off: they show faintly through it)', icon: 'layers' },
  { key: 'fluidSurface', label: 'Living fluid', hint: 'Ascites with soft edges, a rippling surface and a pale rim (off: as 2D draws it)', icon: 'layers' },
];
