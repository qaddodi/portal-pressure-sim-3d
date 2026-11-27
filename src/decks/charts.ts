// Which of a slide's `tool` kinds and `visual`s are a chart the data card draws (ui/talk/ToolCard.tsx); the rest are instruments (the Tests devices) or still to come.
import type { Slide } from './schema.ts';

export const CHART_TOOLS = ['criteria', 'path', 'profile', 'curve', 'course', 'fluid', 'stent', 'lumen', 'flows', 'plane', 'trial', 'forest', 'trace', 'shift', 'stiffness', 'flowtime', 'saag', 'evgraph', 'vitals', 'menu', 'scores', 'lobule'] as const;
/** The instruments of the Tests card, mounted in the data card as its own panes (they read the live model, which the talk has eased to the slide's state). */
export const INSTRUMENT_TOOLS = ['doppler', 'fibroscan', 'abdomen', 'reading', 'hvpg', 'scope', 'wall'] as const;
export const CHART_VISUALS = ['plane', 'ladders', 'allpatients', 'walls'] as const;
/** The slide has a chart tool (in the data card, over its tiles when it has them). */
export const hasToolChart = (s: Slide): boolean => !!s.tool && ([...CHART_TOOLS, ...INSTRUMENT_TOOLS] as readonly string[]).includes(s.tool.kind);
/** The slide's data card is a chart of its own (a visual over the dimmed figure). */
export const hasVisualChart = (s: Slide): boolean => !!s.visual && (CHART_VISUALS as readonly string[]).includes(s.visual);
export const hasChart = (s: Slide): boolean => hasToolChart(s) || hasVisualChart(s);
