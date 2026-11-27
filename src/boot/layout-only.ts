import { flagOn } from '../ui/debug/flags.ts';

/**
 * `?layout` (preview copy or a local run only; the flag's gate and the live build's channel both keep it off the live site): the page boots with no WebGL and draws no figure.
 * The scene's camera and labels are still worked out, so every card, label, menu and line of text is real DOM in its real place; only the pixels of the figure are missing.
 * A headless browser with no graphics card then runs the self-test in seconds (scripts/layout-check.mjs). Never for judging colour, shape or shaders.
 */
export const layoutOnly = (): boolean => import.meta.env.VITE_CHANNEL !== 'live' && flagOn('layout');
