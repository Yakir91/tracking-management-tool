import { D, segSeg } from './geometry';
import { LEVELS } from './levels';
import type { Article, Level, LevelKey, Pt, Settings, TrackGeo } from './types';
import { rnd, rand } from './util';

/** A leg in the lane frame: headings 0 = into the field, 90 = along the path, 180 = back toward the path. */
interface LaneLeg { type: 'line' | 'semi'; paces: number; hIn: number; hOut: number; start: number }
interface LaneCorner { interior: number; acute: boolean; pace: number; pt: Pt }
export interface LaneShape {
  pts: Pt[];
  pp: number[];
  segLeg: number[];
  legs: LaneLeg[];
  corners: LaneCorner[];
  tail: [Pt, Pt];
  total: number;
  articles: Article[];
  maxU: number;
}
type Shapeish = { pts: Pt[]; pp: number[]; segLeg: number[]; tail: [Pt, Pt]; legs: { length: number } };

/** Segments of a track (with the leg index), the exit tail counted as one more leg. */
export function shapeSegs(sh: Shapeish): [Pt, Pt, number][] {
  const out: [Pt, Pt, number][] = [];
  for (let k = 0; k < sh.pts.length - 1; k++) out.push([sh.pts[k], sh.pts[k + 1], sh.segLeg[k]]);
  out.push([sh.tail[0], sh.tail[1], sh.legs.length]);
  return out;
}

export function atPace(sh: { pts: Pt[]; pp: number[] }, pace: number): Pt {
  const pp = sh.pp;
  for (let k = 0; k < pp.length - 1; k++) {
    if (pace <= pp[k + 1] + 1e-9) {
      const f = (pace - pp[k]) / (pp[k + 1] - pp[k] || 1);
      const a = sh.pts[k], b = sh.pts[k + 1];
      return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])];
    }
  }
  const last = sh.pts[sh.pts.length - 1];
  return [last[0], last[1]];
}

export function legAtPace(sh: { legs: { start: number }[] }, pace: number) {
  for (let i = sh.legs.length - 1; i >= 0; i--) if (pace >= sh.legs[i].start - 1e-9) return i;
  return 0;
}

const vec = (h: number): Pt => [Math.sin(h * D), Math.cos(h * D)];
const n360 = (x: number) => ((x % 360) + 360) % 360;

/**
 * Random track shape for one level, in the lane frame (u along the path, v into the field).
 * Keeping every heading in [0,180] makes the track move only forward along the path, so neighbouring lanes never interleave.
 * The track starts `setback` metres from the path and its last leg returns toward the path.
 */
