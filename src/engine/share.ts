import { hasField } from './field';
import { generateTracks } from './placement';
import { defaultState, normalize } from './state';
import type { Actual, Competitor, Draw, LevelKey, MapMode, Pt, Settings, TrackGeo, TrialState } from './types';

/*
 * Two link formats:
 *  - #t=  (current) the trial without its track geometry, plus the placement seed. The recipient's
 *          browser places the tracks again from the same seed and gets the same layout. Much shorter.
 *  - #s=  (older, still read) everything including every track, gzip. Used as a fallback when the
 *          current layout can't be reproduced from the seed (e.g. tracks edited in live mode).
 */

const round = (v: unknown, k: number): unknown => JSON.parse(JSON.stringify(v, (_key, x) => (typeof x === 'number' ? Math.round(x * k) / k : x)));

/** Full payload (format #s=). */
export interface SharePayload extends Partial<TrialState> { v: 1; at: number }

/** Compact payload (format #t=): short keys, settings only where they differ from the defaults. */
export interface CompactPayload {
  v: 2;
  at: number;
  s: Partial<Settings>;
  c: [string, string, string, LevelKey][];
  m: { mode: MapMode; f: Pt[][]; p: Pt[][]; b: Pt; o: [number, number]; ce?: [number, number] };
  d?: Record<string, Draw>;
  a?: Record<string, Actual>;
  pi?: Record<string, number>;
  j?: Record<string, number>;
  l?: 1;
  g: number;
}

export type AnyPayload = SharePayload | CompactPayload;

export function shareBody(st: TrialState): SharePayload {
  const m = st.map;
  return {
    v: 1, at: Date.now(),
    settings: st.settings,
    competitors: st.competitors.map(({ example: _e, ...c }) => c),
    map: { mode: m.mode === 'image' ? 'schematic' : m.mode, fields: round(m.fields || [], 10) as Pt[][], paths: round(m.paths || [], 10) as Pt[][], base: round(m.base, 10) as Pt, origin: m.origin, center: m.center, image: null },
    draws: st.draws, geo: round(st.geo, 10) as Record<string, TrackGeo>, trackNo: st.trackNo, actuals: st.actuals, pins: st.pins || {},
    judgeOverride: st.judgeOverride, live: st.live, lastGen: st.lastGen,
  };
}

const nonEmpty = <T extends object>(o: T) => (o && Object.keys(o).length ? o : undefined);

export function compactBody(st: TrialState): CompactPayload {
  const m = st.map, d = defaultState().settings as unknown as Record<string, unknown>;
  const s: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(st.settings)) if (JSON.stringify(v) !== JSON.stringify(d[k])) s[k] = v;
  s.date = st.settings.date;
  return {
    v: 2, at: Math.round(Date.now() / 1000),
    s: s as Partial<Settings>,
    c: st.competitors.map((c) => [c.id, c.handler, c.dog, c.level]),
    // exact coordinates: even centimetre rounding can change which shapes fit, and the layout must come out the same
    m: { mode: m.mode === 'image' ? 'schematic' : m.mode, f: m.fields || [], p: m.paths || [], b: m.base, o: m.origin, ce: m.center },
    d: nonEmpty(st.draws), a: nonEmpty(st.actuals), pi: nonEmpty(st.pins || {}), j: nonEmpty(st.judgeOverride),
    l: st.live ? 1 : undefined, g: st.genSeed ?? 0,
  };
}

/** A compact payload as a full state, with the tracks placed again from the seed. */
function stateFromCompact(p: CompactPayload): TrialState {
  const d = defaultState();
  const st = normalize({
    ...d,
    settings: { ...d.settings, ...p.s, est: { ...d.settings.est, ...(p.s.est || {}) }, aging: { ...d.settings.aging, ...(p.s.aging || {}) } },
    competitors: p.c.map(([id, handler, dog, level]): Competitor => ({ id, handler, dog, level })),
    map: { ...d.map, mode: p.m.mode, fields: p.m.f, paths: p.m.p, base: p.m.b, origin: p.m.o, center: p.m.ce, image: null, layouts: {} },
    draws: p.d || {}, actuals: {}, pins: p.pi || {}, judgeOverride: p.j || {}, live: !!p.l, geo: {}, trackNo: {}, lastGen: null,
  } as TrialState & Record<string, unknown>);
  if (hasField(st)) generateTracks(st, p.g);
  st.actuals = p.a || {};
  return st;
}

