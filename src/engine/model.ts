import { LEVELS } from './levels';
import type { Draw, Group, LevelKey, Model, Track, TrialState } from './types';

/** Automatic group size: 6 only when the level's aging covers the time to work 5 dogs, otherwise 3. Own-laid levels are one group (no draw). */
export function groupSizeFor(st: TrialState, lk: LevelKey) {
  const s = st.settings;
  if (LEVELS[lk].own) return 1e6;
  if (s.groupSize) return s.groupSize;
  const lv = LEVELS[lk];
  const iv = (+s.est[lk] || lv.est) + s.changeover;
  const ag = Math.max(lv.aging, +s.aging[lk] || 0);
  return ag >= 5 * iv + s.drawBuf + lv.paces / s.layRate ? 6 : 3;
}

/** Groups (by level, in judging order) and one track per entrant; judges assigned by load. */
export function buildModel(st: TrialState): Model {
  const s = st.settings;
  const groups: Group[] = [], tracks: Track[] = [];
  const byId = (id: string) => st.competitors.find((c) => c.id === id) || null;
  for (const lk of s.levelOrder) {
    const comps = st.competitors.filter((c) => c.level === lk);
    const n = comps.length;
    if (!n) continue;
    const G = groupSizeFor(st, lk);
    const k = Math.ceil(n / G), base = Math.floor(n / k), extra = n % k;
    let idx = 0;
    const own = LEVELS[lk].own;
    for (let g = 0; g < k; g++) {
      const size = base + (g < extra ? 1 : 0);
      const members = comps.slice(idx, idx + size).map((c) => c.id);
      idx += size;
      const id = lk + '-' + (g + 1);
      const sig = members.slice().sort().join(',');
      let draw: Draw | null = st.draws[id] || null;
      if (draw && draw.sig !== sig) draw = null;
      const grp = {
        id, level: lk, lv: LEVELS[lk], members, sig, draw, index: g, count: k, tracks: [], order: groups.length, seq: [],
        noDraw: own || size === 1, single: !own && size === 1, judge: 0, layMin: 0, layMax: 0, gate: 0, firstStart: 0,
      } as Group;
      groups.push(grp);
      for (let sl = 0; sl < size; sl++) {
        const tid = id + '#' + (sl + 1);
        // own tracks belong to their handler; stranger tracks get an entrant from the draw
        const comp = own || size === 1 ? byId(members[sl]) : draw ? byId(draw.order[sl]) : null;
        const t = { id: tid, group: grp, level: lk, lv: LEVELS[lk], slot: sl, comp, geo: st.geo[tid] || null, act: st.actuals[tid] || {}, no: st.trackNo[tid] } as Track;
        grp.tracks.push(t);
        tracks.push(t);
      }
      // tracks are worked in laying order
      grp.seq = grp.tracks.slice();
    }
  }
  const J = Math.max(1, s.judges), load = Array(J).fill(0);
  for (const g of groups) {
    let j = st.judgeOverride[g.id];
    if (j == null || j >= J) j = load.indexOf(Math.min(...load));
    g.judge = j;
    load[j] += g.tracks.length * (s.est[g.level] + s.changeover);
  }
  let nx = Math.max(0, ...tracks.map((t) => t.no || 0));
  tracks.forEach((t) => { if (!t.no) t.no = ++nx; });
  return { groups, tracks, T0: 0, NOW: -Infinity, firstLay: 0, lastEnd: 0 };
}
