import { compName } from './cards';
import type { Actual, LevelKey, Model, Track, TrialState } from './types';

export interface ScheduleEvent {
  t: number;
  kind: 'lay' | 'cross' | 'judge' | 'draw';
  level: LevelKey;
  trackNo?: number;
  groupIndex?: number;
  text: string;
  who: string;
}

/** Everything that happens, in time order (for the schedule tab and the copied schedule). */
export function events(M: Model): ScheduleEvent[] {
  const ev: ScheduleEvent[] = [];
  for (const t of M.tracks) {
    ev.push({ t: t.layStart, kind: 'lay', level: t.level, trackNo: t.no, text: `הנחת מסלול ${t.no}`, who: t.pool === 'own' ? (t.comp ? t.comp.handler : 'מוביל מקום ' + (t.slot + 1)) : 'מניח ' + (t.res + 1) });
    (t.crossT || []).forEach((c) => {
      if (!c.done) ev.push({ t: c.s, kind: 'cross', level: t.level, trackNo: t.no, text: `עקבה חוצה למסלול ${t.no}`, who: 'מניח חוצות ' + ((t.crossRes || 0) + 1) });
    });
    ev.push({ t: t.start, kind: 'judge', level: t.level, trackNo: t.no, text: `יציאת כלב במסלול ${t.no}: ${compName(t)}`, who: 'שופט ' + (t.judge + 1) });
  }
  for (const g of M.groups)
    if (!g.noDraw) ev.push({ t: g.layMax + 0.01, kind: 'draw', level: g.level, groupIndex: g.index + 1, text: `הגרלה, קבוצה ${g.index + 1}`, who: 'שופט ' + (g.judge + 1) });
  return ev.sort((a, b) => a.t - b.t);
}

export interface LiveEvent {
  t: number;
  track: Track;
  /** The step to record. */
  k: keyof Actual;
  text: string;
  label: string;
  /** Step to clear for "undo", when there is one. */
  undo?: keyof Actual;
}

/** Open steps of the live control, in time order. */
export function liveEvents(M: Model): LiveEvent[] {
  const ev: LiveEvent[] = [];
  for (const t of M.tracks) {
    const a = t.act;
    const nm = `מסלול ${t.no} · ${t.lv.short}`;
    if (a.ls == null) ev.push({ t: t.layStart, track: t, k: 'ls', text: `הנחת ${nm} (${t.pool === 'own' ? 'מוביל' : 'מניח ' + (t.res + 1)})`, label: 'התחלת הנחה' });
    else if (a.le == null) ev.push({ t: t.layEnd, track: t, k: 'le', text: `סיום הנחת ${nm}`, label: 'ההנחה הסתיימה', undo: 'ls' });
    if (t.lv.cross && a.cs == null && a.le != null && t.crossT) ev.push({ t: t.crossT[t.crossT.length - 1].e, track: t, k: 'cs', text: `עקבה חוצה ל${nm}`, label: 'העקבה החוצה הונחה' });
    if (a.js == null && a.le != null) ev.push({ t: t.start, track: t, k: 'js', text: `יציאת כלב ב${nm}: ${compName(t)}`, label: 'הכלב יצא' });
    else if (a.js != null && a.je == null) ev.push({ t: t.end, track: t, k: 'je', text: `סיום עבודה ב${nm}`, label: 'סיים', undo: 'js' });
  }
  return ev.sort((a, b) => a.t - b.t);
}

export type Warn = ['ok' | 'warn' | 'bad', string];

/** Checks shown at the top of the page. */
export function warnings(st: TrialState, M: Model): Warn[] {
  const s = st.settings;
  const w: Warn[] = [];
  const J = Math.max(1, s.judges);
  for (let j = 0; j < J; j++) {
    const ph = M.tracks.filter((t) => t.judge === j).reduce((a, t) => a + t.lv.phases, 0);
    if (ph > 36) w.push(['bad', `שופט ${j + 1}: ${ph} שלבים (מעל 36 ביום)`]);
  }
  const unplaced = M.tracks.filter((t) => !t.geo).length;
  if (unplaced) w.push(['bad', `${unplaced} מסלולים בלי מיקום בשטח`]);
  const old = M.tracks.filter((t) => t.excess > 45).length;
  if (old) w.push(['warn', `${old} מסלולים ממתינים מעל 45 דק׳ אחרי ההשהייה`]);
  const blocked = M.tracks.filter((t) => t.approach && t.approach.blocked).length;
  if (blocked) w.push(['warn', `${blocked} נתיבי הליכה דורשים בדיקה`]);
  const noCross = M.tracks.filter((t) => t.lv.cross && t.geo && (!t.geo.cross || !t.geo.cross.length)).length;
  if (noCross) w.push(['bad', `${noCross} מסלולים בלי עקבות חוצות`]);
  if (st.live) {
    const pend = M.groups.filter((g) => !g.noDraw && !g.draw && g.firstStart - M.NOW < 20).length;
    if (pend) w.push(['warn', `${pend} קבוצות ממתינות להגרלה`]);
  }
  if (!w.length) w.push(['ok', 'כל הבדיקות עברו']);
  return w;
}
