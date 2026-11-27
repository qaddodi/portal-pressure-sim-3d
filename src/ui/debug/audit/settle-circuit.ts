// The change between the Anatomy and the Circuit runs on its own clock (scene/circuit/view.ts), and the body's camera glides with it. The capture's wait took the camera's rest and the clock's
// list as still while that change had not landed: the Mac promotion picture of a case's last stop, after a Circuit stop, showed the figure part-way from the map (26 Nov 2026).
/** Why the page is not still because of the Circuit change (empty when it has landed). */
export const circuitChangeWaiting = (view: { readonly moving: boolean }): string => (view.moving ? 'the Circuit change is moving' : '');
