import { bboxOf, bearingOf, dist, inPoly, segSeg, type Seg } from './geometry';
import { clear, nearestOnPath, type Obstacle } from './field';
import { route, type Blocker } from './routing';
import { atPace, shapeSegs } from './shapes';
import type { CrossTrack, Pt, TrackGeo, TrialState } from './types';
import { rand, rnd } from './util';

/**
 * One straight cross track that crosses two inner legs once each: never the first or last leg,
 * 40+ paces from corners, 20+ from articles, at 45° or more. Both ends must be reachable from the
 * access path, and leavable toward it, without stepping over any track.
 */
export function genCross(st: TrialState, sh: TrackGeo, field: Pt[], obs: Obstacle[], pathSegs: Seg[]): CrossTrack[] | null {
  const s = st.settings, p = s.pace, L = sh.legs;
  const elig: number[] = [];
  for (let i = 1; i < L.length - 1; i++) if (L[i].type === 'line' && L[i].paces >= 95) elig.push(i);
  if (elig.length < 2) return null;
  const own = shapeSegs(sh);
  const legDir = (i: number): Pt => {
    const a = atPace(sh, L[i].start), b = atPace(sh, L[i].start + L[i].paces);
    const d = dist(a, b);
    return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
  };
  const pick = (i: number) => {
    for (let k = 0; k < 20; k++) {
      const x = Math.round(rnd(L[i].start + 40, L[i].start + L[i].paces - 40));
      if (sh.articles.every((a) => Math.abs(a.pace - x) >= 20)) return x;
    }
    return null;
  };
  interface Cand { A: Pt; B: Pt; i: number; j: number; pi: number; pj: number; P1: Pt; P2: Pt; e1: number; e2: number }
  const cands: Cand[] = [];
  for (let at = 0; at < 260 && cands.length < 8; at++) {
    const i = elig[Math.floor(rand() * elig.length)], j = elig[Math.floor(rand() * elig.length)];
    if (i === j) continue;
    const pi = pick(i), pj = pick(j);
    if (pi == null || pj == null) continue;
    const P1 = atPace(sh, pi), P2 = atPace(sh, pj);
    const d = dist(P1, P2);
    if (d < 25) continue;
    const u: Pt = [(P2[0] - P1[0]) / d, (P2[1] - P1[1]) / d];
    const sinA = (v: Pt) => Math.abs(u[0] * v[1] - u[1] * v[0]);
    if (sinA(legDir(i)) < 0.7 || sinA(legDir(j)) < 0.7) continue;
    const e1 = rnd(15, Math.max(16, s.crossExt)), e2 = rnd(15, Math.max(16, s.crossExt));
    const A: Pt = [P1[0] - u[0] * e1, P1[1] - u[1] * e1], B: Pt = [P2[0] + u[0] * e2, P2[1] + u[1] * e2];
    if (!inPoly(A, field) || !inPoly(B, field)) continue;
    if (pathSegs.some((e) => segSeg(A, B, e[0], e[1]) < 4)) continue;
    let bad = false;
    for (const g of own) {
      if (g[2] === i || g[2] === j) continue;
      if (segSeg(A, B, g[0], g[1]) < s.crossClear) { bad = true; break; }
    }
    if (bad) continue;
    if (!clear([[A, B]], bboxOf([A, B]), obs, s.crossClear, 8)) continue;
    cands.push({ A, B, i, j, pi, pj, P1, P2, e1, e2 });
  }
  if (!cands.length) return null;
  // access check: a walking route from the path to each end, around every track
  const blockers: Blocker[] = own.map((g) => [g[0], g[1], s.walkBuf]);
  for (const o of obs) if (o.kind === 'track') for (const g of o.segs) blockers.push([g[0], g[1], s.walkBuf]);
  let best: { c: Cand; la: number; lb: number } | null = null;
  for (const c of cands.slice(0, 5)) {
    const pa = nearestOnPath(st, c.A), pb = nearestOnPath(st, c.B);
    if (!pa || !pb) continue;
    const ra = route(st, pa, c.A, blockers, null);
    if (!ra || ra.blocked) continue;
    const rb = route(st, c.B, pb, blockers, null);
    if (!rb || rb.blocked) continue;
    if (!best || ra.len + rb.len < best.la + best.lb) best = { c, la: ra.len, lb: rb.len };
  }
  if (!best) return null;
  let { A, B, i, j, pi, pj, P1, P2, e1, e2 } = best.c;
  // A is the end with the shorter walk from the path
  if (best.lb < best.la) {
    [A, B] = [B, A]; [i, j] = [j, i]; [pi, pj] = [pj, pi]; [P1, P2] = [P2, P1]; [e1, e2] = [e2, e1];
  }
  const tot = dist(A, B);
  return [{
    a: A, b: B, bearing: bearingOf(A, B), paces: Math.round(tot / p),
    cx: [
      { leg: i, pace: pi, cp: P1, atPace: Math.round(e1 / p) },
      { leg: j, pace: pj, cp: P2, atPace: Math.round((tot - e2) / p) },
    ],
  }];
}
