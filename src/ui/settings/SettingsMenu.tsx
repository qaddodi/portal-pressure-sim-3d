import { useShell } from '../shell/store.ts';
import { Icon } from '../shell/icons.tsx';
import { SettingsSheet } from './SettingsSheet.tsx';
import { UI } from '../strings.generated.ts';

const gear = UI.topbar.find((t) => t.id === 'btnSettings')!;

/** The presenter pill's gear. It opens the same Settings sheet as the rest of the app (SettingsSheet), standing above the pill. */
export function SettingsMenu() {
  const open = useShell((s) => s.sheet === 'settings');
  return (
    <div className="dk-settings">
      <button type="button" data-opens="settings" aria-haspopup="dialog" aria-expanded={open} aria-label={gear.label ?? undefined} title={gear.title ?? undefined} onClick={() => useShell.getState().toggle('settings')}><Icon n="gear" /></button>
      <SettingsSheet place="bar" />
    </div>
  );
}
