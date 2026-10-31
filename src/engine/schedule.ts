import { dist } from './geometry';
import { nearestOnPath } from './field';
import type { Model, Pt, Track, TrialState } from './types';
import { hm, nowMin } from './util';

/**
 * Times every track: laying, cross track and the dog's start.
 *
 * Each track is laid just in time for its own dog: laying ends at (dog's start - minimum aging), so tracks become
 * ready one by one at the judge's pace. Tracks of one group are laid one after another, never at the same time,
 * and all of them before the group's draw. Recorded actual times are fixed; in live mode nothing pending is
 * scheduled before now. `now` is injectable for tests.
 */
export function schedule(st: TrialState, M: Model, now = Date.now()): Model {
  const s = st.settings, T0 = hm(s.start), NOW = st.live ? nowMin(s.date, now) : -Infinity, START = Math.max(T0, NOW);
  const spd = (s.walkKmh * 1000) / 60, base = st.map.base;
  const W = (a: Pt | null | undefined, b: Pt | null | undefined) => (a && b ? (dist(a, b) * s.detour) / spd : 3);
  const pins = st.pins || {};
  for (const t of M.tracks) {
    const lv = t.lv;
    t.aging = Math.max(lv.aging, +s.aging[t.level] || 0);
    t.layDur = lv.paces / s.layRate + lv.articles * 0.3 + 1.5;
    t.est = +s.est[t.level] || lv.est;
    t.pool = lv.own ? 'own' : 'lay';
    t.S = t.geo ? t.geo.pts[0] : null;
    t.E = t.geo ? t.geo.tail[1] : null;
    t.crossRes = 0;
    const a = t.act;
    if (a.le != null) { t.layStart = a.ls!; t.layEnd = a.le; t.res = a.res ?? 0; }
    else if (a.ls != null) { t.layStart = a.ls; t.layEnd = Math.max(a.ls + t.layDur, NOW); t.res = a.res ?? 0; }
    else { t.layStart = START + W(base, t.S); t.layEnd = t.layStart + t.layDur; t.res = 0; }
  }
  const pools = { lay: Math.max(1, s.layers), own: Math.max(1, s.ownParallel) };
  type Key = keyof typeof pools;
  const KEYS: Key[] = ['lay', 'own'];

  function avail(key: Key) {
    const n = pools[key];
    const R = Array.from({ length: n }, () => ({ t: START, loc: base as Pt | null }));
    for (const t of M.tracks) {
      if (t.pool !== key || t.act.ls == null) continue;
      const r = R[Math.min(t.res || 0, n - 1)];
      if (t.layEnd > r.t) { r.t = t.layEnd; r.loc = t.E; }
    }
    return R;
  }

  function judgePass() {
    for (const g of M.groups) {
      g.layMin = Math.min(...g.tracks.map((t) => t.layStart));
      g.layMax = Math.max(...g.tracks.map((t) => t.layEnd));
      g.gate = g.noDraw ? -Infinity : g.layMax + s.drawBuf;
    }
    const J = Math.max(1, s.judges);
    const seq: Track[][] = [];
    for (let j = 0; j < J; j++) seq.push(M.groups.filter((g) => g.judge === j).flatMap((g) => g.seq));
    const jf = Array(J).fill(T0), jl: (Pt | null)[] = Array(J).fill(null), ptr = Array(J).fill(0);
    const CL = Array.from({ length: Math.max(1, s.crossLayers) }, () => ({ t: START, loc: base as Pt }));
    const cand0 = (t: Track, j: number) => {
      const g = t.group;
      let e = jf[j] + (jl[j] ? s.changeover + W(jl[j], t.S) : 0);
      e = Math.max(e, t.layEnd + t.aging, NOW, T0);
      if (t === g.seq[0]) e = Math.max(e, g.gate);
      return e;
    };
    const cand = (t: Track, j: number) => {
      if (t.act.js != null) return t.act.js;
      const pn = pins[t.id];
      return pn != null ? Math.max(pn, cand0(t, j)) : cand0(t, j);
    };
    for (;;) {
      let bj = -1, be = Infinity;
      for (let j = 0; j < J; j++) {
        if (ptr[j] >= seq[j].length) continue;
        const e = cand(seq[j][ptr[j]], j);
        if (e < be) { be = e; bj = j; }
      }
      if (bj < 0) break;
      const t = seq[bj][ptr[bj]++];
      let e = be;
      t.judge = bj;
      t.crossT = null;
      if (t.lv.cross) {
        const c = (t.geo && t.geo.cross && t.geo.cross[0]) || null;
        const lc = (c ? c.paces : 100) / s.layRate + 0.5;
        if (t.act.cs != null) t.crossT = [{ s: t.act.cs - lc, e: t.act.cs, done: true }];
        else if (t.act.js == null) {
          // the cross track is laid about 30 minutes before the dog starts
          let bl = 0, bestE = Infinity;
          for (let l = 0; l < CL.length; l++) {
            const d1 = W(CL[l].loc, c ? c.a : null) + lc;
            const ee = Math.max(e, CL[l].t + d1 + 30, t.layEnd + 5 + d1 + 30);
            if (ee < bestE) { bestE = ee; bl = l; }
          }
          e = bestE;
          const e1 = e - 30;
          t.crossT = [{ s: e1 - lc, e: e1 }];
          t.crossRes = bl;
          const ex = c ? nearestOnPath(st, c.b) : null;
          CL[bl].t = e1 + (ex && c ? W(c.b, ex) : 1);
          CL[bl].loc = ex || CL[bl].loc;
        }
      }
      t.start = e;
      t.end = t.act.je != null ? t.act.je : t.act.js != null ? Math.max(t.act.js + t.est, NOW) : e + t.est;
      jf[bj] = t.end;
      jl[bj] = t.E || t.S;
    }
    for (const g of M.groups) g.firstStart = Math.min(...g.tracks.map((t) => t.start));
  }

  function deadlineOf(t: Track) {
    const g = t.group;
    if (g.noDraw) return t.start - t.aging;
    return Math.min(t.start - t.aging, g.firstStart - s.drawBuf);
  }

  /** Latest-possible laying, working back from each dog's start. False when it cannot all fit after the start time. */
  function backward() {
    for (const key of KEYS) {
      const jobs = M.tracks.filter((t) => t.pool === key && t.act.ls == null);
      if (!jobs.length) continue;
      const n = pools[key];
      const av = avail(key);
      jobs.forEach((t) => (t.deadline = deadlineOf(t)));
      jobs.sort((a, b) => b.deadline - a.deadline || b.slot - a.slot);
      const R = Array.from({ length: n }, () => ({ fb: Infinity, nl: null as Pt | null }));
      const GF: Record<string, number> = {};
      for (const t of jobs) {
        const gf = GF[t.group.id] ?? Infinity;
        let best = 0, bestEnd = -Infinity;
        for (let l = 0; l < n; l++) {
          const e = Math.min(t.deadline, gf - 0.5, R[l].fb - (R[l].nl && key === 'lay' ? W(t.E, R[l].nl) : 0));
          if (e > bestEnd + 1e-9) { bestEnd = e; best = l; }
        }
        t.layEnd = bestEnd;
        t.layStart = bestEnd - t.layDur;
        t.res = best;
        R[best].fb = t.layStart;
        R[best].nl = t.S;
        GF[t.group.id] = Math.min(gf, t.layStart);
      }
      for (const t of jobs) if (t.layStart < START + W(base, t.S) - 0.01) return false;
      for (let l = 0; l < n; l++) {
        const mine = jobs.filter((t) => t.res === l);
        if (!mine.length) continue;
        const f = mine.reduce((a, b) => (a.layStart < b.layStart ? a : b));
        if (f.layStart < av[l].t + (key === 'lay' ? W(av[l].loc, f.S) : 0) - 0.01) return false;
      }
    }
    return true;
  }

  /** Earliest-possible laying in deadline order. */
  function forward() {
    for (const key of KEYS) {
      const jobs = M.tracks.filter((t) => t.pool === key && t.act.ls == null);
      if (!jobs.length) continue;
      const R = avail(key);
      const GE: Record<string, number> = {};
      for (const t of M.tracks) if (t.pool === key && t.act.ls != null) GE[t.group.id] = Math.max(GE[t.group.id] ?? -Infinity, t.layEnd);
      jobs.forEach((t) => (t.deadline = deadlineOf(t)));
      jobs.sort((a, b) => a.deadline - b.deadline || a.group.order - b.group.order || a.slot - b.slot);
      for (const t of jobs) {
        let best = 0, bt = Infinity;
        const ge = (GE[t.group.id] ?? -Infinity) + 0.5;
        for (let l = 0; l < R.length; l++) {
          const stt = Math.max(R[l].t + (key === 'lay' ? W(R[l].loc, t.S) : 0), START + W(base, t.S), ge);
          if (stt < bt) { bt = stt; best = l; }
        }
        t.layStart = bt;
        t.layEnd = bt + t.layDur;
        t.res = best;
        R[best].t = t.layEnd;
        R[best].loc = t.E;
        GE[t.group.id] = t.layEnd;
      }
    }
  }

  judgePass();
  let ok = backward();
  for (let it = 0; it < 5 && !ok; it++) { forward(); judgePass(); ok = backward(); }
  if (!ok) forward();
  else {
    // compaction: pull laying earlier where the judge would otherwise wait, then re-time it just in time
    const keys = ['layStart', 'layEnd', 'res', 'start', 'end', 'crossT', 'crossRes', 'judge'] as const;
    const take = () => M.tracks.map((t) => keys.map((k) => t[k]));
    const restore = (sn: unknown[][]) => M.tracks.forEach((t, i) => keys.forEach((k, j) => ((t as unknown as Record<string, unknown>)[k] = sn[i][j])));
    const lastEnd = () => Math.max(...M.tracks.map((t) => t.end));
    const idle = () => M.tracks.reduce((a, t) => a + t.start, 0);
    for (let k = 0; k < 3; k++) {
      const sn = take(), le = lastEnd(), id = idle();
      forward();
      judgePass();
      const ok2 = backward();
      if (!ok2 || lastEnd() > le + 0.5 || (lastEnd() > le - 0.5 && idle() >= id - 1)) { restore(sn); break; }
    }
  }
  judgePass();
  for (const t of M.tracks) { t.age = t.start - t.layEnd; t.excess = t.age - t.aging; }
  M.T0 = T0;
  M.NOW = NOW;
  M.firstLay = Math.min(...M.tracks.map((t) => t.layStart));
  M.lastEnd = Math.max(...M.tracks.map((t) => t.end));
  return M;
}
