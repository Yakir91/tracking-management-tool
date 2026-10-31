import { useLayoutEffect, useRef } from 'react';
import { fmt, hmStr, resName, rng } from '../engine';
import type { Actual, Track } from '../engine/types';
import { store } from '../state/store';
import { TimeInput, useStore } from './common';

/** Labels in a fixed column, bars scrolling sideways in their own column, so no bar hides under a label. */
export function Timeline() {
  const { st, M } = useStore();
  const scroller = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  const has = M.tracks.length > 0;
  const z = st.ui.zoom;
  const firstCross = Math.min(...M.tracks.map((t) => (t.crossT && t.crossT[0] ? t.crossT[0].s : Infinity)));
  const t0 = Math.floor((Math.min(M.firstLay, firstCross) - 10) / 30) * 30;
  const t1 = Math.ceil((M.lastEnd + 10) / 30) * 30;
  const x = (m: number) => (m - t0) * z;

  useLayoutEffect(() => {
    if (!has || placed.current || !scroller.current) return;
    placed.current = true;
    const focus = st.live && isFinite(M.NOW) ? M.NOW : M.firstLay;
    scroller.current.scrollLeft = Math.max(0, x(focus) - 60);
  });

  if (!has)
    return (
      <div className="gantt-wrap">
        <div className="gantt-head">
          <h2>ציר זמן לפי מסלול</h2>
        </div>
      </div>
    );

  const ticks: number[] = [];
  for (let m = t0; m <= t1; m += 30) ticks.push(m);
  const rows = M.tracks.slice().sort((a, b) => a.no - b.no);
  const showNow = st.live && M.NOW > t0 && M.NOW < t1;
  const sel = st.ui.sel;
  const grid = (
    <>
      {ticks.map((m) => <span key={m} className="gl" style={{ left: x(m) }} />)}
      {showNow && <span className="nowline" style={{ left: x(M.NOW) }} />}
    </>
  );
  return (
    <div className="gantt-wrap">
      <div className="gantt-head">
        <h2>ציר זמן לפי מסלול</h2>
        <div className="row">
          <span className="note">פס מלא: הנחת המסלול · קו דק: השהייה · מסגרת: עבודת הכלב · קו שחור: עקבה חוצה. לחצו על מסלול כדי לעדכן זמנים.</span>
          <button className="btn sm" type="button" aria-label="הקטן ציר זמן" onClick={() => store.zoomTimeline(-1)}>−</button>
          <button className="btn sm" type="button" aria-label="הגדל ציר זמן" onClick={() => store.zoomTimeline(1)}>+</button>
        </div>
      </div>
      <div className="gantt" data-testid="gantt">
        <div className="g-scroll" ref={scroller}>
          <div className="g-inner" style={{ width: (t1 - t0) * z }}>
            <div className="g-axis">
              {ticks.map((m) => (
                <span key={m} className="tick" style={{ left: x(m) }}>{fmt(m)}</span>
              ))}
            </div>
            {rows.map((t) => {
              const c = t.lv.color, a = t.act;
              return (
                <div key={t.id} className={'g-row' + (sel === t.id ? ' sel' : '')} onClick={() => store.select(t.id)}>
                  {grid}
                  <span className={'bar lay' + (a.le != null ? ' done' : '')} style={{ left: x(t.layStart), width: Math.max(2, (t.layEnd - t.layStart) * z), background: c }} title={'הנחה ' + rng(t.layStart, t.layEnd)} />
                  <span className="bar age" style={{ left: x(t.layEnd), width: Math.max(0, (t.start - t.layEnd) * z), background: c }} title={`השהייה ${Math.round(t.age)} דק׳ (מינימום ${t.aging})`} />
                  <span className={'bar jud' + (a.je != null ? ' done' : '')} style={{ left: x(t.start), width: Math.max(2, (t.end - t.start) * z), background: `color-mix(in srgb,${c} 55%,transparent)` }} title={'עבודת הכלב ' + rng(t.start, t.end)} />
                  {(t.crossT || []).map((cc, i) => <span key={i} className="xt" style={{ left: x(cc.e) }} title={'עקבה חוצה ' + rng(cc.s, cc.e)} />)}
                </div>
              );
            })}
          </div>
        </div>
        <div className="g-labels">
          <div className="g-axis g-lab">מסלול · רמה · נבחן</div>
          {rows.map((t) => (
            <div key={t.id} className={'g-row g-lab' + (sel === t.id ? ' sel' : '')} onClick={() => store.select(t.id)}>
              <span className="lv">
                <i style={{ background: t.lv.color }} />
                {t.no}
              </span>
              <b>{t.lv.short}</b>
              <span className="who">{who(t)}</span>
            </div>
          ))}
        </div>
      </div>
      <TrackControl />
    </div>
  );
}

