# Accessibility

Portal Pressure Simulator, 3D build (updated 19 November 2026) · self-assessment against WCAG 2.2 level AA, in the format of an Accessibility Conformance Report (ACR), kept in step with the 2D app's `docs/ACCESSIBILITY.md`. **This is not a third-party audit**, and **nothing in the 3D app has been checked on a real device or with a screen reader yet**: the statuses below say what the code does and what its tests hold, not what a person using VoiceOver has confirmed. An independent audit and a published VPAT® are planned before institutional sale.

## Summary

| Area | Status |
|------|--------|
| Keyboard | Supported in the code, not yet walked on a device. Every drawn vessel is a real button, out of sight, in flow order (`src/scene/labels/VesselWalk.tsx`): Tab steps through them with the focused vessel highlighted on the figure, the arrows follow the flow (Right downstream, Left upstream), Enter or Space picks it. Cards, sheets, menus and dialogs are keyboard-reachable, modal ones are `role="dialog"` with the page behind inert, and Esc backs out one layer at a time. The command palette and the 2D app's number-key actions are as far along as the shell is (`?parity` lists what is done). |
| Screen readers | Partially supported. The figure has an accessible name and a live `aria-description` of the patient, one line made from the model (`src/ui/a11y/caption.ts`, the 2D app's words from the same cut-off tables): "Cirrhosis. Portal pressure 23 mmHg, HVPG 17.0 mmHg (CSPH). Large varices, 0.8 L ascites, flow toward the liver." It leaves out what the figure hides, reads a bleed first, and keeps the direction of a slow flow. It is rewritten at most every 3 s and never while the figure moves. A patient loading or a slide changing is announced through one polite live region (`#live`), at most one message every 3 s: a message that arrives sooner is kept and the newest one is spoken when the gap has passed, so the last word always arrives without a burst of chatter (`src/ui/a11y/announce.ts`). Chart data is not yet exposed as tables. |
| Color | Supported in the code. The pressure scale is perceptually uniform; every value shown by colour also has a number, an arrow, a dash pattern or a word; direction is shown by chevron orientation, not hue. The self-check `a11y-colour-cue` reads the screen for a coloured element with no words behind it. |
| Motion | Supported, with one exception, as in 2D. `prefers-reduced-motion` stops everything that travels, but nothing appears or disappears in one frame: whatever comes, goes or changes look cross-fades over 240 to 420 ms (`fadeMs` in `src/ui/a11y/motion.ts`; the shell, the cards and the rolling numbers in `src/ui/a11y/reduced.css`). Two moves keep a short form instead of a jump, because a jump of the whole figure is harder to follow: the camera's glide, and the dive through the liver, run at most 300 ms (`REDUCED_MOVE_MS`, `reducedMs`, read by the camera rig). The figure still follows the hand: following is not an animation. The live data traces still scroll with the model's clock; pausing the model stops them. |
| Zoom and reflow | Responsive layouts down to the 2D app's phone sizes, lifted from its stylesheet; text never shrinks to fit, so a card pages instead. Not yet checked at 200 % browser zoom. |
| Text contrast | Every look's text colours measure at least 4.5:1 against its card and its ground, and its signal colours 3:1 as marks (WCAG 1.4.3 and 1.4.11), computed by `tests/a11y-contrast.test.ts` on each push (the "Looks table" bench prints the same table on a device). A look that changes a token fails the test. |
| Timing | No time limits; the model's clock can be paused at any time. |
| Language | The interface is in English and the document declares `lang="en"` (the self-check `a11y-lang` reads it). |
| Selecting text | Text on the figure and the cards is not selectable (owner's rule); inputs and fields are. A screen reader reads the page by its own means. |

## WCAG 2.2 AA criteria with known gaps

| Criterion | Level | Status | Notes |
|-----------|-------|--------|-------|
| 1.1.1 Non-text content | A | Partially supports | The figure is named and described (above). The instrument canvases (Doppler, endoscopy, the lobule and sinusoid dive) are named where they are built; the pictures themselves are not described in detail. |
| 1.3.1 Info and relationships | A | Partially supports | Chart data is summarised in text, not exposed as data tables. |
| 1.4.1 Use of colour | A | Supports in code, to be checked on device | Rule `a11y-colour-cue`. |
| 1.4.11 Non-text contrast | AA | Supports with exceptions | Faint "potential collateral" ghosts are intentionally below 3:1; they are decorative until the layer is switched on. |
| 2.2.2 Pause, stop, hide | A | Partially supports | The live data traces scroll while the model runs, also under Reduce Motion; the model's clock can be paused. |
| 2.5.7 Dragging movements | AA | Partially supports | Turning, panning and zooming the figure have a second tap on the active view and the 0 key (a refit) and the double click (zoom in); sliders and shunt placement have click or keyboard alternatives as far as the 3D cards have been built. |
| 3.1.1 Language of page | A | Supports | `lang="en"`. |
| 4.1.2 Name, role, value | A | Partially supports | Controls use native buttons, `aria-pressed`, `role="dialog"`; the rule `a11y-control-name` lists any icon-only control with no name. |
| 4.1.3 Status messages | AA | Supports in code | One polite live region, paced (above). |

## Testing done

- Unit tests in Node: the caption's words (`tests/a11y.test.ts`), the announcer's gap, the Reduce Motion policy and that its stylesheet never travels or jumps, and contrast of every look (`tests/a11y-contrast.test.ts`).
- The self-check rules in `src/ui/debug/selfcheck/rules-a11y.ts`, which `?debug` runs over the screen (Check, Sweep, Phone check): figure named and described, live region, language, control names, colour cues.
- Not yet done: any run on a device; screen-reader testing with NVDA, JAWS and VoiceOver; colour-vision simulation of each lens; 200 % zoom. All are part of the planned third-party audit and of the Mac and iPhone play-tests.

## Contact

Report an accessibility problem through Send feedback (Settings), or the repository's issue tracker; include the browser, assistive technology and the steps to reproduce.
