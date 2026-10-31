import { defaultState, normalize } from './state';
import type { TrialState } from './types';

/** The parts of a trial worth sending; numbers in geometry rounded to 10 cm to keep the link short. */
const r1 = <T,>(v: T): T => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'number' ? Math.round(x * 10) / 10 : x)));

export interface SharePayload extends Partial<TrialState> { v: 1; at: number }

export function shareBody(st: TrialState): SharePayload {
  const m = st.map;
  return {
    v: 1, at: Date.now(),
    settings: st.settings,
    competitors: st.competitors.map(({ example: _e, ...c }) => c),
    map: { mode: m.mode === 'image' ? 'schematic' : m.mode, fields: r1(m.fields || []), paths: r1(m.paths || []), base: r1(m.base), origin: m.origin, center: m.center, image: null },
    draws: st.draws, geo: r1(st.geo), trackNo: st.trackNo, actuals: st.actuals, pins: st.pins || {},
    judgeOverride: st.judgeOverride, live: st.live, lastGen: st.lastGen,
  };
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

/** gzip + base64url, for the #s= part of a link. */
export async function packShare(st: TrialState): Promise<string> {
  const json = JSON.stringify(shareBody(st));
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  return b64u(await new Response(stream).arrayBuffer());
}

export async function unpackShare(code: string): Promise<SharePayload> {
  const stream = new Blob([unb64u(code)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

/** A shared trial as a full local state; the person's own view settings are reset. */
export function stateFromShare(p: SharePayload): TrialState {
  const { v: _v, at: _at, ...rest } = p;
  const st = normalize({ ...defaultState(), ...rest } as TrialState & Record<string, unknown>);
  st.map.layouts = {};
  st.map.image = null;
  st.ui = { ...defaultState().ui, tab: 'field' };
  return st;
}
