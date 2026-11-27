// The one head of a panel (menu unification, stage 1: reports/menu-unification.md 3.2 "Head"): Treat, Tests, History, Compare and Why each had their own, in three fonts
// and paddings with two kinds of close button, and Treat's and Tests' X was hidden on a phone. Now each passes its title, an optional quiet meta ("2 running", Tests'
// status), an optional quiet line in the title (Tests' vessel) and optional tabs; the head draws them in one font and padding with the one X (CloseX), on every device
// (owner, 27 Nov, section 6 question 2: the pull down is an extra, never the only way to close).
// The tabs sit in the head row when they fit and drop to a row of their own under it when they don't, by the one measured rule (tab-fit.ts tabRow). The head measures
// its own width, the X's and the title's when they change size (an observer, never in a frame) and asks the rule; the strip is told the step its names take.
// The markup keeps the class names the lifted 2D stylesheets draw (src/ui/styles: .card-head, .card-title, .card-meta, .card-close, and .tabbed while the tabs sit
// in the row), so their rules keep reaching every panel's head; panel-head.css holds what is the shell's own.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CloseX } from './parts.tsx';
import { Tabs, type TabsProps } from './Tabs.tsx';
import { tabRow, textNeed, sameFit, FIT_WHOLE, type TabRow } from './tab-fit.ts';
import { readMetric, readStyle } from '../layout-snap.ts';
import { observeThenFit } from '../layout/fit-later.ts';
import './panel-head.css';

export interface PanelHeadProps {
  /** the title's words */
  title: ReactNode;
  /** a quiet line beside the title, inside it (Tests' vessel: .dt-l) */
  sub?: ReactNode;
  /** a quiet status after the title (.card-meta): Treat's "2 running", Tests' "Paused" */
  meta?: { text: ReactNode; className?: string; state?: string; live?: 'off' | 'polite' };
  /** the tab strip, if the panel has one */
  tabs?: Omit<TabsProps, 'fit'>;
  /** the title (and its meta) step aside while the tabs sit in the row: the open tab already names what is shown (Tests) */
  yieldTitle?: boolean;
  /** what the X closes, as a screen reader hears it ("Close Treat") */
  closeLabel: string;
  onClose(): void;
  /** the head's own class names the 2D stylesheets know it by (tc-head, dock-head) */
  className?: string;
  titleClass?: string;
  closeClass?: string;
}

/** The step a strip starts at, before the head is measured: an icon strip in the row (Tests' one slim row), a text strip under it (Treat's), as they stood. */
const firstRow = (t: PanelHeadProps['tabs']): TabRow => ({ inHead: t?.variant === 'icon', fit: FIT_WHOLE });
const px = (v: string) => parseFloat(v) || 0;

export function PanelHead({ title, sub, meta, tabs, yieldTitle = false, closeLabel, onClose, className, titleClass, closeClass }: PanelHeadProps) {
  const headRef = useRef<HTMLDivElement>(null), titleRef = useRef<HTMLSpanElement>(null), metaRef = useRef<HTMLSpanElement>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [row, setRow] = useState<TabRow>(() => firstRow(tabs));
  const live = useRef({ tabs, yieldTitle });
  live.current = { tabs, yieldTitle };

  // (the strip's own ref is handed on to the panel too: Treat's page slides it away)
  const outer = tabs?.ref;
  const stripAt = (el: HTMLDivElement | null) => {
    stripRef.current = el;
    if (typeof outer === 'function') outer(el);
    else if (outer) outer.current = el;
  };

  const measure = () => {
    const head = headRef.current, t = live.current.tabs;
    if (!head || !t) return;
    const w = readMetric(head, 'clientWidth');
    // (a shut card has no box: it keeps the row it had)
    if (!w) return;
    const cs = readStyle(head), gap = px(cs.columnGap);
    const inner = w - px(cs.paddingLeft) - px(cs.paddingRight);
    const x = head.querySelector<HTMLElement>(':scope > .card-close');
    const close = x && readStyle(x).position !== 'absolute' ? readMetric(x, 'offsetWidth') + gap : 0;
    const lead = live.current.yieldTitle ? 0 : (titleRef.current ? readMetric(titleRef.current, 'offsetWidth') + gap : 0) + (metaRef.current ? readMetric(metaRef.current, 'offsetWidth') + gap : 0);
    let need: number | undefined;
    if (t.variant === 'text') {
      // (every name's own width, a count's room beside it where the tab has one: .tt-n stands 5 px after the name)
      const names = Array.from(stripRef.current?.querySelectorAll<HTMLElement>(':scope > .instr-tab .tt-l') ?? []).map((l) => readMetric(l, 'offsetWidth') + (l.querySelector('.tt-n') ? 5 + 12 : 0));
      need = names.length ? textNeed(names) : undefined;
    }
    const open = t.items.find((i) => i.id === t.value)?.label ?? '';
    const next = tabRow({ head: inner, close, lead, variant: t.variant, n: t.items.length, open, need });
    setRow((o) => (o.inHead === next.inHead && sameFit(o.fit, next.fit) ? o : next));
  };
  // (measured before the first paint, and again when the open tab, the title or the meta changes; then whenever the head or the title changes size)
  const metaKey = typeof meta?.text === 'string' ? meta.text : '';
  useLayoutEffect(measure, [tabs?.value, tabs?.items.length, metaKey]);  // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => (tabs ? observeThenFit([headRef.current, titleRef.current], measure) : undefined), [!!tabs]);  // eslint-disable-line react-hooks/exhaustive-deps

  const strip = tabs ? <Tabs {...tabs} ref={stripAt} fit={row.fit} /> : null;
  const inHead = !!strip && row.inHead;
  const headCls = `card-head${className ? ` ${className}` : ''}${inHead ? ' tabbed' : ''}`;
  return (
    <>
      <div ref={headRef} className={headCls} data-yield={yieldTitle || undefined} data-tabs={tabs ? (inHead ? 'head' : 'below') : undefined}>
        <h2 className={`card-title${titleClass ? ` ${titleClass}` : ''}`}><span ref={titleRef}>{title}</span>{sub !== undefined && <span className="dt-l">{sub}</span>}</h2>
        {meta && <span ref={metaRef} className={`card-meta${meta.className ? ` ${meta.className}` : ''}`} data-state={meta.state} aria-live={meta.live}>{meta.text}</span>}
        {inHead && strip}
        <CloseX className={`card-close${closeClass ? ` ${closeClass}` : ''}`} label={closeLabel} onClose={onClose} />
      </div>
      {!inHead && strip}
    </>
  );
}
