import { D } from '../engine/geometry';
import type { Pt, TrialState } from '../engine/types';

export type LatLng = [number, number];
const M_PER_DEG = 111320;

/**
 * Layouts are stored in local metres. On the real map they are placed around map.origin
 * (flat-earth conversion, accurate to centimetres over a trial field); on the grid and on
 * an uploaded image, metres are the map units directly.
 */
export function toLL(st: TrialState, p: Pt): LatLng {
  const m = st.map;
  if (m.mode === 'satellite') {
    const o = m.origin;
    return [o[0] + p[1] / M_PER_DEG, o[1] + p[0] / (M_PER_DEG * Math.cos(o[0] * D))];
  }
  return [p[1], p[0]];
}

export function fromLL(st: TrialState, ll: LatLng): Pt {
  const m = st.map;
  if (m.mode === 'satellite') {
    const o = m.origin;
    return [(ll[1] - o[1]) * M_PER_DEG * Math.cos(o[0] * D), (ll[0] - o[0]) * M_PER_DEG];
  }
  return [ll[1], ll[0]];
}