/** Same tracks, numbered the same, within half a metre: the recipient will see the sender's layout. */
function sameLayout(a: TrialState, b: TrialState) {
  const ka = Object.keys(a.geo).sort(), kb = Object.keys(b.geo).sort();
  if (ka.join() !== kb.join()) return false;
  for (const k of ka) {
    if (a.trackNo[k] !== b.trackNo[k]) return false;
    const ga = a.geo[k], gb = b.geo[k];
    if (ga.pts.length !== gb.pts.length || ga.cross.length !== gb.cross.length) return false;
    const pa = ga.pts.concat(ga.cross.flatMap((c) => [c.a, c.b])), pb = gb.pts.concat(gb.cross.flatMap((c) => [c.a, c.b]));
    for (let i = 0; i < pa.length; i++) if (Math.abs(pa[i][0] - pb[i][0]) > 0.5 || Math.abs(pa[i][1] - pb[i][1]) > 0.5) return false;
  }
  return true;
}

const b64u = (buf: ArrayBuffer) => {
  let s = '';
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + 0x8000)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = (str: string) => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
};
const zip = async (json: string, fmt: CompressionFormat) => b64u(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream(fmt))).arrayBuffer());
const unzip = async (code: string, fmt: CompressionFormat) => JSON.parse(await new Response(new Blob([unb64u(code)]).stream().pipeThrough(new DecompressionStream(fmt))).text());

/** The hash part of a share link: '#t=…' when the layout reproduces from its seed, otherwise '#s=…'. */
export async function packShare(st: TrialState): Promise<string> {
  if (st.genSeed != null) {
    const body = compactBody(st);
    try {
      if (!hasField(st) || sameLayout(st, stateFromCompact(JSON.parse(JSON.stringify(body))))) return '#t=' + (await zip(JSON.stringify(body), 'deflate-raw'));
    } catch {
      /* fall back to the full link */
    }
  }
  return '#s=' + (await zip(JSON.stringify(shareBody(st)), 'gzip'));
}

/** Reads the hash of a share link (with or without the leading '#'). */
export async function unpackShare(hash: string): Promise<AnyPayload> {
  const h = hash.replace(/^#/, '');
  // messaging apps sometimes leave a trailing character or space glued to the link
  const code = h.slice(2).replace(/[^A-Za-z0-9_-]+$/, '');
  if (h.startsWith('t=')) return unzip(code, 'deflate-raw');
  if (h.startsWith('s=')) return unzip(code, 'gzip');
  throw new Error('not a share link');
}

export const isShareHash = (hash: string) => /^#?[st]=/.test(hash);

/** What the banner says about an incoming trial. */
export function shareSummary(p: AnyPayload) {
  if (p.v === 2) return { competitors: p.c.length, fields: p.m.f.length, date: p.s.date || '', at: p.at * 1000 };
  return { competitors: (p.competitors || []).length, fields: (p.map?.fields || []).length, date: p.settings?.date || '', at: p.at };
}

/** A shared trial as a full local state; the person's own view settings are reset. */
export function stateFromShare(p: AnyPayload): TrialState {
  let st: TrialState;
  if (p.v === 2) st = stateFromCompact(p);
  else {
    const { v: _v, at: _at, ...rest } = p;
    st = normalize({ ...defaultState(), ...rest } as TrialState & Record<string, unknown>);
  }
  st.map.layouts = {};
  st.map.image = null;
  st.ui = { ...defaultState().ui, tab: 'field' };
  return st;
}
