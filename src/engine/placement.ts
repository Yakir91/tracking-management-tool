import { genCross } from './cross';
import { clear, fieldOK, fieldsOf, getPaths, hasField, totalArea, type AccessPath, type Obstacle } from './field';
import { bboxOf, edgesOf, inPoly, pathAt, pathLen, ptSeg, segSeg, type Seg } from './geometry';
import { LEVELS } from './levels';
import { buildModel } from './model';
import { schedule } from './schedule';
import { footprint, laneShape, shapeSegs, toWorld } from './shapes';
import { rand, seeded, withRandom } from './util';
import type { FitReport, LevelKey, Pt, Track, TrackGeo, TrialState } from './types';

/** Cost of a judging order: total trial length plus a quarter of the waiting beyond minimum aging. */
function scheduleCost(st: TrialState, order: LevelKey[]) {
  const sv = st.settings.levelOrder;
  st.settings.levelOrder = order;
  const M = buildModel(st);
  M.tracks.forEach((t) => (t.geo = null));
  if (M.tracks.length) schedule(st, M);
  st.settings.levelOrder = sv;
  if (!M.tracks.length) return 0;
  const ex = M.tracks.reduce((a, t) => a + Math.max(0, t.excess), 0);
  return M.lastEnd - M.firstLay + 0.25 * ex;
}

/** Judging order of the levels by local search (moves of one level), from three starting orders. */
export function optimizeOrder(st: TrialState) {
  const s = st.settings;
  const used = s.levelOrder.filter((k) => st.competitors.some((c) => c.level === k));
  const rest = s.levelOrder.filter((k) => !used.includes(k));
  let best = used.slice(), bc = scheduleCost(st, best.concat(rest));
  const starts = [used.slice(), used.slice().sort((a, b) => LEVELS[a].aging - LEVELS[b].aging), used.slice().sort((a, b) => LEVELS[b].aging - LEVELS[a].aging)];
  for (const stt of starts) {
    let cur = stt, cc = scheduleCost(st, cur.concat(rest)), improved = true, rounds = 0;
    while (improved && rounds++ < 6) {
      improved = false;
      for (let i = 0; i < cur.length; i++)
        for (let j = 0; j < cur.length; j++) {
          if (i === j) continue;
          const c = cur.slice();
          const [x] = c.splice(i, 1);
          c.splice(j, 0, x);
          const v = scheduleCost(st, c.concat(rest));
          if (v < cc - 0.5) { cc = v; cur = c; improved = true; }
        }
    }
    if (cc < bc) { bc = cc; best = cur; }
  }
  s.levelOrder = best.concat(rest);
}

export interface GenResult { ok: boolean; message?: string }

/**
 * Places every track in the marked fields, side by side along the access paths in working order.
 * Mutates st: geo, trackNo, actuals (cleared), lastGen (fit report) and, with auto order, settings.levelOrder.
 */
export function generateTracks(st: TrialState, seed?: number): GenResult {
  // a recorded seed makes the layout reproducible, so a share link can carry the seed instead of every track
  const sd = seed ?? Math.floor(rand() * 2 ** 31);
  st.genSeed = sd;
  return withRandom(seeded(sd), () => generateBest(st));
}

function generateBest(st: TrialState): GenResult {
  // shapes are random: when something is left out, try again a couple of times and keep the best layout
  let r = generateOnce(st);
  if (!r.ok || !st.lastGen || !st.lastGen.fails) return r;
  let best = { r, geo: st.geo, trackNo: st.trackNo, lastGen: st.lastGen };
  for (let k = 0; k < 2 && best.lastGen.fails; k++) {
    r = generateOnce(st);
    if (st.lastGen && st.lastGen.fails < best.lastGen.fails) best = { r, geo: st.geo, trackNo: st.trackNo, lastGen: st.lastGen };
  }
  st.geo = best.geo;
  st.trackNo = best.trackNo;
  st.lastGen = best.lastGen;
  return best.r;
}

