import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { allFieldPts, fieldsOf, getPaths, hasField, LEVELS } from '../engine';
import { bboxOf, dist, pathAt, pathLen, polyArea } from '../engine/geometry';
import type { Pt, TrialState } from '../engine/types';
import { fromLL, toLL } from '../state/coords';
import { store, TILE_URL } from '../state/store';
import { useStore } from './common';

const icon = (html: string, cls = '', size: [number, number] | null = [0, 0]) => L.divIcon({ html, className: cls, iconSize: size || undefined });
const ll = (st: TrialState, p: Pt) => L.latLng(toLL(st, p));
const lls = (st: TrialState, ps: Pt[]) => ps.map((p) => ll(st, p));
const p2 = (st: TrialState, x: L.LatLng): Pt => fromLL(st, [x.lat, x.lng]);

function fitField(map: L.Map, st: TrialState) {
  const m = st.map;
  let pts: Pt[] | null = hasField(st) ? allFieldPts(st).concat(m.paths.flat()) : null;
  if (!pts && m.mode === 'image' && m.image) pts = [[0, 0], [m.image.w * m.image.scale, m.image.h * m.image.scale]];
  if (pts) map.fitBounds(L.latLngBounds(lls(st, pts)), { padding: [30, 30] });
  else if (m.mode !== 'satellite') map.setView([0, 0], -1);
}

