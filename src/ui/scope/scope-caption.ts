// The caption under the lens (2D scope-lens.js caption): the varices' grade and an active bleed or the bands on them. Pure: the lens writes it when it changes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Frame = any;
export function captionOf(f: Frame): string {
  const vx = f?.metrics?.varix, bleed = !!(f?.bleed?.active && f.bleed.site === 'VAR'), bands = Math.round(f?.bands || 0);
  return !vx?.present ? 'No varices' : `${vx.grade?.label || 'Large'} varices${bleed ? ' · bleeding' : bands ? ' · banded' : ''}`;
}