function generateOnce(st: TrialState): GenResult {
  const s = st.settings;
  if (!hasField(st)) return { ok: false, message: 'יש לסמן קודם את שטח המסלולים על המפה.' };
  const F = st.map.fields;
  const FE = F.map((f) => (f && f.length > 2 ? edgesOf(f) : []));
  st.geo = {};
  st.trackNo = {};
  st.actuals = {};
  if (s.autoOrder) optimizeOrder(st);
  const PS = getPaths(st);
  if (!PS.length) return { ok: false, message: 'לא נמצא מקום לשביל גישה בשטח שסומן. סמנו שביל גישה ידנית.' };
  const M = buildModel(st);
  M.tracks.forEach((t) => (t.geo = null));
  schedule(st, M);
  const order = M.tracks.slice().sort((a, b) => a.start - b.start || a.judge - b.judge);
  const pathSegs: Seg[] = [];
  for (const P of PS) for (let i = 0; i < P.pts.length - 1; i++) pathSegs.push([P.pts[i], P.pts[i + 1]]);
  const segDistP = (q: Pt, P: AccessPath) => {
    let d = Infinity;
    for (let i = 0; i < P.pts.length - 1; i++) d = Math.min(d, ptSeg(q, P.pts[i], P.pts[i + 1]));
    return d;
  };
  // slots: each usable side of each path; alternate direction so the judge never walks back to the start
  interface Slot { P: AccessPath; PL: number; sd: number; back: boolean; fi: number; field: Pt[]; fe: Seg[]; hg: number }
  const slots: Slot[] = [];
  for (const P of PS) {
    const PL = pathLen(P.pts);
    const field = F[P.fi];
    // paths in the same field share it: a lane never reaches past half way to the neighbouring path
    let hg = Infinity;
    for (const Q of PS) {
      if (Q === P || Q.fi !== P.fi) continue;
      for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) hg = Math.min(hg, segDistP(pathAt(P.pts, PL * f).p, Q) / 2);
    }
    const sides = [1, -1]
      .map((sd) => {
        let c = 0;
        for (const f of [0.2, 0.4, 0.6, 0.8]) {
          const q = pathAt(P.pts, PL * f);
          const N: Pt = [-q.T[1] * sd, q.T[0] * sd];
          if (inPoly([q.p[0] + N[0] * 60, q.p[1] + N[1] * 60], field)) c++;
        }
        return { sd, c };
      })
      .filter((x) => x.c > 0)
      .sort((a, b) => b.c - a.c)
      .map((x) => x.sd);
    for (const sd of sides) slots.push({ P, PL, sd, back: slots.length % 2 === 1, fi: P.fi, field, fe: FE[P.fi], hg });
  }
  if (!slots.length) return { ok: false, message: 'שביל הגישה לא נמצא לצד שטח המסלולים. סמנו שביל לאורך השטח.' };
  const obs: Obstacle[] = [];
  let fails = 0, si = 0, cur = s.edge + 5;
  const rayDepth = (p0: Pt, N: Pt, field: Pt[]) => {
    let d = 0;
    for (; d < 3000; d += 5) if (!inPoly([p0[0] + N[0] * (d + 5), p0[1] + N[1] * (d + 5)], field)) break;
    return d;
  };
  const failCache = new Set<string>();
  function tryAt(t: Track, sl: Slot, at: number): TrackGeo | null {
    const lv = t.lv;
    const q = pathAt(sl.P.pts, sl.back ? sl.PL - at : at);
    const N: Pt = [-q.T[1] * sl.sd, q.T[0] * sl.sd];
    const T: Pt = sl.back ? [-q.T[0], -q.T[1]] : q.T;
    const dmax = Math.min(rayDepth(q.p, N, sl.field), sl.hg) - s.edge - 3;
    if (dmax < s.setback + 35) return null;
    // narrow field: widen the legs along the path so the track stays shallow enough
    for (const lm of [130, 220, 340]) {
      const key = t.level + '|' + lm + '|' + Math.floor(dmax / 25);
      if (failCache.has(key)) continue;
      // collect a few valid shapes and use the narrowest, so long tracks don't eat the frontage the next ones need
      const cands: TrackGeo[] = [];
      for (let a = 0; a < 12 && cands.length < 4; a++) {
        const sh = laneShape(lv, s, dmax, lm, 500);
        if (!sh) { if (!cands.length) failCache.add(key); break; }
        const w = toWorld(sh, q.p, T, N);
        if (!fieldOK(w, s, sl.field, sl.fe)) continue;
        const segs = shapeSegs(w);
        if (segs.some((g) => pathSegs.some((e) => segSeg(g[0], g[1], e[0], e[1]) < 3))) continue;
        if (!clear(segs, bboxOf(w.pts.concat(w.tail)), obs, s.sep, s.crossClear)) continue;
        cands.push(w);
      }
      cands.sort((a, b) => a.maxU - b.maxU);
      for (const w of cands) {
        if (lv.cross) {
          const cr = genCross(st, w, sl.field, obs, pathSegs);
          if (!cr) continue;
          w.cross = cr;
        }
        w.side = sl.sd;
        w.atS = at;
        w.fi = sl.fi;
        return w;
      }
    }
    return null;
  }
  order.forEach((t, i) => {
    st.trackNo[t.id] = i + 1;
    let placed: TrackGeo | null = null, psi = si, pc = cur;
    while (!placed && psi < slots.length) {
      placed = tryAt(t, slots[psi], pc);
      if (!placed) {
        pc += 10;
        if (pc > slots[psi].PL - 20) { psi++; pc = s.edge + 5; }
      }
    }
    if (placed) {
      si = psi;
      cur = pc + placed.maxU + s.sep;
      placed.level = t.level;
      st.geo[t.id] = placed;
      obs.push({ kind: 'track', segs: shapeSegs(placed).map((g) => [g[0], g[1]] as Seg), bb: bboxOf(placed.pts.concat(placed.tail)) });
      placed.cross.forEach((c) => obs.push({ kind: 'cross', segs: [[c.a, c.b]], bb: bboxOf([c.a, c.b]) }));
    } else fails++;
  });
  // fit report: what fits, what is missing, and how much more frontage or depth would be needed
  const byLevel: FitReport['byLevel'] = {};
  const widths: Partial<Record<LevelKey, number[]>> = {};
  for (const t of M.tracks) {
    const b = (byLevel[t.level] = byLevel[t.level] || { need: 0, placed: 0 });
    b.need++;
    const g = st.geo[t.id];
    if (g) { b.placed++; (widths[t.level] = widths[t.level] || []).push(g.maxU); }
  }
  let extra = 0;
  const depthNeed: FitReport['depthNeed'] = {};
  for (const lk of Object.keys(byLevel) as LevelKey[]) {
    const b = byLevel[lk]!;
    const miss = b.need - b.placed;
    if (miss > 0) {
      const fp = footprint(lk, s);
      const ws = widths[lk] || [];
      const w = ws.length ? ws.reduce((a, x) => a + x, 0) / ws.length : fp.w;
      extra += miss * (w + s.sep);
      if (!b.placed) depthNeed[lk] = Math.round(fp.dMin + s.edge + 5);
    }
  }
  let dsum = 0, dn = 0;
  for (const sl of slots)
    for (let f = 0.1; f < 0.95; f += 0.1) {
      const q = pathAt(sl.P.pts, sl.PL * f);
      const d = Math.min(rayDepth(q.p, [-q.T[1] * sl.sd, q.T[0] * sl.sd], sl.field), sl.hg);
      if (d > 20) { dsum += d; dn++; }
    }
  // drawn paths in one field that leave too little room between them for any lane
  const close: FitReport['closePaths'] = [];
  const minGap = 2 * (s.setback + 60 + s.edge);
  for (let x = 0; x < PS.length; x++)
    for (let y = x + 1; y < PS.length; y++) {
      const A = PS[x], B = PS[y];
      if (A.fi !== B.fi || A.auto || B.auto) continue;
      let d = Infinity;
      for (const f of [0, 0.25, 0.5, 0.75, 1]) d = Math.min(d, segDistP(pathAt(A.pts, pathLen(A.pts) * f).p, B), segDistP(pathAt(B.pts, pathLen(B.pts) * f).p, A));
      if (d < minGap) close.push({ a: A.pi!, b: B.pi!, d: Math.round(d), need: Math.round(minGap) });
    }
  st.lastGen = {
    at: Date.now(), fails, byLevel, closePaths: close, extra: Math.round(extra), depthNeed,
    frontage: Math.round(slots.reduce((a, x) => a + x.PL, 0)), paths: PS.length, depth: dn ? Math.round(dsum / dn) : 0,
    area: Math.round(totalArea(st)), fields: fieldsOf(st).length,
  };
  return { ok: true, message: fails ? fails + ' מסלולים לא נכנסו בשטח שסומן. הפירוט בלשונית "שטח ומפה".' : undefined };
}

/** Rough area, frontage and depth the entries need, from typical lane sizes. */
export function needOf(st: TrialState, tracks: { level: LevelKey }[]) {
  const s = st.settings;
  let area = 0, front = 0, depth = 0;
  for (const t of tracks) {
    const fp = footprint(t.level, s);
    area += (fp.w + s.sep) * (fp.d + s.setback + s.edge);
    front += fp.w + s.sep;
    depth = Math.max(depth, fp.d + s.setback + s.edge);
  }
  return { dunam: Math.round(area / 1000), front: Math.round(front), depth: Math.round(depth) };
}
