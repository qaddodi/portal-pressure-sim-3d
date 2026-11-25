// The words of the Figure presets in Settings (review R6): plain, one line each. Cool, Balanced and Rich are `state/figure-presets.ts`; "Custom" is what the sheet says when the
// switches under More are a mix of the owner's own.
import type { PresetId } from '../../state/figure-presets.ts';

export const PRESET_LABEL: Record<PresetId, string> = { cool: 'Cool', balanced: 'Balanced', rich: 'Rich' };
export const PRESET_LINE: Record<PresetId | 'custom', string> = {
  cool: 'Softer and plainer. Runs coolest and lasts longest on a phone.',
  balanced: 'The usual picture.',
  rich: 'Sharpest, every effect on. Runs warmest.',
  custom: 'Your own mix, set under More.',
};
export const FIGURE_TITLE = 'Figure';
export const MORE_ROW = { label: 'More', hint: 'Each figure switch on its own' } as const;
export const MORE_PAGE_TITLE = 'Figure, switch by switch';
const NOW_CUSTOM = 'Now: Custom. Pick Cool, Balanced or Rich in Settings to set them all at once.';
export const MORE_NOW = (id: PresetId | null): string => (id ? `Now: ${PRESET_LABEL[id]}. Changing a switch here makes it Custom.` : NOW_CUSTOM);
