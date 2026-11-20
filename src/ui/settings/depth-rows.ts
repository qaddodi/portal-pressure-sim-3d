// The "Figure depth (3D only)" rows of Settings: the five steps beyond 2D the owner approved on 19 Nov 2026 ("Yes do all properly"), each behind its own switch so the figure can be
// compared with 2D. Words are short and plain; 2D has no such rows (they are not in the parity table).
import type { DepthKey } from '../../state/settings.ts';

export interface DepthRow { key: DepthKey; label: string; hint: string; icon: string }
export const DEPTH_ROWS: readonly DepthRow[] = [
  { key: 'smoothJoins', label: 'Smooth vessel joins', hint: 'Branches meet as one joined tube, and pressure colour runs along it', icon: 'route' },
  { key: 'organDepth', label: 'Organ depth', hint: 'Soft light and shade on the organs', icon: 'liver' },
  { key: 'tilt', label: 'Gentle tilt', hint: 'The figure leans a few degrees with the pointer or device', icon: 'layers' },
  { key: 'freeTilt', label: 'Tilt all around', hint: 'Turn the figure any way to see the veins from every side: one finger pans, two fingers tilt (a mouse drag turns it)', icon: 'layers' },
  { key: 'dof', label: 'Depth of field', hint: 'Softens the far side in the liver dive (laptop only)', icon: 'layers' },
  { key: 'particles', label: 'Blood streaks', hint: 'Fine streaks along the flow, faster in the middle, turbulent at forks (off: chevrons only)', icon: 'chevrons' },
  { key: 'micro3d', label: '3D lobule and sinusoid', hint: 'Cells, nuclei and vessels in depth inside the liver (off: the flat views)', icon: 'liver' },
];
