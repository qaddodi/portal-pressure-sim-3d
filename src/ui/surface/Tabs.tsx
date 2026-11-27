// The one tab strip of a panel (menu unification, stage 1: reports/menu-unification.md 3.2 "Head"). Treat's words (variant `text`, with a count beside a name) and
// Tests' instruments (variant `icon`, an icon and a name that steps down by tab-fit.ts) are the same control: role tablist / tab, only the open tab in the tab order
// (roving tabindex), the arrow keys, Home and End move along it and choose. It wears the class names the lifted 2D stylesheets draw (.instr-tabs, .instr-tab, and the
// strip's own .treat-tabs or .ws-tabs), so the one gliding chosen piece (seg-glide.copied) finds it and Tests' 1 / 2 slot markers (data-slot) still show.
import { useLayoutEffect, useRef, type KeyboardEvent, type Ref } from 'react';
import { I } from '../shell/icons.tsx';
import { readPlace } from '../layout-snap.ts';
import { reduced } from '../a11y/motion.ts';
import { D_SMALL, EASE_MOVE } from '../motion.ts';
import { FIT_WHOLE, type TabFit, type TabVariant } from './tab-fit.ts';

export interface TabItem {
  id: string;
  /** the name (an icon tab's full short name) */
  label: string;
  /** an icon tab's name at the compact step (it-short) */
  short?: string;
  /** an icon tab's icon */
  icon?: string;
  /** a text tab's count beside its name: a number (empty at 0) where the tab has one, undefined where it has none */
  count?: number;
  title?: string;
  ariaLabel?: string;
  /** shown as chosen (a second instrument beside the open one is chosen too); the open tab by default */
  selected?: boolean;
  /** Tests' 1 / 2 marker while two instruments share the card */
  slot?: string;
  controls?: string;
}

export interface TabsProps {
  variant: TabVariant;
  items: readonly TabItem[];
  /** the open tab: the one in the tab order */
  value: string;
  onPick(id: string): void;
  /** the strip's name for a screen reader */
  label: string;
  /** the strip's own class the 2D stylesheets know it by (treat-tabs, ws-tabs) */
  className?: string;
  /** the step the names take (tab-fit.ts); PanelHead hands it down */
  fit?: TabFit;
  /** a tab is about to be wanted (a pointer over it, a press, focus): Tests asks for the instrument's code */
  onWarm?(id: string): void;
  inert?: boolean;
  ref?: Ref<HTMLDivElement>;
}

const stepCls = (f: TabFit) => `${f.compact ? ' compact' : ''}${f.narrow ? ' narrow' : ''}${f.tight ? ' tight' : ''}${f.bare ? ' bare' : ''}`;

export function Tabs({ variant, items, value, onPick, label, className, fit = FIT_WHOLE, onWarm, inert, ref }: TabsProps) {
  const own = useRef<HTMLDivElement | null>(null);
  const setRef = (el: HTMLDivElement | null) => {
    own.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };
  // In a tight row the open tab shows its name and the others give way at once: each slides from where it stood, by translate (2D dock.js layout(): WAAPI, composite add).
  const was = useRef<Record<string, number> | null>(null);
  const chosenKey = items.map((t) => (t.selected ?? t.id === value ? `${t.id}${t.slot ?? ''}` : '')).join('|');
  useLayoutEffect(() => {
    const row = own.current;
    if (!row) return;
    const now: Record<string, number> = {}, bs = new Map<string, HTMLElement>();
    for (const b of row.querySelectorAll<HTMLElement>(':scope > .instr-tab')) { const id = b.dataset.tab!; bs.set(id, b); now[id] = readPlace(b).left; }
    const before = was.current;
    was.current = now;
    if (!before || !fit.tight || reduced()) return;
    for (const [id, b] of bs) {
      const dx = (before[id] ?? now[id]!) - now[id]!;
      if (Math.abs(dx) > 0.5 && typeof b.animate === 'function') b.animate([{ translate: `${dx}px 0` }, { translate: '0 0' }], { duration: D_SMALL, easing: EASE_MOVE, composite: 'add' });
    }
  }, [value, chosenKey, fit.tight, fit.bare]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const n = items.length, at = items.findIndex((t) => t.id === (e.target as HTMLElement).closest<HTMLElement>('.instr-tab')?.dataset.tab);
    const i = at < 0 ? items.findIndex((t) => t.id === value) : at;
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n;
    const id = items[j]!.id;
    own.current?.querySelector<HTMLElement>(`:scope > .instr-tab[data-tab="${id}"]`)?.focus();
    onPick(id);
  };

  const cls = `instr-tabs${className ? ` ${className}` : ''}${variant === 'icon' ? stepCls(fit) : ''}`;
  return (
    <div ref={setRef} className={cls} role="tablist" aria-label={label} data-variant={variant} inert={inert} onKeyDown={onKey}>
      {items.map((t) => {
        const on = t.selected ?? t.id === value;
        const warm = onWarm ? () => onWarm(t.id) : undefined;
        return (
          <button key={t.id} type="button" className="instr-tab" role="tab" data-tab={t.id} data-slot={variant === 'icon' ? t.slot ?? '' : undefined} aria-selected={on}
            aria-controls={t.controls} aria-label={t.ariaLabel} tabIndex={t.id === value ? 0 : -1} title={t.title}
            onClick={() => onPick(t.id)} onPointerEnter={warm} onPointerDown={warm} onFocus={warm}>
            {variant === 'icon' ? (
              <>
                <I n={t.icon ?? 'info'} />
                <span className="it-t"><b><span className="it-full">{t.label}</span><span className="it-short">{t.short ?? t.label}</span></b></span>
              </>
            ) : (
              <span className="tt-l">{t.label}{t.count !== undefined && <span className={`tt-n${t.count > 0 ? ' on' : ''}`} aria-hidden="true">{t.count || ''}</span>}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
