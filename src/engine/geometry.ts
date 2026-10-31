import type { Pt } from './types';

export const D = Math.PI / 180;
export type BBox = [number, number, number, number];
export type Seg = [Pt, Pt];

export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function ptSeg(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

const orient = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** Proper intersection of two segments. */
export function segX(a: Pt, b: Pt, c: Pt, d: Pt) {
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/** Minimum distance between two segments (0 when they cross). */
export function segSeg(a: Pt, b: Pt, c: Pt, d: Pt) {
  if (segX(a, b, c, d)) return 0;
  return Math.min(ptSeg(a, c, d), ptSeg(b, c, d), ptSeg(c, a, b), ptSeg(d, a, b));
}

export function inPoly(p: Pt, poly: Pt[]) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) ins = !ins;
  }
  return ins;
}

export function polyArea(poly: Pt[]) {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return Math.abs(s / 2);
}

/** Compass bearing from a to b: 0 = north, 90 = east. */
export const bearingOf = (a: Pt, b: Pt) => ((Math.atan2(b[0] - a[0], b[1] - a[1]) / D) + 360) % 360;

const DIRS = ['צפון', 'צפון-מזרח', 'מזרח', 'דרום-מזרח', 'דרום', 'דרום-מערב', 'מערב', 'צפון-מערב'];
export const dirName = (b: number) => DIRS[Math.round((((b % 360) + 360) % 360) / 45) % 8];

export function bboxOf(pts: Pt[], pad = 0): BBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p[0] < x0) x0 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[0] > x1) x1 = p[0];
    if (p[1] > y1) y1 = p[1];
  }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}

export const bbHit = (a: BBox, b: BBox) => !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);

export function edgesOf(poly: Pt[]): Seg[] {
  const e: Seg[] = [];
  for (let i = 0; i < poly.length; i++) e.push([poly[i], poly[(i + 1) % poly.length]]);
  return e;
}

export function pathLen(P: Pt[]) {
  let L = 0;
  for (let i = 1; i < P.length; i++) L += dist(P[i - 1], P[i]);
  return L;
}

/** Point and unit tangent at distance sv along a polyline. */
export function pathAt(P: Pt[], sv: number): { p: Pt; T: Pt } {
  let acc = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const L = dist(P[i], P[i + 1]);
    if (sv <= acc + L || i === P.length - 2) {
      const T: Pt = [(P[i + 1][0] - P[i][0]) / L, (P[i + 1][1] - P[i][1]) / L];
      const d = sv - acc;
      return { p: [P[i][0] + T[0] * d, P[i][1] + T[1] * d], T };
    }
    acc += L;
  }
  return { p: P[0], T: [1, 0] };
}

/** Longest stretch of the line p0 + t·T that lies inside the polygon, inset 8 m at each end. */
export function clipLine(p0: Pt, T: Pt, poly: Pt[]): [Pt, Pt] | null {
  const ts: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length];
    const e: Pt = [B[0] - A[0], B[1] - A[1]];
    const den = T[0] * e[1] - T[1] * e[0];
    if (Math.abs(den) < 1e-9) continue;
    const w: Pt = [A[0] - p0[0], A[1] - p0[1]];
    const t = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * T[1] - w[1] * T[0]) / den;
    if (u >= 0 && u <= 1) ts.push(t);
  }
  ts.sort((a, b) => a - b);
  let best: [number, number] | null = null;
  for (let k = 0; k < ts.length - 1; k++) {
    const m = (ts[k] + ts[k + 1]) / 2;
    if (!inPoly([p0[0] + T[0] * m, p0[1] + T[1] * m], poly)) continue;
    if (!best || ts[k + 1] - ts[k] > best[1] - best[0]) best = [ts[k], ts[k + 1]];
  }
  if (!best || best[1] - best[0] < 40) return null;
  const a = best[0] + 8, b = best[1] - 8;
  return [[p0[0] + T[0] * a, p0[1] + T[1] * a], [p0[0] + T[0] * b, p0[1] + T[1] * b]];
}