export function laneShape(lv: Level, s: Settings, dmax = Infinity, latMax = 130, tries = 2500): LaneShape | null {
  const p = s.pace, L = lv.legs, nC = L - 1, MIN = 55;
  for (let tr = 0; tr < tries; tr++) {
    let semiIdx = -1, semiP = 0;
    if (lv.semi) {
      semiIdx = 1 + Math.floor(rand() * (L - 2));
      semiP = Math.round((Math.PI * s.semiR) / p);
    }
    const acute = new Set<number>();
    if (lv.acute) {
      if (lv.acuteLast) acute.add(nC - 1);
      else {
        let g = 0;
        while (acute.size < lv.acute && g++ < 80) {
          const c = Math.floor(rand() * nC);
          if (acute.has(c - 1) || acute.has(c + 1)) continue;
          acute.add(c);
        }
      }
    }
    let h = 0, ok = true, lastDepth = 0;
    const legs: LaneLeg[] = [];
    const corners: { interior: number; acute: boolean }[] = [];
    for (let i = 0; i < L && ok; i++) {
      if (i > 0) {
        const isA = acute.has(i - 1);
        const interior = isA ? rnd(32, 58) : 90;
        const turn = isA ? 180 - interior : 90;
        const all = [n360(h + turn), n360(h - turn)].map((x) => (x > 359.5 ? 0 : x));
        const inr = all.filter((x) => x >= -0.5 && x <= 180.5);
        let c = inr.length ? inr : isA ? all : [];
        if (i === semiIdx) c = c.filter((x) => x < 1 || Math.abs(x - 180) < 1);
        if (i === L - 1) c = c.filter((x) => Math.cos(x * D) < -0.3);
        if (!c.length) { ok = false; break; }
        // serpentine: after a leg along the path, usually head the opposite way in depth, which keeps the lane compact
        const opp = c.filter((x) => (lastDepth === 0 && Math.abs(x - 180) < 1) || (lastDepth === 180 && x < 1));
        const pool = opp.length && rand() < 0.85 ? opp : c;
        h = pool[Math.floor(rand() * pool.length)];
        corners.push({ interior: Math.round(interior), acute: isA });
      }
      if (h < 1) lastDepth = 0;
      else if (Math.abs(h - 180) < 1) lastDepth = 180;
      if (i === semiIdx) {
        legs.push({ type: 'semi', paces: semiP, hIn: h, hOut: h < 1 ? 180 : 0, start: 0 });
        h = h < 1 ? 180 : 0;
        lastDepth = h;
      } else legs.push({ type: 'line', paces: 0, hIn: h, hOut: h, start: 0 });
    }
    if (!ok) continue;
    // compact lanes: legs along the path stay short, legs into the field take the length
    const line = legs.map((l, i) => (l.type === 'line' ? i : -1)).filter((i) => i >= 0);
    const a = L - 1;
    const cs = (i: number) => Math.cos(legs[i].hIn * D);
    const cands = line.filter((i) => i !== a && cs(i) > 0.7);
    if (!cands.length) continue;
    const b = cands[Math.floor(rand() * cands.length)];
    const P = lv.paces - semiP;
    let So = 0, Do = 0;
    for (const i of line) {
      if (i === a || i === b) continue;
      const c = Math.abs(cs(i));
      legs[i].paces = c < 0.3 ? Math.round(rnd(60, latMax)) : Math.max(MIN, Math.round((P / line.length) * rnd(0.6, 1.3)));
      So += legs[i].paces;
      Do += legs[i].paces * cs(i);
    }
    // the last leg and one inbound leg are solved so the total is exact and the track ends near the path
    const vStart = s.setback, vEnd = s.setback + rnd(0, 6);
    const Dt = (vEnd - vStart) / p;
    const ca = Math.cos(legs[a].hIn * D), cb = Math.cos(legs[b].hIn * D);
    const La = Math.round((Dt - Do - cb * (P - So)) / (ca - cb));
    const Lb = P - So - La;
    if (La < MIN || Lb < MIN) continue;
    legs[a].paces = La;
    legs[b].paces = Lb;
    // build points
    let cur: Pt = [0, vStart];
    const pts: Pt[] = [[cur[0], cur[1]]], pp = [0], segLeg: number[] = [];
    const fullCorners: LaneCorner[] = [];
    let cum = 0;
    legs.forEach((leg, i) => {
      leg.start = cum;
      if (i > 0) fullCorners.push({ ...corners[i - 1], pace: cum, pt: [cur[0], cur[1]] });
      const f = vec(leg.hIn);
      if (leg.type === 'semi') {
        const sd = leg.hIn < 1 ? 1 : -1;
        const r: Pt = [Math.cos(leg.hIn * D), -Math.sin(leg.hIn * D)];
        const R = s.semiR;
        const C: Pt = [cur[0] + sd * r[0] * R, cur[1] + sd * r[1] * R];
        const N = 18;
        for (let k = 1; k <= N; k++) {
          const ph = (Math.PI * k) / N;
          pts.push([C[0] + R * (-sd * r[0] * Math.cos(ph) + f[0] * Math.sin(ph)), C[1] + R * (-sd * r[1] * Math.cos(ph) + f[1] * Math.sin(ph))]);
          pp.push(cum + (leg.paces * k) / N);
          segLeg.push(i);
        }
        const last = pts[pts.length - 1];
        cur = [last[0], last[1]];
      } else {
        cur = [cur[0] + f[0] * leg.paces * p, cur[1] + f[1] * leg.paces * p];
        pts.push([cur[0], cur[1]]);
        pp.push(cum + leg.paces);
        segLeg.push(i);
      }
      cum += leg.paces;
    });
    const fe = vec(legs[a].hOut);
    const tail: [Pt, Pt] = [[cur[0], cur[1]], [cur[0] + fe[0] * 10 * p, cur[1] + fe[1] * 10 * p]];
    if (pts.some((q) => q[1] < s.setback * 0.6 || q[0] < -1) || tail[1][1] < 1) continue;
    const lim = 0.24 * lv.paces * p + 70;
    if (Math.max(...pts.map((q) => q[0])) > lim + (latMax - 130) * 2.5 || Math.max(...pts.map((q) => q[1])) > Math.min(lim + 40, dmax)) continue;
    const sh: LaneShape = { pts, pp, segLeg, legs, corners: fullCorners, tail, total: cum, articles: [], maxU: Math.max(...pts.map((q) => q[0]), tail[1][0]) };
    // legs that are not neighbours keep a minimum distance, so the dog cannot cut across
    const sg = shapeSegs(sh);
    let bad = false;
    for (let x = 0; x < sg.length && !bad; x++)
      for (let y = x + 1; y < sg.length; y++) {
        if (Math.abs(sg[x][2] - sg[y][2]) >= 2 && segSeg(sg[x][0], sg[x][1], sg[y][0], sg[y][1]) < s.intraSep) { bad = true; break; }
      }
    if (bad) continue;
    if (!placeArticles(sh, lv)) continue;
    return sh;
  }
  return null;
}