export function MapView() {
  const S = useStore();
  const { st, tx, M } = S;
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const lyrRef = useRef<L.LayerGroup | null>(null);
  const lastView = useRef<{ mode: string; c: L.LatLng; z: number } | null>(null);
  const imgUrl = st.map.image ? st.map.image.url || S.imgVolatile : null;

  // build the map when the map type, layer or image changes
  useEffect(() => {
    if (!el.current) return;
    const m = st.map;
    store.tilesReset();
    let map: L.Map;
    if (m.mode === 'satellite') {
      map = L.map(el.current, { zoomControl: true, doubleClickZoom: false, maxZoom: 20 }).setView(m.center || m.origin, 16);
      const tl = L.tileLayer(TILE_URL(st.ui.layer), { maxZoom: 20, maxNativeZoom: 19, attribution: 'Esri' });
      tl.on('tileerror', () => store.tileError());
      tl.addTo(map);
      L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);
    } else {
      map = L.map(el.current, { crs: L.CRS.Simple, minZoom: -5, maxZoom: 4, zoomSnap: 0.25, doubleClickZoom: false, attributionControl: false });
      if (m.mode === 'image' && m.image && imgUrl) {
        const sc = m.image.scale;
        L.imageOverlay(imgUrl, [[0, 0], [m.image.h * sc, m.image.w * sc]]).addTo(map);
      }
    }
    lyrRef.current = L.layerGroup().addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => store.mapClick(p2(store.st, e.latlng)));
    map.on('dblclick', () => store.mapDblClick());
    mapRef.current = map;
    // switching only the layer keeps the view; anything else fits the field
    const lv = lastView.current;
    if (lv && lv.mode === m.mode) map.setView(lv.c, lv.z);
    else fitField(map, store.st);
    store.emit();
    return () => {
      lastView.current = { mode: m.mode, c: map.getCenter(), z: map.getZoom() };
      map.remove();
      mapRef.current = null;
      lyrRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.map.mode, st.ui.layer, imgUrl, tx.mapKey]);

  useEffect(() => {
    if (mapRef.current && tx.fitReq) {
      lastView.current = null;
      fitField(mapRef.current, store.st);
    }
  }, [tx.fitReq]);
  useEffect(() => {
    if (mapRef.current && tx.view) mapRef.current.setView(tx.view.ll, tx.view.z);
  }, [tx.view]);
  useEffect(() => {
    const map = mapRef.current, f = tx.focus;
    if (!map || !f || store.st.ui.sel !== f.id) return;
    const t = store.track(f.id);
    if (t && t.geo) map.fitBounds(L.latLngBounds(lls(store.st, t.geo.pts.concat(t.geo.cross.flatMap((c) => [c.a, c.b])))), { padding: [40, 40], maxZoom: map.getZoom() + 2 });
  }, [tx.focus]);

  // draw everything on each change
  useEffect(() => {
    const map = mapRef.current, lyr = lyrRef.current;
    if (!map || !lyr) return;
    lyr.clearLayers();
    const s = st.settings, m = st.map, dm = tx.drawMode, dp = tx.drawPts;
    const add = <T extends L.Layer>(x: T) => x.addTo(lyr) as T;
    if (m.mode !== 'satellite') {
      const bb = bboxOf(hasField(st) ? allFieldPts(st).concat([m.base]) : [[0, 0], [500, 400]], 120);
      const step = 50, col = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim() || '#ccc';
      if (m.mode === 'schematic') {
        for (let x = Math.floor(bb[0] / step) * step; x <= bb[2]; x += step)
          add(L.polyline(lls(st, [[x, bb[1]], [x, bb[3]]]), { color: col, weight: x % 250 === 0 ? 1.4 : 0.6, interactive: false }));
        for (let y = Math.floor(bb[1] / step) * step; y <= bb[3]; y += step)
          add(L.polyline(lls(st, [[bb[0], y], [bb[2], y]]), { color: col, weight: y % 250 === 0 ? 1.4 : 0.6, interactive: false }));
      }
      const sx = bb[0] + 20, sy = bb[1] + 20;
      add(L.polyline(lls(st, [[sx, sy], [sx + 100, sy]]), { color: '#111', weight: 4, interactive: false }));
      add(L.marker(ll(st, [sx + 50, sy + 12]), { icon: icon('<span class="m-lbl">100 מ׳ · צפון למעלה</span>'), interactive: false }));
    }
    const FF = fieldsOf(st);
    FF.forEach((f, k) => {
      add(L.polygon(lls(st, f), { color: '#de5510', weight: 2, fillColor: '#de5510', fillOpacity: m.mode === 'schematic' ? 0.06 : 0.03, dashArray: '6 5', interactive: false }));
      if (FF.length > 1) {
        const bb = bboxOf(f);
        add(L.marker(ll(st, [(bb[0] + bb[2]) / 2, bb[3] - 12]), { icon: icon(`<span class="m-lbl">שטח ${k + 1} · ${Math.round(polyArea(f) / 1000)} דונם</span>`), interactive: false }));
      }
    });
    getPaths(st).forEach((PA, k, arr) => {
      const p = lls(st, PA.pts);
      add(L.polyline(p, { color: '#fff', weight: 9, opacity: 0.85, interactive: false }));
      add(L.polyline(p, { color: '#8a5a1f', weight: 5, dashArray: PA.auto ? '10 8' : undefined, interactive: false }));
      const mid = pathAt(PA.pts, Math.min(60, pathLen(PA.pts) * 0.1));
      add(L.marker(ll(st, mid.p), { icon: icon(`<span class="m-lbl">שביל גישה${arr.length > 1 ? ' ' + (k + 1) : ''}${PA.auto ? ' (אוטומטי)' : ''}</span>`), interactive: false }));
    });
    if ((dm === 'field' || dm === 'path') && dp.length) {
      const segs: [Pt, Pt][] = [];
      for (let k = 1; k < dp.length; k++) segs.push([dp[k - 1], dp[k]]);
      if (dm === 'field' && dp.length > 2) {
        segs.push([dp[dp.length - 1], dp[0]]);
        add(L.polyline(lls(st, [dp[dp.length - 1], dp[0]]), { color: '#de5510', weight: 2, dashArray: '4 6', interactive: false }));
      }
      segs.forEach(([a, b]) => add(L.marker(ll(st, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), { icon: icon(`<span class="m-lbl">${Math.round(dist(a, b))} מ׳</span>`), interactive: false })));
      add(L.polyline(lls(st, dp), { color: dm === 'path' ? '#8a5a1f' : '#de5510', weight: 3, interactive: false }));
      dp.forEach((p) => add(L.circleMarker(ll(st, p), { radius: 4, color: '#de5510', interactive: false })));
    }
    if (tx.calibPts.length) {
      tx.calibPts.forEach((p) => add(L.circleMarker(ll(st, p), { radius: 5, color: '#111', fillColor: '#fff', fillOpacity: 1, interactive: false })));
      if (tx.calibPts.length === 2) add(L.polyline(lls(st, tx.calibPts), { color: '#111', dashArray: '4 4', interactive: false }));
    }
    add(L.marker(ll(st, m.base), { icon: icon('<span class="m-base">כינוס</span>'), interactive: false }));
    if (st.ui.tab === 'field' && !dm && hasField(st)) {
      const vtx = (kind: 'field' | 'path', i: number, k: number, q: Pt) => {
        const mk = add(L.marker(ll(st, q), {
          draggable: true, icon: L.divIcon({ className: 'm-vtx' + (kind === 'path' ? ' path' : ''), iconSize: kind === 'path' ? [12, 12] : [14, 14] }),
          title: kind === 'path' ? 'גררו כדי להזיז את השביל' : 'גררו כדי להזיז את פינת השטח',
        }));
        mk.on('dragend', () => store.moveVertex(kind, i, k, p2(store.st, mk.getLatLng())));
      };
      m.fields.forEach((f, i) => f && f.forEach((q, k) => vtx('field', i, k, q)));
      m.paths.forEach((pa, i) => pa && pa.forEach((q, k) => vtx('path', i, k, q)));
    }
    const sel = st.ui.sel;
    for (const t of M.tracks) {
      if (!t.geo) continue;
      const g = t.geo, col = t.lv.color, isSel = sel === t.id, dim = !!sel && !isSel;
      const done = t.act.je != null, op = dim ? 0.35 : done ? 0.45 : 1;
      if (t.approach && !done && (isSel || (st.ui.showRoutes && !sel)))
        add(L.polyline(lls(st, t.approach.path), { color: t.approach.blocked ? '#c0392b' : '#555', weight: 1.6, dashArray: '2 5', opacity: 0.9, interactive: false }));
      const p = lls(st, g.pts);
      add(L.polyline(p, { color: '#fff', weight: isSel ? 9 : 6, opacity: op, interactive: false }));
      const pl = add(L.polyline(p, { color: col, weight: isSel ? 5 : 3.2, opacity: op }));
      pl.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (store.tx.drawMode) store.mapClick(p2(store.st, (e as L.LeafletMouseEvent).latlng));
        else store.select(t.id, true);
      });
      pl.bindTooltip('מסלול ' + t.no + ' · ' + t.lv.short, { sticky: true, direction: 'top' });
      add(L.polyline(lls(st, g.tail), { color: col, weight: 2, dashArray: '3 4', opacity: op, interactive: false }));
      g.articles.forEach((a) => add(L.marker(ll(st, a.pt), { icon: icon('<span></span>', 'm-art', [9, 9]), interactive: false, opacity: op })));
      g.cross.forEach((c) => {
        add(L.polyline(lls(st, [c.a, c.b]), { color: '#fff', weight: 5, opacity: op, interactive: false }));
        add(L.polyline(lls(st, [c.a, c.b]), { color: '#111', weight: 2.4, dashArray: '7 5', opacity: op, interactive: false }));
        if (isSel) {
          add(L.marker(ll(st, c.a), { icon: icon('<span class="m-pt">A</span>'), interactive: false }));
          add(L.marker(ll(st, c.b), { icon: icon('<span class="m-pt">B</span>'), interactive: false }));
          c.cx.forEach((x) => add(L.circleMarker(ll(st, x.cp), { radius: 5, color: '#111', weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false })));
          (t.crossRoutes || []).forEach((r) => r && add(L.polyline(lls(st, r.path), { color: '#111', weight: 1.6, dashArray: '1 5', interactive: false })));
        }
      });
      const fl = add(L.marker(ll(st, g.pts[0]), { icon: icon(`<div class="m-flag" style="color:${col}"><span>${t.no}</span></div>`), opacity: op, title: 'מסלול ' + t.no }));
      fl.on('click', (e) => {
        if (store.tx.drawMode) store.mapClick(p2(store.st, (e as L.LeafletMouseEvent).latlng));
        else store.select(t.id, true);
      });
    }
    void s;
  });

  const used = [...new Set(M.tracks.map((t) => t.level))];
  const note = tx.note || (tx.tileFailed ? 'שרת המפה האמיתית לא זמין כרגע מהדפדפן הזה. בדקו את החיבור לאינטרנט, או עבדו עם תמונת אוויר או רשת סכמטית.' : null);
  return (
    <div className="mapwrap">
      <div id="map" ref={el} aria-label="מפת שטח הגישוש" />
      <MapTools />
      <div className="map-note" hidden={!note} role="status">
        {note}
      </div>
      {used.length > 0 && (
        <div className="legend">
          {used.map((k) => (
            <span key={k} className="lv">
              <i style={{ background: LEVELS[k].color }} />
              {LEVELS[k].short}
            </span>
          ))}
          <span className="lv">
            <i style={{ background: '#111', height: 3 }} />
            עקבה חוצה
          </span>
          <span className="lv">
            <i style={{ background: 'transparent', borderTop: '2px dotted #555', height: 0 }} />
            נתיב הליכה
          </span>
        </div>
      )}
    </div>
  );
}

