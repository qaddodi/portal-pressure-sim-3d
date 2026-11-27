// The rows of the 2D app's menus, on its own markup and class names (util.js menuItem, menuSection and main.js menuToggle): `.menu-group` > `.menu-title` and `.menu-item` / `.lens.lens-opt` rows.
// The menu around them is the one menu shell (surface/Menu.tsx): Settings, Help, From readings and the figure's menus put these rows in it. Their stylesheet is the 2D app's (src/ui/styles).
import { useId, type ReactNode } from 'react';
import { I } from './icons.tsx';

/** menuSection: a titled group of rows; a group of radios is a radiogroup. */
export function MenuGroup({ title, radios, children }: { title?: string | null; radios?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <div className="menu-group" role={radios ? 'radiogroup' : 'group'} aria-labelledby={title ? id : undefined}>
      {title ? <div className="menu-title" id={id}>{title}</div> : null}
      {children}
    </div>
  );
}

/** menuItem: an icon, the words, a key hint; a toggle with an icon shows its state as a trailing check (role switch). */
interface MenuItemProps { icon?: string; label: string; kb?: string | null; checked?: boolean; onClick?: () => void; title?: string; className?: string }
export function MenuItem({ icon, label, kb, checked, onClick, title, className }: MenuItemProps) {
  const toggle = checked != null && !!icon;
  return (
    <button
      type="button" className={className ? `menu-item ${className}` : 'menu-item'} role={toggle ? 'switch' : checked != null ? 'radio' : undefined}
      aria-checked={checked != null ? !!checked : undefined} title={title} onClick={onClick}
    >
      {toggle ? <I n={icon!} className="mi-ic" /> : checked != null ? <I n="check" className="mi-check" /> : icon ? <I n={icon} className="mi-ic" /> : null}
      <span>{label}</span>{kb ? <span className="kb">{kb}</span> : null}{toggle ? <I n="check" className="mi-check mi-trail" /> : null}
    </button>
  );
}

/** main.js menuToggle: a row of the Blood, Layers and Settings menus: an icon, a name, a line under it, and a switch. */
export function MenuToggle({ checked, icon, label, sub, onChange }: { checked: boolean; icon: string; label: string; sub?: string; onChange: (on: boolean) => void }) {
  return (
    <button type="button" className={`lens lens-opt${checked ? ' on' : ''}`} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <I n={icon} className="bo-ic" /><span className="lens-t">{label}</span>{sub ? <span className="lens-d">{sub}</span> : null}<span className="mt-sw" aria-hidden="true" />
    </button>
  );
}
