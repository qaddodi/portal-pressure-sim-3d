# Promotion pictures: the look

Status: **proposed, waiting for Mohammad's yes** (25 Nov 2026). Change this line when he answers, and record what he changed.

What it is: `/preview/?promotion` (`src/ui/debug/promo`, how to use it in `docs/debug.md`). A captured slide is laid in a plain device outline under the app's logo and name.

## The picture

- **The screen** is the app as a person meets it: no PREVIEW tab, no build pill, no debug or perf marks, no toast; the credit stays (the © shows on every slide: the corner line, and on an iPhone the line in the words card's foot); the Rich figure (every effect on, the sharpest picture); the slide settled (the capture's own wait). One picture a slide.
- **Sizes taken:** a Mac window 1440 x 900 at 2x (2880 x 1800), an iPhone 390 x 844 at 3x (1170 x 2532), an iPad upright 820 x 1180 at 2x (1640 x 2360). The finished pictures are the screen plus the outline plus the margin (about 3900 x 2900 for the Mac, 1700 x 3300 for the iPhone, 2150 x 2900 for the iPad), JPEG at 92%.
- **Safe edges** (Mohammad, 25 Nov: "lay out like a real iPhone"): the iPhone and iPad frames give the app the device's safe edges (`?safe=`, iPhone 47 px top and 34 bottom, iPad 24 and 20, `FRAME_SAFE` in promo/frames.ts), so the figure fills the screen and the cards and pill stay clear of the camera pill, the home bar and the round corners, as on the device. The app reads them from `--safe-t/r/b/l` (shell/global.css).
- **The device** is drawn from a few rounded shapes, never a copy of a maker's artwork, with no logo or model name on it. Mac: a dark lid with a thin bezel and a small camera, a thin silver base with a thumb notch. iPhone: a dark rounded body with side buttons, a camera pill and a home bar over the screen. iPad: a dark rounded body with an even bezel and a camera dot.
- **The backdrop** is dark (a slow diagonal from #12141a to #1b1a2c) with three soft glows in the logo's own colours (blue top left, pink bottom right, violet in the middle) and a soft shadow under the device.
- **The brand** stands centered above the device: the app's mark (`public/brand/mark.svg`) and "Portal Pressure Simulator" in Source Serif 4 semibold, off-white.
- **Never in a picture:** the feedback email (a build variable the capture never draws), a build or time stamp, the PREVIEW tab.

## The set

Twenty slides are proposed (`src/ui/debug/promo/slides.ts`, with a reason each), chosen for teaching value and for how the figure looks: the circulation, the lobule, the measurements, the pressure circuit, the bleeds, the shunts and the patient's story. The box on the page takes any other list as `deck:number`.
