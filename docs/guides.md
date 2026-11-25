# Tester guides (batch B15)

Two PDFs for the beta testers of the 3D app, served under stable names that testers get as links:

- `/guides/beta-start-guide.pdf` (Letter, 2 pages) and `/guides/beta-start-guide-iphone.pdf` (iPhone, 6 pages), and the same under `/preview/guides/`.
- Their source is `public/guides/` (Vite copies `public/` into the build). The offline worker does not hold them (`scripts/pwa.mjs`: two 2.6 MB files testers open from a link).

## Lifted from 2D, not redrawn

They are the 2D app's guides (`guides/` in `qaddodi/portal-pressure-simulator`), copied by a script with only the words that differ for the 3D build changed. The 3D shell is the 2D shell, so every sentence about buttons, menus, Tests, Treat, Settings and Send feedback stays the 2D guide's unless the table below says otherwise. The pictures are the 3D app's own (next section).

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
| Main menu sentence | the menu lists presentations and patients (Present, Patients) | …and histories: a third tab, Histories, opens a model patient who has already been treated (23 Nov) |
| Step 2, Tests tabs | Pressure, HVPG, Doppler, Scope, Ascites, Fibro and Readouts | Pressure, IR, Doppler, Scope, Ascites, Fibro, Readouts and Trials (25 Nov) |
| Step 3, the vessel card | Narrow and Clot; Doppler, Inject dye and Add shunt | Stenosis and Thrombus; Doppler and Shunt (the dye is gone, the card's rows were renamed; 25 Nov) |
| Step 4, Settings sentence | Display (…) | Display, where Figure (Cool, Balanced or Rich) sets how much detail the figure draws; the ten switches are on its More page (figure presets, 25 Nov) |
| Step 4, Send feedback | a link to the exact view; "after about 10 minutes a card asks once" | a link to the exact view (camera and sliders restored) and a short report of what the app's own checks found; the timed card is not in the 3D app |

A paragraph is rewritten in its own text block (the guides are ReportLab output: one `BT ... ET` per paragraph), with the same size, leading, colour and place, and may not grow past the lines it had, because a picture sits under it. The script stops, naming the paragraph, when the 2D guide no longer has the words it looks for or the new words do not fit.

## The pictures (25 Nov 2026, review R8)

Ten shots of the running 3D app replace the 2D ones, in place and in the same shapes (five screens, each on a Mac-size window and an iPhone-size one): the top bar with the PREVIEW tab, the main menu open, the Tests card, the portal vein card, and Settings with Send feedback ringed. Each shot is cut to the shape of its place in the PDF; `scripts/capture-guide-shots.mjs` takes them and `scripts/guides-edits.json` (`pictures`) says which shot replaces which picture.

```
VITE_CHANNEL=preview VITE_BUILD=<branch>@<commit> VITE_FEEDBACK_EMAIL=feedback@example.invalid npx vite --port 5173 --host 127.0.0.1
node scripts/capture-guide-shots.mjs /tmp/shots                 # about 6 minutes: headless Chromium on SwiftShader, one page load a minute
python3 scripts/copy-guides.py --refresh --shots /tmp/shots     # lays the shots and the words of guides-edits.json into the committed PDFs
```

- **The pill in each picture names the build it was taken on** (`PREVIEW · <commit>`), so a tester's screenshot can be compared with the guide's. Retake after a change to any of the five screens, with `--refresh`; the captions and the words stay.
- **The Send feedback row only exists when the build has an address** (`VITE_FEEDBACK_EMAIL`, see `feedback.ts`). The capture gives the run a made-up one (`feedback@example.invalid`): the row shows, no picture shows the address, and the guides carry none (`tests/guides.test.ts`). Never give it Mohammad's.
- The figure is drawn by the software renderer, not a GPU: the shading is the same, edges can be a touch softer than on a Mac. Retake on the Mac if a picture ever has to be exact.
- `--refresh` also says the changed paragraphs again from `guides-edits.json` (found by each paragraph's `find3d` words), so a sentence the app made untrue is a one-line edit there and a `--refresh`.

## What is not done

- **The words follow what the 3D app does today.** Where the 3D app does not yet do what the 2D guide says (Treat, the Tests tabs for the instruments not built yet), the guide still says what the 2D app does, because the owner's rule is to match 2D 1:1. Check each sentence against the app before the guide goes to a tester, and change `guides-edits.json` for any that is not true yet.
- No fonts are embedded: the guides use the PDF's own Helvetica, as the 2D guides do.

## When to update them

When a change alters anything a guide shows or says (buttons, Settings rows, Send feedback, the first steps), update both PDFs in the same push and keep the file names. A Settings picture and its rows must match the app's Settings sheet (Appearance: Light, Soft, Dark, Navy, Black, System; Display: Figure Cool, Balanced, Rich and a More page holding Blur effect, Figure detail, Auto detail, Sharp while moving and the Figure depth switches (docs/approved/figure-presets.md); Keyboard shortcuts). `tests/guides.test.ts` checks the files exist, point at the 3D preview and carry no address.
