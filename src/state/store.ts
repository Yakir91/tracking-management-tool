import {
  allFieldPts, compName, defaultState, events, fmt, generateTracks, getPaths, hasField, hm, LEVELS, loadState, nowMin, normalize,
  packShare, pathField, plan, saveState, shuffle, stateFromShare, todayISO, trackCard, uid, unpackShare,
} from '../engine';
import { dist } from '../engine/geometry';
import type { SharePayload } from '../engine/share';
import type { Actual, LevelKey, MapMode, Model, Pt, Settings, TrialState } from '../engine/types';
import { fromLL, toLL, type LatLng } from './coords';

export type DrawMode = null | 'field' | 'path' | 'base' | 'calib';

/** Session-only state: drawing in progress, notes, requests to the map. Never saved. */
export interface Transient {
  drawMode: DrawMode;
  drawPts: Pt[];
  calibPts: Pt[];
  tilesOK: boolean | null;
  tileFailed: boolean;
  note: string | null;
  busy: string | null;
  shareUrl: string;
  incoming: SharePayload | null;
  saveNote: string;
  /** Bumped to ask the map to fit the field / rebuild / move. */
  fitReq: number;
  mapKey: number;
  view: { ll: LatLng; z: number; n: number } | null;
  focus: { id: string; n: number } | null;
  scrollCard: boolean;
  searchRes: { label: string; ll: LatLng }[] | string | null;
}

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
export const TILE_URL = (layer: 'sat' | 'street') =>
  ESRI + (layer === 'street' ? 'World_Street_Map' : 'World_Imagery') + '/MapServer/tile/{z}/{y}/{x}';

const REGEN_KEYS: (keyof Settings)[] = ['pace', 'intraSep', 'semiR', 'crossExt', 'sep', 'edge', 'crossClear', 'setback', 'walkBuf'];
const BULK_LEVELS: Record<string, LevelKey> = {
  FPR1: 'FPR1', FPR2: 'FPR2', FPR3: 'FPR3', FH1: 'IFH1', FH2: 'IFH2', FH3: 'IFH3', IFH1: 'IFH1', IFH2: 'IFH2', IFH3: 'IFH3', IGP1: 'FPR1', IGP2: 'FPR2', IGP3: 'FPR3',
};

export class Store {
  st: TrialState;
  M: Model;
  tx: Transient;
  version = 0;
  /** Aerial image kept in memory when it was too big for browser storage. */
  imgVolatile: string | null = null;
  private listeners = new Set<() => void>();
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(st?: TrialState) {
    this.st = st || loadState() || defaultState();
    this.tx = {
      drawMode: null, drawPts: [], calibPts: [], tilesOK: null, tileFailed: false, note: null, busy: null, shareUrl: '', incoming: null,
      saveNote: '', fitReq: 0, mapKey: 0, view: null, focus: null, scrollCard: false, searchRes: null,
    };
    // tracks missing or stale for their level (e.g. first run, or level changed in another version): place them now
    const M0 = plan(this.st, Date.now(), false);
    if (hasField(this.st) && M0.tracks.length && M0.tracks.some((t) => !t.geo || t.geo.level !== t.level)) this.safeGenerate();
    this.M = plan(this.st);
  }

  // ---- subscription (useSyncExternalStore) ----
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  emit() {
    this.version++;
    this.listeners.forEach((f) => f());
  }

