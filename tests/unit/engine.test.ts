import { beforeEach, describe, expect, it } from 'vitest';
import { defaultState, generateTracks, groupSizeFor, LEVELS, normalize, packShare, plan, stateFromShare, unpackShare } from '../../src/engine';
import { inPoly, segSeg, segX } from '../../src/engine/geometry';
import { shapeSegs } from '../../src/engine/shapes';
import type { Model, Track, TrialState } from '../../src/engine/types';
import { seeded, setRandom } from '../../src/engine/util';

const NOW = new Date(2026, 9, 31, 6, 0).getTime();

function demo(seed = 1): { st: TrialState; M: Model } {
  setRandom(seeded(seed));
  const st = defaultState();
  st.settings.date = '2026-10-31';
  const r = generateTracks(st);
  expect(r.ok).toBe(true);
  return { st, M: plan(st, NOW) };
}
const overlaps = (a: Track, b: Track, s: keyof Track, e: keyof Track) => (a[s] as number) < (b[e] as number) - 0.01 && (b[s] as number) < (a[e] as number) - 0.01;

describe('schedule', () => {
  let st: TrialState, M: Model;
  beforeEach(() => ({ st, M } = demo(1)));

  it('places every demo track', () => {
    expect(M.tracks.length).toBe(15);
    expect(M.tracks.every((t) => t.geo)).toBe(true);
    expect(st.lastGen!.fails).toBe(0);
  });

  it('never starts a dog before its track reaches the minimum aging', () => {
    for (const t of M.tracks) expect(t.start - t.layEnd).toBeGreaterThanOrEqual(t.aging - 0.01);
  });

  it('never gives one judge two dogs at once', () => {
    for (const a of M.tracks) for (const b of M.tracks) if (a !== b && a.judge === b.judge) expect(overlaps(a, b, 'start', 'end')).toBe(false);
  });

  it('never lays two tracks of one group at the same time', () => {
    for (const a of M.tracks) for (const b of M.tracks) if (a !== b && a.group === b.group) expect(overlaps(a, b, 'layStart', 'layEnd')).toBe(false);
  });

  it('never gives one tracklayer two tracks at once', () => {
    for (const a of M.tracks)
      for (const b of M.tracks) if (a !== b && a.pool === b.pool && a.res === b.res) expect(overlaps(a, b, 'layStart', 'layEnd')).toBe(false);
  });

  it('draws a stranger-laid group only after all its tracks are laid', () => {
    for (const g of M.groups) {
      if (g.noDraw) continue;
      expect(g.firstStart).toBeGreaterThanOrEqual(g.layMax + st.settings.drawBuf - 0.01);
    }
  });

  it('has no draw for own-laid levels', () => {
    for (const g of M.groups) if (LEVELS[g.level].own) expect(g.noDraw).toBe(true);
  });

  it('lays the cross track about 30 minutes before the dog', () => {
    for (const t of M.tracks.filter((x) => x.lv.cross)) {
      expect(t.crossT).toBeTruthy();
      expect(t.start - t.crossT![0].e).toBeGreaterThanOrEqual(30 - 0.01);
      expect(t.crossT![0].s).toBeGreaterThanOrEqual(t.layEnd - 0.01);
    }
  });

  it('honours recorded times and re-flows the rest', () => {
    const t1 = M.tracks.slice().sort((a, b) => a.start - b.start)[0];
    st.actuals[t1.id] = { ls: t1.layStart + 10, le: t1.layEnd + 12, res: t1.res };
    const M2 = plan(st, NOW);
    const u1 = M2.tracks.find((t) => t.id === t1.id)!;
    expect(u1.layEnd).toBeCloseTo(t1.layEnd + 12);
    expect(u1.start).toBeGreaterThanOrEqual(u1.layEnd + u1.aging - 0.01);
    expect(Math.max(...M2.tracks.map((t) => t.end))).toBeGreaterThanOrEqual(M.lastEnd - 0.01);
  });

  it('delays a dog with "not before" and keeps the judge sequential', () => {
    const t = M.tracks.slice().sort((a, b) => a.start - b.start)[2];
    st.pins[t.id] = t.start + 15;
    const M2 = plan(st, NOW);
    const u = M2.tracks.find((x) => x.id === t.id)!;
    expect(u.start).toBeGreaterThanOrEqual(t.start + 15 - 0.01);
    for (const a of M2.tracks) for (const b of M2.tracks) if (a !== b && a.judge === b.judge) expect(overlaps(a, b, 'start', 'end')).toBe(false);
  });
});

