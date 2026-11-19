# GPU robustness (WP10)

Two bugs reached an iPhone that no node test could see: a redeclared vertex attribute (the Circuit block and the vessel both declared `rk`, 19 Nov: every vessel vanished) and a tube of
no radius (NaN geometry: the black varix spindle). Three layers now stand between a shader and the owner's device.

1. **`tests/glsl-compile.test.ts` (node, about a second).** `src/debug/gl-programs.ts` rebuilds the source three.js hands the driver (its prefix, then ours) for every program: the
   ShaderMaterials found on `new CelScene().scene` (hidden views included), the late ones (Circuit resistors, dye), and the raw ones (charts, Doppler, FibroScan). Each goes through
   **glslang**, the Khronos reference compiler (`apt-get install glslang-tools` or `brew install glslang`; without it the compile tests skip with a note). The same file checks that no
   program declares a name twice or one three.js declares, that every uniform a shader declares is in its material with a value, and that no program asks for more than the ES 3.0 floor
   (16 attributes, 15 varying vectors, 16 samplers, 256 / 224 uniform vectors). It fails on the pre-`c1013dc` vessel shader with `'rk' : redefinition`.
   **A new shader**: put its file in `GL_FILES` in `src/debug/gl-registry.ts` (a test fails until you do) and, if the scene graph does not hold its material at start, register its program there.
2. **`?gl` on the device.** One line per program, green or red, with this device's driver log, the device's limits (attributes, varyings, uniforms, texture units, highp in the fragment
   stage) and Copy. ShaderMaterial programs are built by three.js itself (`renderer.compileAsync` over the whole scene), the rest from their text on the same context. It makes no context
   of its own (the app makes two, ever). Open it once per build on the iPhone, the iPad and the Mac.
3. **Fail loud.** `src/debug/shader-guard.ts` answers `renderer.debug.onShaderError`: the meshes that wore the refused program are drawn flat in their own tone colour (a veil is not drawn),
   the `?perf` bar shows a red pill (`vessel shader failed: 1`), `?perf`'s Copy text leads with it, and the bug packet's first finding names it with the driver's log.

**Pixel ratio and MSAA** (`src/scene/quality.ts`): the figure never draws above 2x (`MAX_FIGURE_DPR`); the canvas is multisampled below 2x only (`msaaFor`). A context's `antialias` is fixed
when it is made, so `Stage` keys its `<Canvas>` on the answer and makes it again only when Settings > Figure detail crosses 2x. Sharp on a 2x or 3x screen therefore has no MSAA.
