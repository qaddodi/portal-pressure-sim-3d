// Figure presets in Settings (review R6): Cool, Balanced and Rich as one raised three-part control (the same `.seg` as the old Figure detail steps), the line under it saying what the
// chosen one does, and a "More" row that opens the page of individual switches. The preset is read back from the ten switches (state/figure-presets.ts), so it follows any change made under More.
import { useSettings } from '../../state/settings.ts';
import { PRESET_IDS, presetOf, presetValues, type PresetId } from '../../state/figure-presets.ts';
import { Fade } from '../fade.tsx';
import { MenuItem } from '../shell/Menu.tsx';
import { FIGURE_TITLE, MORE_ROW, PRESET_LABEL, PRESET_LINE } from './preset-rows.ts';
import './figure-presets.css';

/** The preset the figure switches stand at now (null: a mix of the owner's own). */
export function useFigurePreset(): PresetId | null {
  return useSettings((s) => presetOf(s));
}

export function FigurePresets({ onMore }: { onMore(): void }) {
  const at = useFigurePreset();
  const line: PresetId | 'custom' = at ?? 'custom';
  return (
    <>
      <div className="menu-title">{FIGURE_TITLE}</div>
      <div className="seg full menu-seg fig-presets" role="group" aria-label={FIGURE_TITLE}>
        {PRESET_IDS.map((id) => (
          <button key={id} type="button" aria-pressed={at === id} onClick={() => useSettings.getState().setMany(presetValues(id))}>{PRESET_LABEL[id]}</button>
        ))}
      </div>
      <div className="fp-lines" aria-live="polite">
        {([...PRESET_IDS, 'custom'] as const).map((id) => <Fade key={id} as="small" on={line === id} className="fs-hint fp-line">{PRESET_LINE[id]}</Fade>)}
      </div>
      <MenuItem icon="sliders" label={MORE_ROW.label} kb={MORE_ROW.hint} onClick={onMore} />
    </>
  );
}
