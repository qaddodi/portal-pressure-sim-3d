// The Protein legend stands in the top bar beside the lens key (ProteinLegend.tsx; owner, 20 Nov), only while the sinusoid is the view.
export const legendOn = (view: string, drawn: boolean): boolean => view === 'sinusoid' && drawn;
/** The hepatocytes' face on Disse, µm from the sinusoid's axis (the lumen, the endothelium, the space of Disse: 5 + 0.8 + 3.4): where a tall screen's legend must stay clear of. */
export const FACE_UM = 5 + 0.8 + 3.4;
