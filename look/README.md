# The look board

Photographs the 3D figure in about 40 fixed states (patient, view, look, device size) on the Mac, so a change to how it looks can be seen, not guessed. Nothing here runs in the cloud;
the pictures are saved on this computer and are not committed (`look/*` is ignored except this file).

## Run it

```
npm run look:serve        # Vite on this computer plus the save endpoint; prints the address
```

Open `http://localhost:5173/?look` (add `&twod` for a button on each row that opens the 2D app's preview of the same patient in the row), press **Run all**.
It walks the states by device (one frame at a time; the app inside applies the next state in place), reads the figure's canvas in the frame that draws it, and shows each as
**2D | 3D | baseline | difference**. When the server runs, each picture is written to `look/<commit>/<state>.png` (`-dirty` after the commit when the tree has changes).
Without the server (the preview copy on Pages) the board still runs, and the rows show the pictures and nothing is saved.

- **Make this run the baseline** copies the run to `look/baseline/`. Do it when a run looks right; later runs show the difference from it (red where a pixel moved by more than 12 levels, and the share of pixels that moved).
- **Copy report** puts one line per state on the clipboard (size, how much moved), for the thread.
- **Only** (the select) runs one device's states.
- `npm run look:diff` (node, no browser) compares the newest run with the baseline and writes `look/<commit>/index.html`, a contact sheet with the states that moved first.

## What a picture is

The figure's canvas only. The cards, labels and menus are DOM, not in it (the Circuit's captions are not in the picture). The model is paused and the chevrons are off, so two runs of one commit give one picture.
The pixel ratio is this computer's, so a "phone" frame draws at the Mac's ratio, not an iPhone's: it checks layout, shading and ink, not the phone's sharpness (check that on the phone).

## The states

`src/debug/look-states.ts` (`LOOK_STATES`): the five looks on the healthy anatomy; a cirrhotic patient on Mac, iPad and iPhone in Light and Dark; one patient per disease look; the Circuit; the lobule and sinusoid; one turned figure.
An address with `capture` is one state (`?capture&look=dark&preset=cirr-decomp&view=circuit&chevrons=0&orbit=25`); it sets the look, the patient, the view and the turn in memory only.