describe('track geometry', () => {
  const { st, M } = demo(7);
  const field = st.map.fields[0];

  it('matches each level: paces, legs, corners and acute corners', () => {
    for (const t of M.tracks) {
      const g = t.geo!, lv = t.lv;
      expect(g.total).toBe(lv.paces);
      expect(g.legs.length).toBe(lv.legs);
      expect(g.corners.length).toBe(lv.legs - 1);
      expect(g.corners.filter((c) => c.acute).length).toBe(lv.acute);
      expect(g.legs.filter((l) => l.type === 'semi').length).toBe(lv.semi ? 1 : 0);
      for (const l of g.legs) if (l.type === 'line') expect(l.paces).toBeGreaterThanOrEqual(50);
    }
  });

  it('keeps articles 20+ paces from every corner and puts the last at the end', () => {
    for (const t of M.tracks) {
      const g = t.geo!;
      expect(g.articles.length).toBe(t.lv.articles);
      expect(g.articles[g.articles.length - 1].pace).toBe(g.total);
      for (const a of g.articles.slice(0, -1)) for (const c of g.corners) expect(Math.abs(a.pace - c.pace)).toBeGreaterThanOrEqual(20);
    }
  });

  it('keeps every track inside the field, clear of the edge', () => {
    for (const t of M.tracks) {
      const g = t.geo!;
      for (const p of g.pts.concat(g.tail)) expect(inPoly(p, field)).toBe(true);
      for (const [a, b] of shapeSegs(g))
        for (let i = 0; i < field.length; i++) expect(segSeg(a, b, field[i], field[(i + 1) % field.length])).toBeGreaterThanOrEqual(st.settings.edge - 0.01);
    }
  });

  it('keeps at least 22 m between any two tracks, including exit to next start', () => {
    const ts = M.tracks;
    for (let i = 0; i < ts.length; i++)
      for (let j = i + 1; j < ts.length; j++) {
        let d = Infinity;
        for (const [a, b] of shapeSegs(ts[i].geo!)) for (const [c, e] of shapeSegs(ts[j].geo!)) d = Math.min(d, segSeg(a, b, c, e));
        expect(d).toBeGreaterThanOrEqual(st.settings.sep - 0.01);
      }
  });

  it('crosses exactly two inner legs once each with the cross track', () => {
    for (const t of M.tracks.filter((x) => x.lv.cross)) {
      const g = t.geo!;
      expect(g.cross.length).toBe(1);
      const c = g.cross[0];
      const legsCrossed = new Set<number>();
      let crossings = 0;
      for (const [a, b, leg] of shapeSegs(g)) if (segX(c.a, c.b, a, b)) { crossings++; legsCrossed.add(leg); }
      expect(crossings).toBe(2);
      expect(legsCrossed.size).toBe(2);
      for (const leg of legsCrossed) {
        expect(leg).toBeGreaterThan(0);
        expect(leg).toBeLessThan(g.legs.length - 1);
      }
      for (const x of c.cx) for (const k of g.corners) expect(Math.abs(x.pace - k.pace)).toBeGreaterThanOrEqual(40);
    }
  });
});

