// The lobule as a true 3D scene (Settings > Figure depth > 3D lobule and sinusoid). Placeholder: the flat lobule (lobule/view.ts) draws until this is built.
import { Group } from 'three';
import type { CelShared } from '../materials/cel.ts';
import type { LobuleView } from '../lobule/view.ts';

export class Lobule3D {
  readonly group = new Group();
  private on = false;
  constructor(_flat: LobuleView, _shared: CelShared) { this.group.name = 'lobule3d'; this.group.visible = false; }
  get enabled(): boolean { return this.on; }
  /** One frame, after the flat lobule's own update. `on` is the Settings switch. True while anything of this scene moves. */
  update(on: boolean): boolean { const changed = on !== this.on; this.on = on; return changed; }
  dispose(): void { /* nothing yet */ }
}
