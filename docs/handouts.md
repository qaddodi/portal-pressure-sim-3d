# Printed notes (Present > a talk > Print notes)

`src/ui/deck/handout.ts` writes one standalone page per talk: the title, objectives and outline, then a block per slide, then the quick check. It is the 2D app's `handout.js`
layout. Each slide's block opens with **the slide's picture** (the figure with its labels and data card; for a table or chart slide, that card, set across the page) beside its
kicker, title, line with the model's numbers, equation, notes and question.

**How the pictures get there.** They are files, one per slide, exactly as in 2D: `public/brand/handout/<deck id>/<slide id>.webp`, listed in
`src/ui/deck/handout-figures.generated.ts`. The notes page asks for a picture by its address when the page is opened (`<img>`; landscape ones take more of the row; one that does
not load leaves no hole). Nothing is drawn on a canvas, nothing is read back from the 3D figure and no second WebGL context is made to print: the app's side is a string of HTML.
The pictures (14 MB) are never part of the first load and never held offline: `scripts/pwa.mjs` leaves `brand/handout/` out of the service worker's list, so offline the notes
print with their words only.

**Where the pictures come from.** `node scripts/copy-handout.mjs --from <2D checkout at the pin>` copies 2D's own pictures and rewrites the list (`--check` compares;
`tests/deck-review-handout.test.ts` runs it when a 2D checkout at the pin is at hand). So today a picture shows the **2D app's figure**, as the tester guides do, until pictures of
the 3D app are taken on the Mac (the cloud runs no browser).

**What still prints without a picture: 102 of 512 slides.** 2D has none of them at the pin, so 2D prints them bare too: every slide of `gradients`, `same-gradient`,
`two-lesions`, `tips-candidacy` and `tips-complete` (65), and 37 slides added to 17 other talks after 2D's pictures were last drawn. The exact list is `NO_PICTURE` in
`tests/deck-review-handout.test.ts`; the test fails when a slide joins it by accident (a renamed id) and when a picture is added without shortening it.

**Replacing a picture with one of the 3D app.** Put a WebP of the same name in `public/brand/handout/<deck>/` (720 px wide; 1200 px when the data card stands beside the figure),
add its id to the list (or re-run the copy script first, then add), and take it out of `NO_PICTURE`. No scene API exists yet for taking them in the app; if one is wanted, it
belongs in `src/scene/api.ts` as one call that returns the canvas's picture in the frame it was drawn (the scene's own renderer, never a new context), driven slide by slide on the Mac.
