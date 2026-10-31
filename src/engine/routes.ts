import { nearestOnPath } from './field';
import { route, type Blocker } from './routing';
import { shapeSegs } from './shapes';
import type { Model, Pt, Track, TrialState } from './types';

/** Tracks (and cross tracks) that are already laid and not yet worked at time T. */
function activeObstacles(st: TrialState, M: Model, T: number, skip: Track | null) {
  const s = st.settings;
  const obs: Blocker[] = [];
  const ids: string[] = [];
  for (const t of M.tracks) {
    if (!t.geo || t === skip) continue;
    if (t.layStart < T - 0.01 && t.end > T) {
      ids.push(String(t.no));
      for (const g of shapeSegs(t.geo)) obs.push([g[0], g[1], s.walkBuf]);
    }
    if (t.crossT && t.geo.cross)
      t.geo.cross.forEach((c, i) => {
        const ct = t.crossT![Math.min(i, t.crossT!.length - 1)];
        if (ct.s < T && t.end > T) {
          ids.push(t.no + 'x' + i);
          obs.push([c.a, c.b, Math.max(4, s.walkBuf - 2)]);
        }
      });
  }
  return { obs, tag: ids.join('.') };
}

/** Walking routes for every layer and cross-track layer, avoiding tracks laid and not yet worked at that moment. */
export function computeRoutes(st: TrialState, M: Model) {
  const base = st.map.base;
  for (const key of ['lay', 'own'] as const) {
    const jobs = M.tracks.filter((t) => t.pool === key && t.geo).sort((a, b) => a.layStart - b.layStart);
    const last: Record<number, Track> = {};
    for (const t of jobs) {
      const from = key === 'lay' ? (last[t.res] ? last[t.res].E : base) : base;
      const ao = activeObstacles(st, M, t.layStart, t);
      t.approach = route(st, from, t.S, ao.obs, ao.tag);
      t.approachFrom = key === 'lay' ? last[t.res] || null : null;
      last[t.res] = t;
    }
  }
  const cl: Record<number, Pt> = {};
  const crossJobs = M.tracks
    .filter((t) => t.crossT && t.geo && t.geo.cross && t.geo.cross.length && !t.crossT[0].done)
    .sort((a, b) => a.crossT![0].s - b.crossT![0].s);
  for (const t of crossJobs) {
    const r = t.crossRes || 0;
    const from = cl[r] || base;
    const c = t.geo!.cross[0];
    const ao = activeObstacles(st, M, t.crossT![0].s, null);
    const ex = nearestOnPath(st, c.b);
    t.crossRoutes = [route(st, from, c.a, ao.obs, ao.tag), ex ? route(st, c.b, ex, ao.obs, ao.tag) : null];
    t.crossFrom = cl[r] ? 'אחרי העקבה החוצה הקודמת' : 'מנקודת הכינוס';
    cl[r] = ex || c.b;
  }
}
