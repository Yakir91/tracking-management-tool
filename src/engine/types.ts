/** Local metric coordinates: x = east, y = north, in metres. */
export type Pt = [number, number];

export type LevelKey = 'FPR1' | 'FPR2' | 'FPR3' | 'IFH1' | 'IFH2' | 'IFH3';

export interface Level {
  code: LevelKey;
  short: string;
  heb: string;
  eq: string;
  /** Laid by the handler (own track) rather than a stranger tracklayer. */
  own: boolean;
  paces: number;
  legs: number;
  acute: number;
  acuteLast?: boolean;
  semi: boolean;
  articles: number;
  /** Minimum aging, minutes. */
  aging: number;
  /** Maximum working time, minutes. */
  work: number;
  /** Number of legs a cross track crosses (0 = no cross track). */
  cross: number;
  /** Judging phases this level counts as. */
  phases: number;
  /** Default planning estimate of working time, minutes. */
  est: number;
  leash: number;
  color: string;
  art: 'fpr12' | 'fpr3' | 'ifh';
}

export interface Settings {
  date: string;
  start: string;
  layers: number;
  crossLayers: number;
  ownParallel: number;
  judges: number;
  pace: number;
  layRate: number;
  walkKmh: number;
  detour: number;
  changeover: number;
  drawBuf: number;
  sep: number;
  intraSep: number;
  edge: number;
  walkBuf: number;
  crossLen: number;
  crossExt: number;
  crossClear: number;
  semiR: number;
  setback: number;
  /** 0 = automatic. */
  groupSize: number;
  autoOrder: boolean;
  est: Record<LevelKey, number>;
  aging: Record<LevelKey, number>;
  levelOrder: LevelKey[];
}

export interface Competitor {
  id: string;
  handler: string;
  dog: string;
  level: LevelKey;
  example?: boolean;
}

export type MapMode = 'schematic' | 'image' | 'satellite';

export interface Layout {
  fields: Pt[][];
  paths: Pt[][];
  base: Pt;
  origin?: [number, number];
  center?: [number, number];
}

export interface MapState extends Layout {
  mode: MapMode;
  origin: [number, number];
  image: null | { url: string | null; w: number; h: number; scale: number };
  layouts?: Partial<Record<MapMode, Layout>>;
}

/** Times actually recorded, minutes from the trial date's midnight. */
export interface Actual {
  ls?: number;
  le?: number;
  cs?: number;
  js?: number;
  je?: number;
  res?: number;
}

export interface Draw {
  sig: string;
  order: string[];
  at: number;
}

export interface LegGeo {
  type: 'line' | 'semi';
  paces: number;
  start: number;
  bearing: number;
  lat: boolean;
  dir?: number;
}

export interface CornerGeo {
  pace: number;
  interior: number;
  acute: boolean;
  pt: Pt;
  dir: number;
}

export interface Article {
  pace: number;
  pt: Pt;
  n: number;
}

export interface CrossTrack {
  a: Pt;
  b: Pt;
  bearing: number;
  paces: number;
  cx: { leg: number; pace: number; cp: Pt; atPace: number }[];
}

export interface TrackGeo {
  pts: Pt[];
  pp: number[];
  segLeg: number[];
  legs: LegGeo[];
  corners: CornerGeo[];
  tail: [Pt, Pt];
  total: number;
  articles: Article[];
  cross: CrossTrack[];
  exitBearing: number;
  maxU: number;
  level?: LevelKey;
  fi?: number;
  side?: number;
  atS?: number;
}

export interface FitReport {
  at: number;
  fails: number;
  byLevel: Partial<Record<LevelKey, { need: number; placed: number }>>;
  closePaths: { a: number; b: number; d: number; need: number }[];
  extra: number;
  depthNeed: Partial<Record<LevelKey, number>>;
  frontage: number;
  paths: number;
  depth: number;
  area: number;
  fields: number;
}

export interface UiState {
  tab: string;
  zoom: number;
  sel: string | null;
  showRoutes: boolean;
  layer: 'sat' | 'street';
}

export interface TrialState {
  settings: Settings;
  competitors: Competitor[];
  map: MapState;
  draws: Record<string, Draw>;
  geo: Record<string, TrackGeo>;
  trackNo: Record<string, number>;
  actuals: Record<string, Actual>;
  judgeOverride: Record<string, number>;
  pins: Record<string, number>;
  live: boolean;
  lastGen: FitReport | null;
  /** Seed of the last track placement (reproduces st.geo). */
  genSeed?: number;
  ui: UiState;
}

export interface Route {
  path: Pt[];
  len: number;
  blocked: boolean;
}

export interface Group {
  id: string;
  level: LevelKey;
  lv: Level;
  members: string[];
  sig: string;
  draw: Draw | null;
  index: number;
  count: number;
  tracks: Track[];
  order: number;
  seq: Track[];
  noDraw: boolean;
  single: boolean;
  judge: number;
  layMin: number;
  layMax: number;
  gate: number;
  firstStart: number;
}

export interface Track {
  id: string;
  group: Group;
  level: LevelKey;
  lv: Level;
  slot: number;
  comp: Competitor | null;
  geo: TrackGeo | null;
  act: Actual;
  no: number;
  // filled by the scheduler
  aging: number;
  layDur: number;
  est: number;
  pool: 'lay' | 'own';
  S: Pt | null;
  E: Pt | null;
  layStart: number;
  layEnd: number;
  res: number;
  start: number;
  end: number;
  judge: number;
  crossT: { s: number; e: number; done?: boolean }[] | null;
  crossRes: number;
  deadline: number;
  age: number;
  excess: number;
  // filled by route computation
  approach?: Route | null;
  approachFrom?: Track | null;
  crossRoutes?: (Route | null)[];
  crossFrom?: string;
}

export interface Model {
  groups: Group[];
  tracks: Track[];
  T0: number;
  NOW: number;
  firstLay: number;
  lastEnd: number;
}
