// What 2D's topbar-motion.js asks of its neighbours, as this repo has them (the copy's imports are mapped to this file by scripts/copy-b11-shell.mjs).
// - removeSoon: 2D takes a ghost out of the page "after the next rest pass" (class-soon.js); here, in a task of its own straight after the animation ends.
// - gpuGlass, morphGlass: 2D's bar can wear glass the GPU draws (glass-morph.js) and then changes its size in view; the 3D bar's glass is the page's own backdrop blur on each face
//   (glass.css), so neither applies: the answer is always "no", and the copy takes the plate-copies path (plateGlide, growPill, ghost), which moves transform and opacity only.
export function removeSoon(el: Element): void { setTimeout(() => el.remove(), 0); }
export function gpuGlass(_el: Element): boolean { return false; }
export function morphGlass(_el: Element, _ms: number, _move: boolean): boolean { return false; }
