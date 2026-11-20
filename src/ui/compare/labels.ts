// The labels of the changes on in a set of parameters, for the Compare cards ("Then" lists what was on then). The Treat batch's activeInterventions (2D inspector.js) is handed in once it exists.
import { getInterventionLabels } from '../timeline/index.ts';
export const activeLabels = (params: unknown): string[] => (params == null ? [] : [...getInterventionLabels()(params).values()]);
