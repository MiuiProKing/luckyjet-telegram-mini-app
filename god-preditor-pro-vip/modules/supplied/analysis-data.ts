// Dependencies absent from the supplied attachment; same public archive filters.
import {normalizeArchive, isFreshArchive} from '../public-forecast.mjs';
export const orderedAnalysisRounds = normalizeArchive;
export const analysisIsFresh = isFreshArchive;
