import { bbHit, bboxOf, clipLine, dist, edgesOf, inPoly, polyArea, ptSeg, segSeg, type BBox, type Seg } from './geometry';
import { footprint, shapeSegs } from './shapes';
import type { Pt, Settings, TrackGeo, TrialState } from './types';

export const fieldsOf = (st: TrialState) => (st.map.fields || []).filter((f) => f && f.length > 2);
export const hasField = (st: TrialState) => fieldsOf(st).length > 0;
export const allFieldPts = (st: TrialState) => fieldsOf(st).flat();
export const totalArea = (st: TrialState) => fieldsOf(st).reduce((a, f) => a + polyArea(f), 0);

/** Depth a lane needs from the path for the deepest level entered. */
export function needDepth(st: TrialState) {
  const s = st.settings;
  const lv = [...new Set(st.competitors.map((c) => c.level))];
  if (!lv.length) return 150;
  return Math.max(...lv.map((k) => footprint(k, s).d)) + s.setback + s.edge;
}

export interface AccessPath { pts: Pt[]; auto: boolean; fi: number; pi?: number }

const pathsCache: Record<string, { pts: Pt[]; auto: true }[]> = {};
/**
 * Automatic access paths for a field, parallel to its longest side:
 * one path along the edge for a shallow field, or paths with lanes on both sides spaced so the field's depth is used.
 */
export function autoPaths(st: TrialState, f: Pt[]) {
  const key = JSON.stringify(f) + '|' + needDepth(st) + '|' + st.settings.sep;
  if (pathsCache[key]) return pathsCache[key];
  let bi = 0, bl = 0;
  for (let i = 0; i < f.length; i++) {
    const l = dist(f[i], f[(i + 1) % f.length]);
    if (l > bl) { bl = l; bi = i; }
  }
  const a = f[bi], b = f[(bi + 1) % f.length];
  const c: Pt = [f.reduce((x, q) => x + q[0], 0) / f.length, f.reduce((x, q) => x + q[1], 0) / f.length];
  const T: Pt = [(b[0] - a[0]) / bl, (b[1] - a[1]) / bl];
  let N: Pt = [-T[1], T[0]];
  if (N[0] * (c[0] - a[0]) + N[1] * (c[1] - a[1]) < 0) N = [-N[0], -N[1]];
  const Dd = Math.max(...f.map((q) => (q[0] - a[0]) * N[0] + (q[1] - a[1]) * N[1]));
  const M = needDepth(st);
  const offs: number[] = [];
  if (Dd < 1.7 * M) offs.push(15);
  else for (let v = Math.min(M, Dd / 2); v + 0.55 * M <= Dd + 1; v += 2 * M + st.settings.sep) offs.push(v);
  const v = offs
    .map((o) => {
      const seg = clipLine([a[0] + N[0] * o, a[1] + N[1] * o], T, f);
      return seg ? { pts: seg as Pt[], auto: true as const } : null;
    })
    .filter((x): x is { pts: Pt[]; auto: true } => !!x);
  return (pathsCache[key] = v);
}

/** A drawn path belongs to the field it runs through, or to the nearest field. -1 when there is no field. */
export function pathField(st: TrialState, pp: Pt[]) {
  const F = st.map.fields || [];
  let best = -1, bd = Infinity;
  F.forEach((f, i) => {
    if (!f || f.length < 3) return;
    const E = edgesOf(f);
    const d = pp.some((q) => inPoly(q, f)) ? 0 : Math.min(...pp.map((q) => Math.min(...E.map((e) => ptSeg(q, e[0], e[1])))));
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

/** Every access path, tagged with its field: the drawn ones, or automatic ones for a field that has none. */
export function getPaths(st: TrialState): AccessPath[] {
  const m = st.map;
  const out: AccessPath[] = [];
  (m.fields || []).forEach((f, fi) => {
    if (!f || f.length < 3) return;
    const drawn = (m.paths || []).map((p, pi) => ({ p, pi })).filter((x) => x.p && x.p.length >= 2 && pathField(st, x.p) === fi);
    if (drawn.length) drawn.forEach((x) => out.push({ pts: x.p, auto: false, fi, pi: x.pi }));
    else autoPaths(st, f).forEach((P) => out.push({ ...P, fi }));
  });
  return out;
}

export function nearestOnPath(st: TrialState, q: Pt | null): Pt | null {
  const PS = getPaths(st);
  if (!PS.length || !q) return null;
  let best: Pt | null = null, bd = Infinity;
  for (const P of PS)
    for (let i = 0; i < P.pts.length - 1; i++) {
      const a = P.pts[i], b = P.pts[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const L2 = dx * dx + dy * dy;
      let t = L2 ? ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const pp: Pt = [a[0] + t * dx, a[1] + t * dy];
      const d = dist(pp, q);
      if (d < bd) { bd = d; best = pp; }
    }
  return best;
}

/** Track starts inside the field and every segment keeps `edge` metres from the boundary. */
export function fieldOK(sh: TrackGeo, s: Settings, field: Pt[], fieldEdges: Seg[]) {
  if (!inPoly(sh.pts[0], field)) return false;
  for (const g of shapeSegs(sh)) for (const e of fieldEdges) if (segSeg(g[0], g[1], e[0], e[1]) < s.edge) return false;
  return true;
}

export interface Obstacle { kind: 'track' | 'cross'; segs: Seg[]; bb: BBox }

/** Segments keep `needTrack` metres from placed tracks and `needCross` from placed cross tracks. */
export function clear(segs: [Pt, Pt, ...unknown[]][], bb: BBox, obs: Obstacle[], needTrack: number, needCross: number) {
  for (const o of obs) {
    const need = o.kind === 'track' ? needTrack : needCross;
    if (need <= 0) continue;
    if (!bbHit([bb[0] - need, bb[1] - need, bb[2] + need, bb[3] + need], o.bb)) continue;
    for (const g of segs) for (const h of o.segs) if (segSeg(g[0], g[1], h[0], h[1]) < need) return false;
  }
  return true;
}

export { bboxOf };