/** Article positions per level; never within 20 paces of a corner or on the semicircle. */
export function placeArticles(sh: LaneShape, lv: Level) {
  const T = sh.total;
  const cps = sh.corners.map((c) => c.pace);
  const ok = (x: number) => x >= 30 && x <= T - 20 && cps.every((c) => Math.abs(c - x) >= 20) && sh.legs[legAtPace(sh, x)].type !== 'semi';
  const pick = (lo: number, hi: number, avoid: number[] = []) => {
    lo = Math.ceil(lo);
    hi = Math.floor(hi);
    if (hi < lo) return null;
    for (let i = 0; i < 60; i++) {
      const x = Math.round(rnd(lo, hi));
      if (ok(x) && avoid.every((a) => Math.abs(a - x) >= 35)) return x;
    }
    return null;
  };
  const L = sh.legs;
  let arr: number[] = [];
  if (lv.art === 'fpr12') {
    const a1 = pick(L[0].start, L[0].start + L[0].paces);
    const a2 = a1 == null ? null : pick(L[1].start, L[1].start + L[1].paces, [a1]);
    if (a1 == null || a2 == null) return false;
    arr = [a1, a2, T];
  } else if (lv.art === 'fpr3') {
    const a1 = pick(100, L[1].start + L[1].paces);
    if (a1 == null) return false;
    const a2 = pick(a1 + 40, T - 40, [a1]);
    if (a2 == null) return false;
    arr = [a1, a2, T];
  } else {
    const n = lv.articles;
    const a1 = pick(100, Math.min(T * 0.3 + 100, T - 60));
    if (a1 == null) return false;
    arr = [a1];
    const lo = a1 + 40, hi = T - 40, m = n - 2, bw = (hi - lo) / m;
    for (let k = 0; k < m; k++) {
      const x = pick(lo + k * bw, lo + (k + 1) * bw, arr);
      if (x == null) return false;
      arr.push(x);
    }
    arr.push(T);
  }
  sh.articles = arr.map((x, i) => ({ pace: x, pt: atPace(sh, x), n: i + 1 }));
  return true;
}

/** Map a lane-frame shape onto the field: origin O on the path, T along the path, N into the field. */
export function toWorld(sh: LaneShape, O: Pt, T: Pt, N: Pt): TrackGeo {
  const w = (q: Pt): Pt => [O[0] + T[0] * q[0] + N[0] * q[1], O[1] + T[1] * q[0] + N[1] * q[1]];
  const wv = (h: number): Pt => {
    const f = vec(h);
    return [T[0] * f[0] + N[0] * f[1], T[1] * f[0] + N[1] * f[1]];
  };
  const brg = (v: Pt) => n360(Math.atan2(v[0], v[1]) / D);
  const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0];
  const legs = sh.legs.map((l) => {
    const o: TrackGeo['legs'][number] = { type: l.type, paces: l.paces, start: l.start, bearing: brg(wv(l.hIn)), lat: Math.abs(Math.cos(l.hIn * D)) < 0.5 };
    if (l.type === 'semi') o.dir = cross(wv(l.hIn), T) < 0 ? 1 : -1;
    return o;
  });
  const corners = sh.corners.map((c, i) => ({ pace: c.pace, interior: c.interior, acute: c.acute, pt: w(c.pt), dir: cross(wv(sh.legs[i].hOut), wv(sh.legs[i + 1].hIn)) < 0 ? 1 : -1 }));
  return {
    pts: sh.pts.map(w), pp: sh.pp, segLeg: sh.segLeg, legs, corners,
    tail: [w(sh.tail[0]), w(sh.tail[1])], total: sh.total,
    articles: sh.articles.map((a) => ({ ...a, pt: w(a.pt) })), cross: [],
    exitBearing: brg(wv(sh.legs[sh.legs.length - 1].hOut)), maxU: sh.maxU,
  };
}

/** Typical lane size per level (width along the path, depth into the field), from sampled shapes. */
const fpCache: Record<string, { w: number; d: number; dMin: number }> = {};
export function footprint(lk: LevelKey, s: Settings) {
  const key = lk + '|' + [s.pace, s.intraSep, s.semiR, s.setback].join(',');
  if (fpCache[key]) return fpCache[key];
  const lv = LEVELS[lk];
  let w = 0, d = 0, n = 0, dMin = Infinity;
  for (let i = 0; i < 14; i++) {
    const sh = laneShape(lv, s);
    if (!sh) continue;
    w += sh.maxU;
    d += Math.max(...sh.pts.map((q) => q[1]));
    n++;
  }
  for (let i = 0; i < 14; i++) {
    const sh = laneShape(lv, s, Infinity, 340, 800);
    if (!sh) continue;
    dMin = Math.min(dMin, Math.max(...sh.pts.map((q) => q[1])));
  }
  return (fpCache[key] = { w: n ? w / n : 100, d: n ? d / n : 150, dMin: isFinite(dMin) ? dMin : n ? d / n : 150 });
}
