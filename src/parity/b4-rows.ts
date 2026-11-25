// B4's rows: what the 2D figure shows of the organs and of the patient's disease. The 2D inventory (parity/inventory.json) lists controls, words, decks and cards, and has no row for
// a picture on the figure, so B4 keeps its own list here, from what the 2D figure draws (anatomy.js ORGANS and the disease rules of stage-diaphragm.js, stage-tubes.js, stage-clamps.js,
// stage-organs.js). The score reads these beside the inventory's rows; `?parity` lists them under "Organs and disease looks". "Match 2D" stays 0 until Mohammad checks a row on his device.
import type { Row } from './score.ts';
import { OWN_SLIDE_ROWS } from './own-slides.ts';

export const ORGAN_LABELS: Record<string, string> = {
  heart: 'Heart', 'heart-ra': 'Right atrium', liver: 'Liver', spleen: 'Spleen', stomach: 'Stomach and oesophagus', duodenum: 'Duodenum', 'kidney-l': 'Left kidney', bowel: 'Small bowel', colon: 'Colon',
};
/** What the figure shows of the disease: id (after `figure:`) and the words. */
export const DISEASE_LOOKS: Record<string, string> = {
  'liver-cirrhosis': 'Cirrhotic liver: shrunken right lobe, nodules and pale septa',
  'liver-congestion': 'Congested liver: dusk and nutmeg',
  'spleen-size': 'Spleen size follows the model',
  'spleen-removed': 'Removed spleen: a ghost of itself',
  'spleen-infarct': 'Partly embolized spleen: the dead lower part',
  'ascites-pool': 'Ascites: the pool and its surface',
  'ascites-flank': 'Ascites: the flank bulges, the bowel floats up',
  'caput-umbilicus': 'Caput medusae: the navel\'s ring',
  'stenosis-clamp': 'Stenosis: the waist and its arrowheads',
  'thrombus-clot': 'Thrombus: the clot against the wall',
  'cavernoma': 'Cavernous transformation: channels around the clot',
  'varices-bands': 'Esophageal varices: strands, closed by bands',
  'varix-bead': 'Varices bead with their size',
  'red-wale': 'Red wale on the esophageal strands',
  'bleed-stream': 'Variceal bleed: the stream',
  'bleed-pool': 'Variceal bleed: the pool in the stomach',
  'sin-strands': 'Sinusoid strands, faint and fine',
  'lens-grey': 'A colour lens greys the organs',
};
const rows = (area: string, items: Record<string, string>): Row[] => Object.entries(items).map(([k, label]) => ({ id: `${area}:${k}`, area: 'figure', batch: 'B4', label }));
/** (and the slides the 3D talks add to the 2D ones, own-slides.ts: rows the 2D inventory does not have, read by the same three places) */
export const B4_ROWS: readonly Row[] = [...rows('organ', ORGAN_LABELS), ...rows('figure', DISEASE_LOOKS), ...OWN_SLIDE_ROWS];
