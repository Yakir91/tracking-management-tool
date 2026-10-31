import { bboxOf, dist, ptSeg } from './geometry';
import { allFieldPts } from './field';
import type { Pt, Route, TrialState } from './types';

/** Segment to keep away from while walking: [a, b, buffer metres]. */
export type Blocker = [Pt, Pt, number];

interface Grid { key: string; x0: number; y0: number; c: number; nx: number; ny: number }
let gridCache: Grid | null = null;
const routeCache = new Map<string, Route>();

function getGrid(st: TrialState): Grid {
  const f = allFieldPts(st).concat((st.map.paths || []).flat());
  const key = JSON.stringify(st.map.fields) + JSON.stringify(st.map.base) + st.settings.walkBuf + st.map.mode + JSON.stringify(st.map.origin);
  if (gridCache && gridCache.key === key) return gridCache;
  const bb = bboxOf([...f, st.map.base], 70);
  const c = Math.max(3, Math.max(bb[2] - bb[0], bb[3] - bb[1]) / 340);
  const nx = Math.ceil((bb[2] - bb[0]) / c), ny = Math.ceil((bb[3] - bb[1]) / c);
  gridCache = { key, x0: bb[0], y0: bb[1], c, nx, ny };
  routeCache.clear();
  return gridCache;
}

/**
 * Walking route from P to Q (A* on a grid) that keeps clear of the given segments.
 * `tag` identifies the obstacle set for caching; pass null to skip the cache.
 */
export function route(st: TrialState, P: Pt | null, Q: Pt | null, obstacles: Blocker[], tag: string | null): Route | null {
  if (!P || !Q) return null;
  const G = getGrid(st);
  const key = [P, Q].map((p) => p.map((v) => Math.round(v)).join(',')).join('>') + '|' + tag;
  if (tag != null && routeCache.has(key)) return routeCache.get(key)!;
  const { x0, y0, c, nx, ny } = G;
  const blk = new Uint8Array(nx * ny);
  for (const [a, b, buf] of obstacles) {
    const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - buf - x0) / c)), i1 = Math.min(nx - 1, Math.ceil((Math.max(a[0], b[0]) + buf - x0) / c));
    const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - buf - y0) / c)), j1 = Math.min(ny - 1, Math.ceil((Math.max(a[1], b[1]) + buf - y0) / c));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (ptSeg([x0 + (i + 0.5) * c, y0 + (j + 0.5) * c], a, b) < buf) blk[j * nx + i] = 1;
  }
  const cell = (p: Pt) => [Math.max(0, Math.min(nx - 1, Math.floor((p[0] - x0) / c))), Math.max(0, Math.min(ny - 1, Math.floor((p[1] - y0) / c)))];
  // the start and goal sit on tracks, so free a small disc around them
  const rr = Math.ceil((st.settings.walkBuf + 4) / c);
  for (const p of [P, Q]) {
    const [ci, cj] = cell(p);
    for (let j = cj - rr; j <= cj + rr; j++)
      for (let i = ci - rr; i <= ci + rr; i++) if (i >= 0 && j >= 0 && i < nx && j < ny && (i - ci) ** 2 + (j - cj) ** 2 <= rr * rr) blk[j * nx + i] = 0;
  }
  const [si, sj] = cell(P), [ti, tj] = cell(Q);
  const N = nx * ny;
  const g = new Float32Array(N).fill(Infinity);
  const par = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap: [number, number][] = [];
  const push = (k: number, f: number) => {
    heap.push([f, k]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const hfn = (i: number, j: number) => {
    const dx = Math.abs(i - ti), dy = Math.abs(j - tj);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  const s0 = sj * nx + si, tg = tj * nx + ti;
  g[s0] = 0;
  push(s0, hfn(si, sj));
  let found = false, iter = 0;
  while (heap.length && iter++ < 400000) {
    const [, k] = pop();
    if (closed[k]) continue;
    closed[k] = 1;
    if (k === tg) { found = true; break; }
    const i = k % nx, j = (k / nx) | 0;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
        const nk = nj * nx + ni;
        if (blk[nk] || closed[nk]) continue;
        if (di && dj && (blk[j * nx + ni] || blk[nj * nx + i])) continue;
        const ng = g[k] + (di && dj ? Math.SQRT2 : 1);
        if (ng < g[nk]) { g[nk] = ng; par[nk] = k; push(nk, ng + hfn(ni, nj)); }
      }
  }
  let res: Route;
  if (!found) res = { path: [P, Q], len: dist(P, Q), blocked: true };
  else {
    const cells: number[] = [];
    for (let k = tg; k !== -1; k = par[k]) cells.push(k);
    cells.reverse();
    const pts: Pt[] = cells.map((k) => [x0 + ((k % nx) + 0.5) * c, y0 + (((k / nx) | 0) + 0.5) * c]);
    pts[0] = P;
    pts[pts.length - 1] = Q;
    // string pulling: keep only the turns that line of sight needs
    const los = (a: Pt, b: Pt) => {
      const L = dist(a, b), n = Math.ceil(L / (c * 0.5));
      for (let q = 1; q < n; q++) {
        const x = a[0] + ((b[0] - a[0]) * q) / n, y = a[1] + ((b[1] - a[1]) * q) / n;
        const ii = Math.floor((x - x0) / c), jj = Math.floor((y - y0) / c);
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        if (blk[jj * nx + ii]) return false;
      }
      return true;
    };
    const out: Pt[] = [pts[0]];
    let a = 0;
    while (a < pts.length - 1) {
      let b = pts.length - 1;
      while (b > a + 1 && !los(pts[a], pts[b])) b--;
      out.push(pts[b]);
      a = b;
    }
    let len = 0;
    for (let q = 1; q < out.length; q++) len += dist(out[q - 1], out[q]);
    res = { path: out, len, blocked: false };
  }
  if (tag != null) {
    if (routeCache.size > 600) routeCache.clear();
    routeCache.set(key, res);
  }
  return res;
}