function MapTools() {
  const { st, tx } = useStore();
  const dm = tx.drawMode, n = tx.drawPts.length;
  return (
    <div className="map-tools">
      {dm === 'field' && (
        <>
          <button className="btn pri" type="button" onClick={() => store.finishField()}>
            סיים שטח{n > 2 ? ` · ${Math.round(polyArea(tx.drawPts) / 1000)} דונם` : ` (${n} נקודות)`}
          </button>
          {n > 0 && <button className="btn" type="button" onClick={() => store.undoPoint()}>בטל נקודה אחרונה</button>}
          <button className="btn" type="button" onClick={() => store.cancelDraw()}>בטל</button>
        </>
      )}
      {dm === 'path' && (
        <>
          <button className="btn pri" type="button" onClick={() => store.finishPath()}>סיים שביל ({n})</button>
          {n > 0 && <button className="btn" type="button" onClick={() => store.undoPoint()}>בטל נקודה אחרונה</button>}
          <button className="btn" type="button" onClick={() => store.cancelDraw()}>בטל</button>
        </>
      )}
      {dm === 'base' && <span className="btn">לחצו על נקודת הכינוס</span>}
      {dm === 'calib' && <span className="btn">לחצו על שתי נקודות עם מרחק ידוע</span>}
      {!dm && st.map.mode === 'satellite' && (
        <div className="seg">
          <button type="button" aria-pressed={st.ui.layer !== 'street'} onClick={() => store.setLayer('sat')}>תצלום אוויר</button>
          <button type="button" aria-pressed={st.ui.layer === 'street'} onClick={() => store.setLayer('street')}>מפה</button>
        </div>
      )}
      {!dm && st.map.mode !== 'satellite' && tx.tilesOK && (
        <button className="btn pri" type="button" onClick={() => store.setMode('satellite')}>עבור למפה אמיתית</button>
      )}
    </div>
  );
}
