// The 2D app's chrome, measured from its stylesheets (never by eye). Every number names the rule it comes from in qaddodi/portal-pressure-simulator.
// The shell's CSS reads them as custom properties (metricVars, set on .sh-root), so a number lives once; tests/shell-metrics.test.ts holds each to the 2D rule.
// Pixels are CSS pixels; "wide" is the 2D layout of a laptop or an iPad held sideways (min-width 768 landscape, or 1101 up).

export const M = {
  /** app-07-floating.css:191 `.app { --pill-h: 46px; --ctl-h: 40px }` (42 and 36 under 1100 px, :530). */
  pillH: 46, ctlH: 40,
  /** tokens.css:55 `--r-sheet: 16px`, `--r-card: 10px`, `--r-control: 6px`. */
  rSheet: 16, rCard: 10, rControl: 6,
  /** app-01-chrome.css:73 `.topbar { padding: safe-top + 10px … 12px; gap: 8px }`, 8 px on a phone or an upright tablet (app-03-layouts.css:57), 6 px on a phone held sideways (:107). What the figure and the cards keep clear is the
   *  bar's own height, which 2D main.js measures into `--top-safe` (the `64px` in app-01-chrome.css:61 is only its fallback, never what is on screen): room.ts `topBarH`. */
  topPad: 10, topPadPhone: 8, topPadSideways: 6, sidePad: 12, gap: 8,
  /** app-07-floating.css:195 `.tb-id { padding: 3px }`, `.menu-btn { padding: 0 8px 0 4px; gap: 8px }`, `.brand-mark { 30px }`, radius max(6, 16 − 4) = 12 (app-08-cards.css:248). */
  idPad: 3, menuPadL: 4, menuPadR: 8, menuGap: 8, mark: 30, innerRadius: 12,
  /** app-07-floating.css `.topbar .sb-right { padding: 0 3px; gap: 0; height: --pill-h }`, chips `--ctl-h` high, `.chip-btn { padding: 0 12px; gap: 8px }`, `.lens-btn { padding: 0 10px }`. */
  figPad: 3, chipPadX: 12, chipGap: 8, lensPadX: 10,
  /** app-07-floating.css:14 `.top-right.float-pill { padding: 3px; gap: 2px }`; `.tb-act { height: 38px; padding: 0 11px; gap: 7px }`; `.tb-sep { 1px × 22px; margin: 0 4px }`; `.pal-btn { height: 34px; padding: 0 8px 0 12px }`. */
  actPad: 3, actGap: 2, actH: 38, actPadX: 11, actInnerGap: 7, sepH: 22, sepMargin: 4, searchH: 34, searchPadL: 12, searchPadR: 8, gearW: 34,
  /** The legend's scale: app-01-chrome.css:219 `.lg-scale { width: 168px; height: 30px }`, 128 px under 1600 (app-07-floating.css, `@media (max-width: 1599px) { .lg-scale { width: 128px } }`). The words show from 1600 (`.legend .lg-title`, `.lg-cap` under). */
  legendW: 168, legendNarrowW: 128, legendH: 30, legendTitleFrom: 1600,
  /** app-07-floating.css:47 `.vdock { bottom: safe-bottom + --gap(12px); width: min(100% − 24px, 1280px) }`, app-09-tests.css:962 `width: min(100% − 24px, 640px)` and `.readouts { width: 274px }`,
   *  `.metric.primary { 128px }`; `.vdock .stage-bar.bottom { height: 60px; padding: 0 8px 0 12px }`. */
  dockBottom: 12, dockMaxW: 640, dockRadius: 16, timelineH: 60, timelinePadL: 12, timelinePadR: 8, timelineGap: 12, readoutsW: 274, metricW: 128,
  /** app-10-thumb-dock.css:27 `.nb-views { padding: 6px; border-radius: 21px; bottom: calc(100% + 8px) }`, its buttons `height: 30px; padding: 0 14px; border-radius: 15px; gap: 2px`. */
  viewPad: 6, viewGapAbove: 8, viewBtnH: 30, viewBtnPadX: 14, viewBtnGap: 2, viewRadius: 21, viewBtnRadius: 15,
  /** app-08-cards.css:260 `.tl-split { height: 40px; padding: 3px; gap: 2px; border: 1px; radius 10px }`, `.tl-speed { width: 44px; 12px }`, `.ib.play { width: 46px }`; `.tl-ff` 36 px (app-09-tests.css:274);
   *  `.tl-time { 14px 600 }` (app-08-cards.css:51); `.tl-pin { height: 32px; padding: 0 10px; gap: 6px }` (app-03-layouts.css:372). */
  splitH: 40, splitPad: 3, splitGap: 2, speedW: 44, playW: 46, ffW: 36, pinH: 32, pinPadX: 10, pinGap: 6,
  /** app-07-floating.css:452 `.zoom-pill { padding: 3px; gap: 2px; right: safe-right + --gap; bottom: --bot-occ + 8px }`, buttons 36 × 36 (:454); --bot-occ is the dock's top edge plus the view pill (main.js syncCmpH). */
  zoomPad: 3, zoomGap: 2, zoomBtn: 36, zoomRight: 12, zoomAboveDock: 8,
  /** app-01-chrome.css:406 `.stage-credit { font-size: 12px; line-height: 1.4 }`, credit.js `inset = 12` from the figure's bottom-left corner; app-11-deck-visuals.css:524 `.fps-counter { left/bottom: max(8px, safe); 12px/1.2 }`. */
  creditFont: 12, creditLine: 1.4, creditInset: 12, fpsInset: 8, fpsFont: 12, fpsLine: 1.2,
  /** The phone's dock (app-07-floating.css:151): `left/right: safe + 6px; bottom: safe + 6px`; `.stage-bar.bottom { height: 52px }`; the thumb bar `.nb-tab { height: 48px }` in `padding: 3px 6px 4px` (app-10-thumb-dock.css:5). */
  /** The one gap between a sheet or card standing over the dock and the dock's top edge (23 Nov 2026, Mohammad: the vessel card sat tight on the time bar). 12 px is the app's own gutter (the dock's `--gap`, the card's side margin). Every sheet's foot reads it: sheetFoot() in room.ts. */
  sheetGap: 12,
  phoneInset: 6, phoneTimelineH: 52, phoneTabH: 48, phoneTabsPadTop: 3, phoneTabsPadBottom: 4,
} as const;

