# Tester guides (batch B15)

Two PDFs for the beta testers of the 3D app, served under stable names that testers get as links:

- `/guides/beta-start-guide.pdf` (Letter, 2 pages) and `/guides/beta-start-guide-iphone.pdf` (iPhone, 6 pages), and the same under `/preview/guides/`.
- Their source is `public/guides/` (Vite copies `public/` into the build). The offline worker does not hold them (`scripts/pwa.mjs`: two 2.6 MB files testers open from a link).

## Lifted from 2D, not redrawn

They are the 2D app's guides (`guides/` in `qaddodi/portal-pressure-simulator`), copied by a script with only the words that differ for the 3D build changed. The 3D shell is the 2D shell, so the pictures and every sentence about buttons, menus, Tests, Treat, Settings and Send feedback stay the 2D guide's.

```
python3 scripts/copy-guides.py --from <2D checkout>            # writes public/guides/*.pdf
python3 scripts/copy-guides.py --from <2D checkout> --check    # fails when a guide is not what the script makes from the 2D one
```

Needs `pip install pypdf pymupdf`. Re-run it after any change to the 2D guides. The words that change are in `scripts/guides-edits.json`:

| What | 2D guide | 3D guide |
|---|---|---|
| The link | `.../portal-pressure-simulator/preview/` | `.../portal-pressure-sim-3d/preview/` |
| The line under the title | Beta tester start-up guide | Beta tester start-up guide, 3D build |
| Step 1 | says a loading screen draws the blood up into the liver | says this is the 3D build, not the 2D app (the 3D app has no loading screen of its own) |
| Settings sentence | Settings also has Appearance (…) | …and Display (Auto detail), the 3D-only row that lets the figure soften itself on a slow device |
| Step 4, Send feedback | a link to the exact view; "after about 10 minutes a card asks once" | a link to the exact view (camera and sliders restored) and a short report of what the app's own checks found; the timed card is not in the 3D app |

A paragraph is rewritten in its own text block (the guides are ReportLab output: one `BT ... ET` per paragraph), with the same size, leading, colour and place, and may not grow past the lines it had, because a picture sits under it. The script stops, naming the paragraph, when the 2D guide no longer has the words it looks for or the new words do not fit.

## What is not done

- **The pictures are the 2D app's.** The orange pill in them reads `PREVIEW · c101b179` (a 2D build), and the figure is the 2D flat figure. New pictures of the 3D app are taken on the Mac (no headless runs) and replace the 2D ones in place, keeping the file names and the layout. Until then a tester sees the right buttons in the right places on a different-looking figure.
- **The words follow what the 3D app does today.** Where the 3D app does not yet do what the 2D guide says (the vessel card's Doppler, Inject dye and Add shunt buttons, Treat, the Tests tabs for the instruments not built yet), the guide still says what the 2D app does, because the owner's rule is to match 2D 1:1. Check each sentence against the app before the guide goes to a tester, and change `guides-edits.json` for any that is not true yet.
- No fonts are embedded: the guides use the PDF's own Helvetica, as the 2D guides do.

## When to update them

When a change alters anything a guide shows or says (buttons, Settings rows, Send feedback, the first steps), update both PDFs in the same push and keep the file names. A Settings picture and its rows must match the app's Settings sheet (Appearance: Light, Soft, Dark, Navy, Black, System; Display: Blur effect, Figure detail, Sharp while moving, Keyboard shortcuts). `tests/guides.test.ts` checks the files exist, point at the 3D preview and carry no address.
