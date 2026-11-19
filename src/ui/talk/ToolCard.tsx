// The chart of a slide's data card, as the card layer mounts it. The charts themselves (every chart family's card, model and data: ToolCardBody.tsx) are a part of the
// app only a talk opens, so they are their own chunk and a normal load never downloads them (until 19 Nov 2026 they were in the boot entry). A talk waits for the
// chunk before it opens (ui/shell/talk.ts), and the page reads it in once it is idle (boot/warm.ts), so a slide's card never shows before its chart can draw:
// this component only renders nothing in the moment a chunk that failed to load is asked for again.
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { loadToolCard, toolCardBody, type ToolCardProps } from './tool-card-load.ts';

export function ToolCard(props: ToolCardProps): ReactNode {
  const [B, setB] = useState<ComponentType<ToolCardProps> | null>(toolCardBody);
  useEffect(() => { let on = true; if (!B) void loadToolCard().then(() => { const b = toolCardBody(); if (on && b) setB(() => b); }); return () => { on = false; }; }, [B]);
  return B ? <B {...props} /> : null;
}
