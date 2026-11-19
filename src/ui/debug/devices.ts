// The one list of device sizes the debug tools use (the 2D app's src/ui/devices.js, same ids and sizes): the device frame, the Sweep and the screenshot notes all read it,
// so "ipad" is one screen (landscape, 1180 x 820; "ipad-portrait" is the other way round) in every tool and a size is added in one place. Pure data.
export interface DebugDevice { id: string; name: string; label: string; w: number; h: number; dpr: number; touch: boolean; phone: boolean; turn: string | null; gallery: boolean }

export const DEVICES: readonly DebugDevice[] = Object.freeze([
  { id: 'mac', name: 'Mac 1440×900', label: 'Mac', w: 1440, h: 900, dpr: 1, touch: false, phone: false, turn: null, gallery: true },
  { id: 'mac-short', name: 'Mac short 1440×780', label: 'Mac short', w: 1440, h: 780, dpr: 1, touch: false, phone: false, turn: null, gallery: true },
  { id: 'mac-xl', name: 'Mac full screen 1913×1188', label: 'Mac full screen', w: 1913, h: 1188, dpr: 1, touch: false, phone: false, turn: null, gallery: false },
  { id: 'ipad', name: 'iPad landscape 1180×820', label: 'iPad landscape', w: 1180, h: 820, dpr: 1.5, touch: true, phone: false, turn: 'ipad-portrait', gallery: true },
  { id: 'ipad-portrait', name: 'iPad portrait 820×1180', label: 'iPad portrait', w: 820, h: 1180, dpr: 1.5, touch: true, phone: false, turn: 'ipad', gallery: true },
  { id: 'iphone', name: 'iPhone 390×844', label: 'iPhone', w: 390, h: 844, dpr: 3, touch: true, phone: true, turn: 'iphone-landscape', gallery: true },
  { id: 'iphone-landscape', name: 'iPhone sideways 844×390', label: 'iPhone sideways', w: 844, h: 390, dpr: 3, touch: true, phone: true, turn: 'iphone', gallery: true },
]);

export const deviceOf = (id: string): DebugDevice | undefined => DEVICES.find((d) => d.id === id);
export const GALLERY_DEVICES: readonly DebugDevice[] = Object.freeze(DEVICES.filter((d) => d.gallery));