describe('fields, groups, sharing', () => {
  it('fills a second field when the first is full and reports what is missing', () => {
    setRandom(seeded(3));
    const st = defaultState();
    st.map.fields = [[[0, 0], [500, 0], [500, 260], [0, 260]], [[700, 0], [1300, 0], [1300, 500], [700, 500]]];
    st.map.paths = [];
    generateTracks(st);
    const M = plan(st, NOW, false);
    const fis = new Set(M.tracks.filter((t) => t.geo).map((t) => t.geo!.fi));
    expect(fis.has(0) && fis.has(1)).toBe(true);
    const G = st.lastGen!;
    const placed = Object.values(G.byLevel).reduce((a, b) => a + b!.placed, 0);
    expect(placed + G.fails).toBe(15);
  });

  it('fits two FH 3 tracks and an FH 2 in the demo field (no frontage wasted on wide shapes)', () => {
    for (let seed = 1; seed <= 6; seed++) {
      setRandom(seeded(seed));
      const st = defaultState();
      st.competitors[0].level = 'IFH3';
      generateTracks(st);
      expect(st.lastGen!.fails).toBe(0);
    }
  });

  it('placing again never places fewer tracks than the current layout', () => {
    setRandom(seeded(11));
    const st = defaultState();
    st.map.fields = [[[0, 0], [700, 0], [700, 420], [0, 420]]];
    st.map.paths = [];
    generateTracks(st);
    let best = Object.keys(st.geo).length;
    expect(best).toBeGreaterThan(0);
    for (let k = 0; k < 4; k++) {
      generateTracks(st);
      const n = Object.keys(st.geo).length;
      expect(n).toBeGreaterThanOrEqual(best);
      best = n;
      expect(st.lastGen!.fails).toBe(15 - n);
    }
  });

  it('chooses group size 3 for short aging and one group for own-laid levels', () => {
    const st = defaultState();
    expect(groupSizeFor(st, 'FPR3')).toBe(3);
    st.settings.aging.IFH3 = 600; // aging long enough to work five dogs → groups of 6
    expect(groupSizeFor(st, 'IFH3')).toBe(6);
    expect(groupSizeFor(st, 'FPR1')).toBeGreaterThan(100);
    st.settings.groupSize = 6;
    expect(groupSizeFor(st, 'FPR3')).toBe(6);
  });

  it('migrates a single-field save from the old version', () => {
    const old = { settings: { date: '2026-10-31' }, map: { mode: 'schematic', field: [[0, 0], [10, 0], [10, 10]], path: [[0, 5], [10, 5]], base: [0, 0], origin: [31, 34] } };
    const st = normalize(old as never);
    expect(st.map.fields.length).toBe(1);
    expect(st.map.paths.length).toBe(1);
    expect((st.map as unknown as Record<string, unknown>).field).toBeUndefined();
  });

  it('round-trips a trial through a short share link with the same layout and schedule', async () => {
    const { st, M } = demo(5);
    const draw = M.groups.find((g) => !g.noDraw)!;
    st.draws[draw.id] = { sig: draw.sig, order: draw.members.slice().reverse(), at: 1 };
    const t1 = M.tracks[0];
    st.actuals[t1.id] = { ls: t1.layStart, res: t1.res };
    const hash = await packShare(st);
    expect(hash.startsWith('#t=')).toBe(true);
    expect(hash.length).toBeLessThan(2000);
    const st2 = stateFromShare(await unpackShare(hash + ' '));
    const sig = (s: TrialState) => {
      const m = plan(s, NOW, false);
      return m.tracks.map((t) => `${t.no}:${t.comp?.id}:${Math.round(t.start)}:${t.geo ? t.geo.pts.map((p) => p.map(Math.round).join(',')).join(';') : ''}`).join('|');
    };
    expect(sig(st2)).toBe(sig(st));
    expect(st2.actuals[t1.id].ls).toBeCloseTo(t1.layStart);
  });

  it('falls back to the full link when the layout does not come from the seed', async () => {
    const { st } = demo(6);
    const k = Object.keys(st.geo)[0];
    st.geo[k] = { ...st.geo[k], pts: st.geo[k].pts.map(([x, y]) => [x + 5, y] as [number, number]) };
    const hash = await packShare(st);
    expect(hash.startsWith('#s=')).toBe(true);
    const st2 = stateFromShare(await unpackShare(hash));
    expect(st2.geo[k].pts[0][0]).toBeCloseTo(st.geo[k].pts[0][0], 0);
  });
});