  // ---- core ----
  save() {
    this.tx.saveNote = saveState(this.st);
  }
  recompute() {
    this.M = plan(this.st);
    this.emit();
  }
  /** Save and recompute the schedule. */
  commit() {
    this.save();
    this.recompute();
  }
  private safeGenerate(): boolean {
    try {
      const r = generateTracks(this.st);
      if (r.message) this.toast(r.message);
      return true;
    } catch (e) {
      console.error(e);
      this.toast('הצבת המסלולים נכשלה. הנתונים נשמרו; נסו "צור מסלולים מחדש".');
      return false;
    }
  }
  /** Re-place the tracks (in the background with a busy note), then recompute. In live mode tracks stay where they are. */
  regen(force = false) {
    this.save();
    if (this.st.live && !force) {
      this.toast('במצב חי המסלולים לא מוצבים מחדש אוטומטית. לחצו "צור מסלולים מחדש" אם צריך.');
      this.recompute();
      return;
    }
    if (!hasField(this.st)) {
      this.recompute();
      return;
    }
    this.tx.busy = 'מציב מסלולים בשטח…';
    this.emit();
    setTimeout(() => {
      try {
        this.safeGenerate();
      } finally {
        this.tx.busy = null;
        this.save();
        this.recompute();
      }
    }, 30);
  }
  toast(msg: string) {
    this.tx.note = msg;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.tx.note = null;
      this.emit();
    }, 7000);
    this.emit();
  }
  now() {
    return Math.round(nowMin(this.st.settings.date) * 10) / 10;
  }
  track(id: string) {
    return this.M.tracks.find((t) => t.id === id) || null;
  }

  // ---- header / ui ----
  setTab(tab: string) {
    this.st.ui.tab = tab;
    this.save();
    this.emit();
  }
  setDate(v: string) {
    this.st.settings.date = v || todayISO();
    this.commit();
  }
  setStart(v: string) {
    this.st.settings.start = v || '07:00';
    this.commit();
  }
  toggleLive() {
    this.st.live = !this.st.live;
    if (this.st.live) this.st.ui.tab = 'live';
    this.commit();
  }
  zoomTimeline(dir: 1 | -1) {
    const u = this.st.ui;
    u.zoom = Math.max(0.8, Math.min(8, u.zoom * (dir === 1 ? 1.3 : 1 / 1.3)));
    this.save();
    this.emit();
  }
  select(id: string, fromMap = false) {
    const u = this.st.ui;
    u.sel = u.sel === id && !fromMap ? null : id;
    if (u.sel) this.tx.focus = { id, n: (this.tx.focus?.n || 0) + 1 };
    if (fromMap && u.tab !== 'cards') u.tab = 'cards';
    this.tx.scrollCard = fromMap;
    this.save();
    this.emit();
  }
  toggleRoutes(on: boolean) {
    this.st.ui.showRoutes = on;
    this.save();
    this.emit();
  }

  // ---- competitors ----
  addCompetitor(handler: string, dog: string, level: LevelKey): boolean {
    handler = handler.trim();
    dog = dog.trim();
    if (!handler && !dog) {
      this.toast('הזינו שם מוביל או שם כלב.');
      return false;
    }
    this.st.competitors.push({ id: uid(), handler, dog, level });
    this.regen();
    return true;
  }
  bulkAdd(text: string) {
    let n = 0, bad = 0;
    text.split('\n').map((x) => x.trim()).filter(Boolean).forEach((line) => {
      const p = line.split(/[,\t;]/).map((x) => x.trim());
      const l = BULK_LEVELS[(p[2] || '').toUpperCase().replace(/[\s-]/g, '')];
      if (!l) { bad++; return; }
      this.st.competitors.push({ id: uid(), handler: p[0] || '', dog: p[1] || '', level: l });
      n++;
    });
    this.regen();
    this.toast(`נוספו ${n} נבחנים${bad ? `, ${bad} שורות לא זוהו (בדקו את שם הרמה)` : ''}.`);
    return n;
  }
  deleteCompetitor(id: string) {
    this.st.competitors = this.st.competitors.filter((c) => c.id !== id);
    this.regen();
  }
  setCompetitorLevel(id: string, level: LevelKey) {
    const c = this.st.competitors.find((x) => x.id === id);
    if (c) c.level = level;
    this.regen();
  }
  clearExample() {
    this.st.competitors = this.st.competitors.filter((c) => !c.example);
    this.st.draws = {};
    this.regen();
  }

  // ---- map mode / layers ----
  setMode(mode: MapMode) {
    const m = this.st.map;
    if (m.mode === mode) return;
    const prev = m.mode;
    m.mode = mode;
    const fresh = this.swapLayout(prev);
    if (mode === 'satellite') this.st.ui.tab = 'field';
    this.tx.mapKey++;
    this.tx.fitReq++;
    if (fresh) this.regen();
    else this.commit();
  }
  /** Each map type keeps its own field, so the grid demo never leaks onto the real map. Returns true when a field was restored. */
  private swapLayout(prev: MapMode): boolean {
    const m = this.st.map;
    m.layouts = m.layouts || {};
    m.layouts[prev] = { fields: m.fields, paths: m.paths, base: m.base, origin: m.origin, center: m.center };
    const L0 = m.layouts[m.mode];
    this.st.geo = {};
    this.st.trackNo = {};
    this.st.lastGen = null;
    if (L0 && L0.fields && L0.fields.some((f) => f && f.length > 2)) {
      m.fields = L0.fields;
      m.paths = L0.paths || [];
      m.base = L0.base;
      if (L0.origin) m.origin = L0.origin;
      m.center = L0.center;
      return true;
    }
    if (m.mode === 'schematic') {
      const d = defaultState().map;
      m.fields = d.fields;
      m.paths = d.paths;
      m.base = d.base;
      return true;
    }
    m.fields = [];
    m.paths = [];
    m.base = [0, 0];
    if (m.mode === 'satellite') this.toast('חפשו את המקום או לחצו "המיקום שלי", ואז "סמן שטח" ולחצו על פינות השטח שבחרתם.');
    if (m.mode === 'image' && !m.image) this.toast('העלו תמונת אוויר של השטח בלשונית "שטח ומפה".');
    return false;
  }
  setLayer(layer: 'sat' | 'street') {
    this.st.ui.layer = layer;
    this.save();
    this.emit();
  }
  probeTiles() {
    if (typeof Image === 'undefined') return;
    const im = new Image();
    const done = (v: boolean) => {
      if (this.tx.tilesOK === v) return;
      this.tx.tilesOK = v;
      this.emit();
    };
    im.onload = () => done(true);
    im.onerror = () => done(false);
    setTimeout(() => { if (this.tx.tilesOK == null) done(false); }, 6000);
    im.src = ESRI + 'World_Imagery/MapServer/tile/8/105/153?probe=' + Date.now();
  }
  tileError() {
    if (this.tx.tileFailed) return;
    this.tx.tileFailed = true;
    this.emit();
  }
  tilesReset() {
    this.tx.tileFailed = false;
  }
  goTo(ll: LatLng, z = 16) {
    this.tx.view = { ll, z, n: (this.tx.view?.n || 0) + 1 };
    this.emit();
  }
  async search(q: string) {
    q = q.trim();
    if (!q) return;
    const ll = q.split(/[ ,]+/).map(Number);
    if (ll.length === 2 && ll.every((x) => !isNaN(x))) {
      this.tx.searchRes = null;
      this.goTo([ll[0], ll[1]]);
      return;
    }
    this.tx.searchRes = 'מחפש…';
    this.emit();
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=6&accept-language=he&countrycodes=il&q=' + encodeURIComponent(q));
      const js = (await r.json()) as { lat: string; lon: string; display_name: string }[];
      this.tx.searchRes = js.length ? js.map((x) => ({ label: x.display_name.split(',').slice(0, 3).join(','), ll: [+x.lat, +x.lon] as LatLng })) : 'לא נמצאו תוצאות.';
    } catch {
      this.tx.searchRes = 'החיפוש לא זמין כרגע. הזינו קואורדינטות, למשל 31.84, 34.80.';
    }
    this.emit();
  }
  myLocation() {
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => this.goTo([pos.coords.latitude, pos.coords.longitude], 17),
        () => this.toast('לא התקבל מיקום. אשרו גישה למיקום או חפשו את המקום.'),
      );
    } catch {
      this.toast('המיקום לא זמין בדפדפן הזה.');
    }
  }

  // ---- drawing ----
  startDraw(mode: Exclude<DrawMode, null>) {
    this.tx.drawMode = mode;
    this.tx.drawPts = [];
    if (mode === 'calib') this.tx.calibPts = [];
    this.emit();
  }
  cancelDraw() {
    this.tx.drawMode = null;
    this.tx.drawPts = [];
    this.tx.calibPts = [];
    this.emit();
  }
  undoPoint() {
    this.tx.drawPts.pop();
    this.emit();
  }
  mapClick(p: Pt) {
    const tx = this.tx;
    if (tx.drawMode === 'field' || tx.drawMode === 'path') {
      const last = tx.drawPts[tx.drawPts.length - 1];
      if (!last || dist(last, p) > 1.5) tx.drawPts.push(p);
      this.emit();
    } else if (tx.drawMode === 'base') {
      this.st.map.base = p;
      tx.drawMode = null;
      this.commit();
    } else if (tx.drawMode === 'calib') {
      tx.calibPts.push(p);
      if (tx.calibPts.length === 2) tx.drawMode = null;
      this.emit();
    }
  }
  mapDblClick() {
    if (this.tx.drawMode === 'field') this.finishField();
    else if (this.tx.drawMode === 'path') this.finishPath();
  }
  private centroid(): Pt {
    const f = allFieldPts(this.st);
    return [f.reduce((a, q) => a + q[0], 0) / f.length, f.reduce((a, q) => a + q[1], 0) / f.length];
  }
  /** In satellite mode keep the local metric frame centred on the field, so the flat-earth conversion stays accurate. */
  private reorigin(ll: LatLng) {
    const st = this.st, m = st.map;
    const f = m.fields.map((x) => x.map((p) => toLL(st, p)));
    const pa = m.paths.map((x) => x.map((p) => toLL(st, p)));
    const b = toLL(st, m.base);
    const dp = this.tx.drawPts.map((p) => toLL(st, p));
    m.origin = ll;
    m.fields = f.map((x) => x.map((q) => fromLL(st, q)));
    m.paths = pa.map((x) => x.map((q) => fromLL(st, q)));
    m.base = fromLL(st, b);
    this.tx.drawPts = dp.map((q) => fromLL(st, q));
  }
  finishField() {
    const st = this.st, m = st.map, tx = this.tx;
    let added = false;
    if (tx.drawPts.length >= 3) {
      if (m.mode === 'satellite' && !hasField(st)) {
        const lls = tx.drawPts.map((p) => toLL(st, p));
        const la = lls.map((x) => x[0]), lo = lls.map((x) => x[1]);
        this.reorigin([(Math.min(...la) + Math.max(...la)) / 2, (Math.min(...lo) + Math.max(...lo)) / 2]);
      }
      m.fields = m.fields.filter((f) => f && f.length > 2);
      m.fields.push(tx.drawPts.slice());
      st.geo = {};
      st.trackNo = {};
      added = true;
    }
    const P0 = getPaths(st)[0];
    const baseUnset = m.base[0] === 0 && m.base[1] === 0;
    if (P0 && (m.fields.length === 1 || baseUnset) && (baseUnset || dist(m.base, P0.pts[0]) > 600)) m.base = [P0.pts[0][0], P0.pts[0][1]];
    tx.drawMode = null;
    tx.drawPts = [];
    if (m.mode === 'satellite' && hasField(st)) m.center = toLL(st, this.centroid());
    this.regen();
    if (added)
      this.toast(m.fields.length > 1
        ? `נוסף שטח ${m.fields.length}. המסלולים מתחלקים בין השטחים לפי סדר הסימון.`
        : 'המסלולים הוצבו לאורך שביל גישה אוטומטי. אם יש בשטח שביל אמיתי, סמנו אותו ב"סמן שביל גישה".');
  }
  finishPath() {
    const st = this.st, m = st.map, tx = this.tx;
    if (tx.drawPts.length >= 2) {
      m.paths = m.paths.filter((p) => p && p.length >= 2);
      m.paths.push(tx.drawPts.slice());
      st.geo = {};
      st.trackNo = {};
      if (!hasField(st) || dist(m.base, tx.drawPts[0]) > 3000) m.base = [tx.drawPts[0][0], tx.drawPts[0][1]];
      if (hasField(st) && pathField(st, tx.drawPts) < 0) this.toast('השביל לא נמצא ליד אף שטח מסומן.');
    }
    tx.drawMode = null;
    tx.drawPts = [];
    this.regen();
  }
  moveVertex(kind: 'field' | 'path', i: number, k: number, p: Pt) {
    const list = kind === 'field' ? this.st.map.fields : this.st.map.paths;
    if (list[i] && list[i][k]) list[i][k] = p;
    this.regen();
  }
  deleteField(i: number) {
    this.st.map.fields.splice(i, 1);
    this.clearLayoutResults();
    this.regen();
  }
  deletePath(i: number) {
    this.st.map.paths.splice(i, 1);
    this.clearLayoutResults();
    this.regen();
  }
  clearFields() {
    const m = this.st.map;
    m.fields = [];
    m.paths = [];
    this.clearLayoutResults();
    if (m.layouts) delete m.layouts[m.mode];
    this.commit();
    this.toast('השטח נמחק. לחצו "סמן שטח" כדי לסמן שטח חדש.');
  }
  private clearLayoutResults() {
    this.st.geo = {};
    this.st.trackNo = {};
    this.st.lastGen = null;
    this.st.ui.sel = null;
  }

  // ---- aerial image ----
  uploadImage(file: File) {
    const fr = new FileReader();
    fr.onload = () => {
      const url = String(fr.result);
      const im = new Image();
      im.onload = () => {
        const m = this.st.map;
        m.image = { url, w: im.naturalWidth, h: im.naturalHeight, scale: 1 };
        this.imgVolatile = url;
        m.fields = [];
        m.paths = [];
        m.base = [im.naturalWidth * 0.05, im.naturalHeight * 0.05];
        this.st.geo = {};
        this.tx.mapKey++;
        this.tx.fitReq++;
        this.commit();
        this.toast('התמונה נטענה. עכשיו כיילו קנה מידה: "כיול קנה מידה" ושתי נקודות עם מרחק ידוע.');
      };
      im.src = url;
    };
    fr.readAsDataURL(file);
  }
  calibrate(real: number) {
    const [a, b] = this.tx.calibPts;
    const meas = a && b ? dist(a, b) : 0;
    const m = this.st.map;
    if (real > 0 && meas > 0 && m.image) {
      const k = real / meas;
      const sc = (p: Pt): Pt => [p[0] * k, p[1] * k];
      m.image.scale *= k;
      m.fields = m.fields.map((f) => f.map(sc));
      m.paths = m.paths.map((f) => f.map(sc));
      m.base = sc(m.base);
      this.st.geo = {};
      this.st.trackNo = {};
    }
    this.tx.calibPts = [];
    this.tx.mapKey++;
    this.tx.fitReq++;
    this.commit();
    this.toast('קנה המידה עודכן. סמנו את השטח וצרו מסלולים.');
  }

  // ---- groups / draws ----
  setGroupSize(n: number) {
    this.st.settings.groupSize = n;
    this.regen();
  }
  draw(gid: string) {
    const g = this.M.groups.find((x) => x.id === gid);
    if (!g) return;
    this.st.draws[gid] = { sig: g.sig, order: shuffle(g.members), at: Date.now() };
    this.commit();
  }
  undraw(gid: string) {
    delete this.st.draws[gid];
    this.commit();
  }
  setGroupJudge(gid: string, j: number) {
    this.st.judgeOverride[gid] = j;
    this.commit();
  }

  // ---- recorded times ----
  private act(id: string): Actual {
    return (this.st.actuals[id] = this.st.actuals[id] || {});
  }
  /** Record a step at time tm (default: now). Filling the end of a step fills a missing start from the plan. */
  mark(id: string, k: keyof Actual, tm?: number) {
    const t = this.track(id);
    if (!t) return;
    const ac = this.act(id);
    const v = tm ?? this.now();
    if (k === 'ls') ac.res = t.res;
    ac[k] = v;
    if (k === 'le' && ac.ls == null) { ac.ls = v - t.layDur; ac.res = t.res; }
    if (k === 'je' && ac.js == null) ac.js = v - t.est;
    this.commit();
  }
  /** A typed HH:MM, placed on the day nearest the planned time of that step. */
  timeFor(id: string, k: keyof Actual | 'pin', hhmm: string): number | null {
    const t = this.track(id);
    if (!t || !hhmm) return null;
    let v = hm(hhmm);
    const ref = k === 'ls' || k === 'le' || k === 'pin' ? t.layStart : k === 'cs' ? (t.crossT || [])[0]?.s ?? t.start : t.start;
    while (v < ref - 720) v += 1440;
    return v;
  }
  setActual(id: string, k: keyof Actual, hhmm: string) {
    if (!hhmm) return this.unmark(id, k);
    const v = this.timeFor(id, k, hhmm);
    if (v != null) this.mark(id, k, v);
  }
  unmark(id: string, k: keyof Actual) {
    const ac = this.st.actuals[id];
    if (ac) {
      delete ac[k];
      if (k === 'ls') { delete ac.le; delete ac.res; }
    }
    this.commit();
  }
  resetActuals() {
    this.st.actuals = {};
    this.commit();
  }
  pinShift(id: string, mins: number) {
    const t = this.track(id);
    if (!t) return;
    const cur = this.st.pins[id];
    this.st.pins[id] = Math.round((cur != null ? Math.max(cur, t.start) : t.start) + mins);
    this.commit();
  }
  setPin(id: string, hhmm: string) {
    if (!hhmm) return this.clearPin(id);
    const v = this.timeFor(id, 'pin', hhmm);
    if (v != null) this.st.pins[id] = v;
    this.commit();
  }
  clearPin(id: string) {
    delete this.st.pins[id];
    this.commit();
  }

  // ---- settings ----
  setSetting(key: keyof Settings, v: number) {
    (this.st.settings as unknown as Record<string, number>)[key] = v;
    if (REGEN_KEYS.includes(key)) this.regen();
    else this.commit();
  }
  setAging(k: LevelKey, v: number) {
    this.st.settings.aging[k] = Math.max(LEVELS[k].aging, v || 0);
    this.regen();
  }
  setEst(k: LevelKey, v: number) {
    this.st.settings.est[k] = Math.min(LEVELS[k].work, Math.max(3, v || 3));
    this.regen();
  }
  moveLevel(i: number, d: number) {
    const o = this.st.settings.levelOrder;
    [o[i], o[i + d]] = [o[i + d], o[i]];
    this.st.settings.autoOrder = false;
    this.regen();
  }
  setAutoOrder(on: boolean) {
    this.st.settings.autoOrder = on;
    if (on) this.regen();
    else this.commit();
  }

  // ---- backup ----
  exportText() {
    return JSON.stringify(this.st);
  }
  importText(text: string): boolean {
    try {
      const v = JSON.parse(text);
      if (!v || !v.settings) throw new Error('not a backup');
      this.st = normalize(v);
      this.tx.mapKey++;
      this.tx.fitReq++;
      this.commit();
      this.toast('הגיבוי נטען.');
      return true;
    } catch {
      this.toast('הטקסט בתיבה אינו גיבוי תקין של המערכת.');
      return false;
    }
  }
  reset() {
    this.st = defaultState();
    this.safeGenerate();
    this.tx.mapKey++;
    this.tx.fitReq++;
    this.commit();
  }

  // ---- copying ----
  async copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.toast('הועתק.');
      return true;
    } catch {
      this.toast('ההעתקה נחסמה. סמנו את הטקסט ידנית.');
      return false;
    }
  }
  scheduleText(full: boolean) {
    const s = this.st.settings;
    const ev = events(this.M);
    if (!full)
      return `לו״ז יציאות, מבחן גישוש ${s.date}\n` + ev.filter((x) => x.kind === 'judge').map((x) => {
        const t = this.M.tracks.find((y) => y.no === x.trackNo);
        return `${fmt(x.t)}  ${LEVELS[x.level].short} · מסלול ${x.trackNo} · ${t ? compName(t) : ''}`;
      }).join('\n');
    return `לו״ז מלא, מבחן גישוש ${s.date}\n` + ev.map((x) => `${fmt(x.t)}  ${LEVELS[x.level].short} · ${x.text} · ${x.who}`).join('\n');
  }
  cardsText() {
    return this.M.tracks.slice().sort((a, b) => a.no - b.no).map((t) => trackCard(t, this.st.settings)).join('\n\n———\n\n');
  }

  // ---- sharing ----
  async makeShare() {
    try {
      const code = await packShare(this.st);
      this.tx.shareUrl = location.origin + location.pathname + '#s=' + code;
      this.emit();
    } catch {
      this.toast('לא הצלחתי ליצור קישור בדפדפן הזה.');
    }
  }
  async checkIncoming() {
    const h = location.hash || '';
    if (!h.startsWith('#s=')) return;
    try {
      this.tx.incoming = await unpackShare(h.slice(3));
    } catch {
      this.tx.incoming = null;
      this.toast('קישור השיתוף פגום או נחתך באמצע. בקשו קישור חדש.');
      return;
    }
    this.emit();
  }
  private clearHash() {
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch {
      location.hash = '';
    }
  }
  acceptShare() {
    if (!this.tx.incoming) return;
    this.st = stateFromShare(this.tx.incoming);
    this.tx.incoming = null;
    this.clearHash();
    this.tx.mapKey++;
    this.tx.fitReq++;
    this.commit();
    this.toast('המבחן המשותף נפתח ונשמר במכשיר הזה.');
  }
  rejectShare() {
    this.tx.incoming = null;
    this.clearHash();
    this.emit();
  }
}

export const store = new Store();
if (typeof window !== 'undefined') {
  (window as unknown as { __ttm: unknown }).__ttm = { store, state: () => store.st, model: () => store.M };
}
