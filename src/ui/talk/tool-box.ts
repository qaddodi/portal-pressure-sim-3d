// The kind on a data card's tool box (2D presenter-tools.js: `box.dataset.kind`): the slide's tool kind, the procedure's graph taking the flow-time chart's box. None for a slide with no tool.
import type { Slide } from '../../decks/schema.ts';

export const toolBoxKind = (slide: Pick<Slide, 'tool'>): string | null => (slide.tool ? (slide.tool.kind === 'evgraph' ? 'flowtime' : slide.tool.kind) : null);
