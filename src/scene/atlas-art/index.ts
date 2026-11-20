// Atlas art (Settings > Figure depth > Atlas art: Classic or Atlas). The external artist's organs, shading and vessel courses, behind one switch:
//   Classic (the default)  nothing here loads or draws; the figure is exactly what it was.
//   Atlas                  files are fetched (loader.ts), the artist's organs replace the classic ones (which stay built and hidden underneath, so the figure's own state is whole when
//                          you go back) and every vessel is reshaped in place to his centreline and radii (vessels.ts); the form (healthy, decompensated cirrhosis, Budd–Chiari)
//                          follows the live patient (specimen.ts).
// Taking Atlas away again is `setEnabled(false)`: the organs hide, the classic ones show, the vessels are rebuilt from the 2D courses. Delete this folder and its few hooks (scene.ts,
// network.ts, shape.ts, tubes.ts, vessel-object.ts, Stage.tsx, the Settings row) and nothing else changes.
import type { Group, Vector2, Vector4 } from 'three';
import { AtlasOrgans } from './organs.ts';
import { AtlasVessels } from './vessels.ts';
import type { AtlasCourses } from './courses.ts';
import { loadCourses, loadGrain, loadOrgans } from './loader.ts';
import { specimenOf, type SpecimenParams } from './specimen.ts';
import { setAtlasStatus } from './status.ts';
import type { Specimen } from './types.ts';
import type { VesselObject } from '../vessels/vessel-object.ts';
import type { LookId } from '../../looks/looks.ts';
import { bodyTargets, type DiseaseFrame, type DiseaseParams } from '../disease/targets.ts';

/** What the atlas needs from the scene. */
export interface AtlasHost {
  vessel(id: string): VesselObject | undefined;
  /** the classic organ layer and the classic ascites pool: hidden while the atlas shows */
  classic: { organs: Group; ascites: Group };
  /** the vessel shapes' own bookkeeping starts again from their present state (Classic is back) */
  shapesChanged(): void;
  /** a frame is needed */
  wake(why: string): void;
}

export class AtlasArt {
  readonly organs: AtlasOrgans;
  private readonly vessels: AtlasVessels;
  private courses: AtlasCourses | null = null;
  private want = false;
  private active = false;
  private specimen: Specimen = 'healthy';
  private pendingFiles = new Set<Specimen>();
  private last: { f: DiseaseFrame; params: DiseaseParams | null; healthyP: ArrayLike<number> | null; instant: boolean } | null = null;

  private readonly host: AtlasHost;

  constructor(host: AtlasHost, cut: { value: Vector4 }, res: { value: Vector2 }) {
    this.host = host;
    this.organs = new AtlasOrgans(cut, res);
    this.vessels = new AtlasVessels((id) => host.vessel(id));
  }

  /** Whether the atlas is what the figure shows now (its files are in and it was asked for). */
  get shown(): boolean { return this.active; }
  /** The form the vessels are drawn in (null: the 2D courses). */
  get vesselForm(): Specimen | null { return this.vessels.specimen; }

  /** Atlas art on or off (the Settings choice). On starts the fetch; the figure changes when the files are in, and not before. Off is immediate. */
  setEnabled(on: boolean): void {
    if (on === this.want) return;
    this.want = on;
    if (!on) { this.deactivate(); setAtlasStatus('off'); return; }
    setAtlasStatus('loading');
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const [courses, grain, healthy] = await Promise.all([loadCourses(), loadGrain(), loadOrgans('healthy')]);
      if (!this.want) return;
      this.courses = courses;
      this.organs.setGrain(grain); this.organs.add('healthy', healthy);
      this.activate();
      setAtlasStatus('on');
    } catch (e) {
      console.error(e);
      if (this.want) setAtlasStatus('failed');
    }
  }

  private activate(): void {
    if (this.active || !this.want) return;
    this.active = true;
    this.host.classic.organs.visible = false; this.host.classic.ascites.visible = false;
    this.organs.setVisible(true);
    if (this.last) this.feed(this.last.f, this.last.params, this.last.healthyP, true);
    this.organs.snap();
    this.syncFiles();
    this.host.wake('atlas-art');
  }

  private deactivate(): void {
    const was = this.active;
    this.active = false;
    this.organs.setVisible(false);
    this.host.classic.organs.visible = true; this.host.classic.ascites.visible = true;
    if (was || this.vessels.specimen) { this.vessels.apply(null, 'healthy'); this.host.shapesChanged(); }
    this.host.wake('atlas-art');
  }

  /** The newest model state (the scene calls it with each engine frame, as it feeds the disease layer). Held for when Atlas turns on; costs nothing in Classic. */
  feed(f: DiseaseFrame, params: DiseaseParams | null, healthyP: ArrayLike<number> | null, instant: boolean): void {
    this.last = { f, params, healthyP, instant };
    if (!this.active) return;
    const t = bodyTargets(f, params ?? {}, healthyP);
    this.specimen = specimenOf(params as SpecimenParams | null);
    this.organs.setSpecimen(this.specimen);
    this.organs.setBody(t.ascites, t.spleenScale, t.splenicRx, instant);
    this.syncFiles();
  }

  /** Fetches the organ files the patient needs and are not in yet (the decompensated and Budd–Chiari files, 1 MB each, only for a patient of that form). */
  private syncFiles(): void {
    for (const s of this.organs.needs()) {
      if (this.organs.has(s) || this.pendingFiles.has(s)) continue;
      this.pendingFiles.add(s);
      loadOrgans(s).then((m) => { this.pendingFiles.delete(s); if (this.want) { this.organs.add(s, m); this.host.wake('atlas-art'); } }, (e) => { this.pendingFiles.delete(s); console.error(e); });
    }
  }

  /** The look: the artist's palette for it and the figure's own casing ink for the line. */
  applyLook(look: LookId, dark: boolean): void { this.organs.setLook(look, dark); }

  /** Steps the crossfades, and swaps the vessels to the patient's form once that form's organs are in (the two change together). True while anything moves. */
  update(now: number): boolean {
    if (!this.active) return false;
    let moving = this.organs.update(now);
    if (this.courses && this.organs.has(this.specimen) && this.vessels.specimen !== this.specimen) { this.vessels.apply(this.courses, this.specimen); moving = true; }
    return moving || this.pendingFiles.size > 0;
  }

  dispose(): void { this.organs.dispose(); }
}

/** Wires the Settings choice to the atlas: the first call takes the saved choice (a returning Atlas user loads its files at boot, nothing is fetched for Classic). Returns the remover. */
export function bindAtlasSettings(art: AtlasArt, store: { getState(): { atlasArt: 'classic' | 'atlas' }; subscribe(fn: () => void): () => void }): () => void {
  const apply = () => art.setEnabled(store.getState().atlasArt === 'atlas');
  apply();
  return store.subscribe(apply);
}