const who = (t: Track) => (t.comp ? `${t.comp.handler} · ${t.comp.dog}` : t.group.noDraw ? '' : 'טרם הוגרל');

/** Planned times next to the recorded ones for the selected track, with "now" buttons and editable times. */
function TrackControl() {
  const { st, M } = useStore();
  const t = M.tracks.find((x) => x.id === st.ui.sel);
  if (!t) return null;
  const a = t.act, id = t.id, pin = st.pins[id];
  const ct = (t.crossT || [])[0];
  const w = t.comp ? `${t.comp.handler} עם ${t.comp.dog}` : t.group.noDraw ? '' : 'טרם הוגרל';
  const ageNow = a.le != null && st.live && isFinite(M.NOW) ? Math.round(M.NOW - a.le) : null;
  const cell = (k: keyof Actual, label: string) => (
    <div className="act">
      <span className="lbl">{label}</span>
      <TimeInput label={label} data-actual={k} value={a[k] != null ? hmStr(a[k]!) : ''} onCommit={(v) => store.setActual(id, k, v)} />
      <button className="btn sm" type="button" onClick={() => store.mark(id, k)}>עכשיו</button>
      {a[k] != null && <button className="btn sm ghost" type="button" aria-label="נקה" onClick={() => store.unmark(id, k)}>✕</button>}
    </div>
  );
  return (
    <div className="ctrl" data-testid="ctrl">
      <div className="hd">
        <b>מסלול {t.no} · {t.lv.short}{w ? ' · ' + w : ''}</b>
        <div className="row">
          <span className="note">{resName(t)}</span>
          <button className="btn sm" type="button" onClick={() => store.select(id)}>סגור</button>
        </div>
      </div>
      <div className="tw">
        <table>
          <thead>
            <tr><th>שלב</th><th>מתוכנן</th><th>בפועל</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>הנחת המסלול</td>
              <td className="num">{rng(t.layStart, t.layEnd)}</td>
              <td><div className="act">{cell('ls', 'התחלה')}{cell('le', 'סיום')}</div></td>
            </tr>
            {t.lv.cross > 0 && (
              <tr>
                <td>עקבה חוצה</td>
                <td className="num">{ct ? rng(ct.s, ct.e) : '—'}</td>
                <td>{cell('cs', 'הונחה')}</td>
              </tr>
            )}
            <tr>
              <td>יציאת הכלב</td>
              <td className="num">{fmt(t.start)}</td>
              <td><div className="act">{cell('js', 'יצא')}{cell('je', 'סיים')}</div></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="row">
        <span className="lbl">
          גיל המסלול ביציאה: <b className="mono">{Math.round(t.age)}</b> דק׳ (מינימום {t.aging}){ageNow != null ? ` · גיל עכשיו ${ageNow} דק׳` : ''}
        </span>
      </div>
      <div className="act">
        <span className="lbl">הכלב יעלה לא לפני</span>
        <TimeInput label="הכלב יעלה לא לפני" data-pin={id} value={pin != null ? hmStr(pin) : ''} onCommit={(v) => store.setPin(id, v)} />
        <button className="btn sm" type="button" onClick={() => store.pinShift(id, 5)}>+5 דק׳</button>
        <button className="btn sm" type="button" onClick={() => store.pinShift(id, 15)}>+15 דק׳</button>
        {pin != null && <button className="btn sm ghost" type="button" onClick={() => store.clearPin(id)}>בטל</button>}
      </div>
      <p className="note">שעה שנרשמה בפועל נועלת את השלב, והלו״ז של כל השאר מתעדכן לפיה. "לא לפני" דוחה את הכלב הזה, ומי שאחריו זז בהתאם.</p>
      {t.lv.cross > 0 && a.cs == null && a.js != null && <p className="warn">הכלב יצא לפני שנרשמה הנחת העקבה החוצה.</p>}
      {a.js != null && a.le != null && a.js - a.le < t.aging - 0.5 && (
        <p className="warn">הכלב יצא כשהמסלול בן {Math.round(a.js - a.le)} דק׳, פחות מההשהייה המינימלית ({t.aging} דק׳).</p>
      )}
    </div>
  );
}
