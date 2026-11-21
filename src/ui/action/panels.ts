// A card verb of type 'panel' is a component with its own controls (the stent editor: B5). The batch that builds it registers it here; until then the card shows no panel.
import type { ComponentType } from 'react';

const panels = new Map<string, ComponentType<{ id: string }>>();
export function registerPanel(kind: string, view: ComponentType<{ id: string }>): () => void {
  panels.set(kind, view);
  return () => { if (panels.get(kind) === view) panels.delete(kind); };
}
export const panelFor = (kind: string): ComponentType<{ id: string }> | undefined => panels.get(kind);

/** A panel's line for the card's header (the TIPS and DIPS card's three readings stand between its name and its state): a component registered with the panel's own kind. */
const heads = new Map<string, ComponentType<{ id: string }>>();
export function registerHead(kind: string, view: ComponentType<{ id: string }>): () => void {
  heads.set(kind, view);
  return () => { if (heads.get(kind) === view) heads.delete(kind); };
}
export const headFor = (kind: string): ComponentType<{ id: string }> | undefined => heads.get(kind);
