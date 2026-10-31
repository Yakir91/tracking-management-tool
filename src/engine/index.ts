import { buildModel } from './model';
import { computeRoutes } from './routes';
import { schedule } from './schedule';
import type { Model, TrialState } from './types';
import { nowMin } from './util';

/** The whole plan for the current state: groups, schedule and walking routes. Does not modify the state. */
export function plan(st: TrialState, now = Date.now(), withRoutes = true): Model {
  const M = buildModel(st);
  if (!M.tracks.length) {
    M.NOW = st.live ? nowMin(st.settings.date, now) : -Infinity;
    return M;
  }
  schedule(st, M, now);
  if (withRoutes) {
    try {
      computeRoutes(st, M);
    } catch (e) {
      console.error(e);
    }
  }
  return M;
}

export * from './types';
export { LEVELS, LKEYS } from './levels';
export { generateTracks, optimizeOrder, needOf } from './placement';
export { fieldsOf, hasField, allFieldPts, totalArea, getPaths, pathField } from './field';
export { trackCard, crossCard, compName, resName } from './cards';
export { events, liveEvents, warnings } from './reports';
export { defaultState, normalize, loadState, saveState, demoLayout, STORE_KEY } from './state';
export { packShare, unpackShare, stateFromShare, shareSummary, isShareHash } from './share';
export { groupSizeFor } from './model';
export * from './util';
