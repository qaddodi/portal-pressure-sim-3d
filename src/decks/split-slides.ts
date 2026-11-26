// The slides that show two livers side by side (the split orbit, docs/approved/split-orbit.md): the healthy liver on the left, the slide's own patient on the right.
// A slide asks for it with its `split` field ({ label, against }); the field is a 3D addition laid on by the overlay table (decks/overlay.ts SPLIT), never part of a copied 2D deck.
export interface SplitSlide { /** the words over the right figure (the slide's patient) */ label: string; /** the words over the left figure */ against: string }

/** Whether the split orbit is shown: on by default (Mohammad, 24 Nov: "Do it, we can remove if it sucks"); `?split=0` on the address turns it off. */
export const splitEnabled = (): boolean => !(typeof location !== 'undefined' && /(^|[?&])split=(0|off|no)(&|$)/.test(location.search));

/** What a slide asks of the split orbit (null: no twin). */
export const splitOf = (slide: { split?: SplitSlide | null } | null | undefined): SplitSlide | null => (slide?.split && splitEnabled() ? slide.split : null);