/** The metrics as the custom properties the shell's CSS reads (--m-pill-h …). */
export function metricVars(): Record<string, string> {
  const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(M)) out[`--m-${kebab(k)}`] = k === 'creditLine' || k === 'fpsLine' ? String(v) : `${v}px`;
  return out;
}

/** The dock's height above the screen foot on a laptop (the timeline), and the view pill above it: what the zoom pill and the figure's room clear. */
export const dockTop = (): number => M.dockBottom + M.timelineH;
export const viewPillHeight = (): number => M.viewPad * 2 + M.viewBtnH;
/** `--bot-occ`: the dock and the view pill above it (the 2D app measures it; here it is the same sum). */
export const botOcc = (): number => dockTop() + M.viewGapAbove + viewPillHeight();
/** The zoom pill's gap above the screen foot. */
export const zoomBottom = (): number => botOcc() + M.zoomAboveDock;
/** The zoom pill's height with its buttons (Rotate folds in only in the Circuit). */
export const zoomHeight = (buttons: number): number => M.zoomPad * 2 + buttons * M.zoomBtn + (buttons - 1) * M.zoomGap;
/** The dock's width on a laptop: min(screen − 24, 640). */
export const dockWidth = (screenW: number): number => Math.min(screenW - 2 * M.dockBottom, M.dockMaxW);
