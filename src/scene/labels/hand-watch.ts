// A hand on the picture (a pan, a pinch, the wheel, a flick, a double-tap glide) is a CONTINUOUS move: every dot it carries moves by a similarity of the screen, however far in one frame (a quick pinch moves a dot 400 px
// from its middle by 80 px in a frame). A cut is the shot changing under the labels (a dive's far end, a new view). Both made a dot jump more than FOLLOW_JUMP in a frame, so a pinch counted as a cut: the names froze
// at the picture before it (controller.ts cutAnchors, ride.ts frozen) and stood still while their vessels moved on (Mohammad, 21 Nov, iPhone: "while pinch zooming the labels are not in place, they're stuck").
// The camera knows which it is: the hand's view (zoom k, pan x y) is a projection change on top of the shot, so a frame in which the hand's view changed and the shot did not move is the hand's, and its jumps are carried.
export interface HandView { readonly k: number; readonly x: number; readonly y: number }

export class HandWatch {
  private k = NaN; private x = NaN; private y = NaN;
  /** Call once per frame with the hand's view now and whether a shot's glide is moving the camera: true when this frame's change of the picture is the hand's alone. */
  step(v: HandView | undefined, shotMoving: boolean): boolean {
    if (!v) return false;
    const moved = this.k === this.k && (v.k !== this.k || v.x !== this.x || v.y !== this.y);
    this.k = v.k; this.x = v.x; this.y = v.y;
    return moved && !shotMoving;
  }
}

/** Whether a dot's move between two frames is a cut: farther than `jump` px, and not the hand's. */
export const isCut = (dist: number, jump: number, byHand: boolean): boolean => dist > jump && !byHand;
