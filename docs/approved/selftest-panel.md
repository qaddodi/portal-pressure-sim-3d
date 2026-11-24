# Self-test / capture panel (24 Nov 2026)

Approved look: **mock A, "bottom sheet with one Capture button"** (`/mnt/project-files/selftest-panel-mocks/A-bottom-sheet.png`). Mohammad picked it ("Build 1") on 24 Nov.
Complaint it answers: a wall of equal-weight buttons, a long deck list, the panel floating mid-screen, the slide pill showing through behind the buttons.

Traits (keep every one), top to bottom, in `src/ui/debug/audit/page.ts` (`?audit=here`) and `capture-pick.ts`:
- Docked to the bottom edge, full width (max 560 px), rounded top corners, opaque (nothing shows through).
- Title "Capture" left, "build <hash>" muted right.
- Status: slide N of M and its title; thin progress bar; "step N of about M" line. Red "Stop and keep what's done" shows only while a run is going (capture or self-test).
- WHICH SLIDES: one segmented row, All / Ticked / Random 5 / 10 / 25 (All ignores the ticks, Ticked takes every slide of the ticked talks, Random draws from them).
- "Talks  42 of 42 ›" row: the ticked list is hidden until tapped. "Speed  1x real time" row (its hint is the select's title).
- One big blue "Capture" button. Below it text links: Self-test, Run full, Run quick, and "Copy report ›" which opens Report / Short / JSON.
- Save zip (big blue) and Share contact sheets appear when a capture finishes.

Fonts unchanged; no chips, pills or badges. Rejected: B (tabs), C (three numbered steps).
Progress counts only the chosen sample; Save zip opens the share sheet inside the tap (`capture/save-files.ts`).

24 Nov follow-ups (Mohammad): during a run the sheet steps aside (title and form fade out over 0.2 s, leaving status, bar, percent and Stop); a Capture-only "Animations: Skipped / Played" row (default Skipped) runs the clock at 300x so every glide and fade lands in one frame and the slide is photographed on its settled state (the settle waits are unchanged).
Skipped, as built (Mohammad: "still animating", "things growing", "just land the final slide"): the clock runs motion systems in 33 ms steps inside one drawn frame (`clock.setSkip`, `SKIP_CHUNK`), every CSS transition/animation lasts 1 ms, finite Web Animations are finished each 16 ms, and an opaque cover hides the app under the sheet so no in-between frame shows. Tests: `tests/clock.test.ts`, `tests/capture.test.ts`.
No cover (24 Nov, "not hidden, skipped"): while a slide is on its way the clock holds back the render phase (`clock.setDrawing(false)`), so the first picture drawn is the landed slide and it stays on screen through the capture.
