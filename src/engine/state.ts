import { LEVELS, LKEYS } from './levels';
import type { LevelKey, Layout, MapState, TrialState } from './types';
import { todayISO, uid } from './util';

export const STORE_KEY = 'tracking-trial-manager-v8';
/** Keys of the single-file version, read once to migrate. */
const LEGACY_KEYS = ['tracking-trial-manager-v7', 'tracking-trial-manager-v6'];

const DEMO: [string, string, LevelKey][] = [
  ['אבי לוי', 'ברק', 'FPR1'], ['מיכל כהן', 'שאדו', 'FPR1'], ['רון אזולאי', 'טייסון', 'FPR1'], ['נועה פרץ', 'ליה', 'FPR1'],
  ['דני ביטון', 'אקסל', 'FPR1'], ['שירה מזרחי', 'נלה', 'FPR1'], ['עומר דהן', 'זאוס', 'FPR1'],
  ['יעל גבאי', 'בלה', 'FPR2'], ['איתי שושן', 'רקס', 'FPR2'],
  ['גיל אוחיון', 'אסטור', 'FPR3'], ['הדס חדד', 'מאיה', 'FPR3'], ['ליאור עמר', 'דרייק', 'FPR3'],
  ['תמר וקנין', 'סקיי', 'IFH1'], ['אלון יוסף', 'ראמבו', 'IFH2'], ['רותם אברהם', 'קירה', 'IFH3'],
];

export const demoLayout = (): Layout => ({
  fields: [[[0, 0], [1300, -20], [1330, 900], [650, 960], [-20, 880]]],
  paths: [[[0, 440], [1325, 450]]],
  base: [-45, 440],
});

export function defaultState(): TrialState {
  const est = {} as Record<LevelKey, number>, aging = {} as Record<LevelKey, number>;
  LKEYS.forEach((k) => { est[k] = LEVELS[k].est; aging[k] = LEVELS[k].aging; });
  return {
    settings: {
      date: todayISO(), start: '07:00', layers: 2, crossLayers: 1, ownParallel: 1, judges: 1, pace: 0.8, layRate: 70, walkKmh: 4.5,
      detour: 1.3, changeover: 4, drawBuf: 5, sep: 22, intraSep: 25, edge: 8, walkBuf: 7, crossLen: 100, crossExt: 25, crossClear: 15,
      semiR: 30, setback: 12, groupSize: 0, autoOrder: true, est, aging, levelOrder: LKEYS.slice(),
    },
    competitors: DEMO.map(([handler, dog, level]) => ({ id: uid(), handler, dog, level, example: true })),
    map: { mode: 'schematic', ...demoLayout(), origin: [31.62, 34.83], image: null },
    draws: {}, geo: {}, trackNo: {}, actuals: {}, judgeOverride: {}, pins: {}, live: false, lastGen: null,
    ui: { tab: 'comp', zoom: 2.2, sel: null, showRoutes: false, layer: 'sat' },
  };
}

type Loose = Record<string, unknown> & { field?: unknown; path?: unknown; fields?: unknown; paths?: unknown };
/** Older saves kept one field and one path; turn them into lists. */
function migrateLayout(o: Loose | undefined) {
  if (!o) return;
  if (o.field && !o.fields) {
    o.fields = Array.isArray(o.field) && o.field.length > 2 ? [o.field] : [];
    o.paths = Array.isArray(o.path) && o.path.length >= 2 ? [o.path] : [];
  }
  delete o.field;
  delete o.path;
  o.fields = o.fields || [];
  o.paths = o.paths || [];
}

/** Fill in anything missing from a saved or shared state, so older data keeps working. */
export function normalize(raw: Partial<TrialState> & Record<string, unknown>): TrialState {
  const d = defaultState();
  const s = raw as TrialState;
  s.settings = Object.assign(d.settings, s.settings || {});
  s.settings.est = Object.assign(d.settings.est, s.settings.est || {});
  s.settings.aging = Object.assign(d.settings.aging, s.settings.aging || {});
  s.ui = Object.assign(d.ui, s.ui || {});
  s.map = Object.assign(d.map, s.map || {}) as MapState;
  migrateLayout(s.map as unknown as Loose);
  Object.values(s.map.layouts || {}).forEach((l) => migrateLayout(l as unknown as Loose));
  for (const k of ['draws', 'geo', 'trackNo', 'actuals', 'judgeOverride', 'pins'] as const) (s as unknown as Record<string, object>)[k] = s[k] || {};
  s.competitors = s.competitors || [];
  s.live = !!s.live;
  s.lastGen = s.lastGen || null;
  return s;
}

export function loadState(storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null): TrialState | null {
  if (!storage) return null;
  try {
    for (const key of [STORE_KEY, ...LEGACY_KEYS]) {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const s = JSON.parse(raw);
      if (s && s.settings) return normalize(s);
    }
  } catch {
    /* corrupt storage: start fresh */
  }
  return null;
}

/** Saves; returns a note for the person when the aerial image could not be kept. */
export function saveState(st: TrialState, storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null): string {
  if (!storage) return '';
  try {
    storage.setItem(STORE_KEY, JSON.stringify(st));
    return '';
  } catch {
    try {
      const c = JSON.parse(JSON.stringify(st)) as TrialState;
      if (c.map.image) c.map.image.url = null;
      storage.setItem(STORE_KEY, JSON.stringify(c));
      return 'תמונת האוויר גדולה מדי לשמירה בדפדפן, ויש להעלות אותה שוב בפתיחה הבאה.';
    } catch {
      return 'השמירה בדפדפן נכשלה. השתמשו בגיבוי בלשונית ההגדרות.';
    }
  }
}
