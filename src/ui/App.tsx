import { useEffect, useState } from 'react';
import { dur, fmt, pad, shareSummary, warnings } from '../engine';
import { store } from '../state/store';
import { useStore } from './common';
import { MapView } from './MapView';
import { Panel } from './Panel';
import { Timeline } from './Timeline';

export function App() {
  useEffect(() => {
    store.probeTiles();
    store.checkIncoming();
    const iv = setInterval(() => { if (store.st.live) store.recompute(); }, 30000);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && store.tx.drawMode) store.cancelDraw(); };
    document.addEventListener('keydown', onKey);
    return () => {
      clearInterval(iv);
      document.removeEventListener('keydown', onKey);
    };
  }, []);
  const { tx } = useStore();
  return (
    <div className="app" dir="rtl" lang="he">
      <Header />
      {tx.incoming && <ShareBanner />}
      <Kpis />
      <div className="main">
        <Panel />
        <section className="stage">
          <MapView />
          <Timeline />
        </section>
      </div>
      {tx.busy && <div className="busy" role="status">{tx.busy}</div>}
    </div>
  );
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(iv);
  }, []);
  return <span className="clock" aria-live="off">{pad(now.getHours())}:{pad(now.getMinutes())}</span>;
}

function Header() {
  const { st } = useStore();
  const s = st.settings;
  return (
    <header className="top">
      <div className="brand">
        <span className="flag" aria-hidden="true" />
        <div>
          <h1>מנהל מבחני גישוש</h1>
          <p className="sub">לפי תקנון FCI-IGP 2025 ותיקון ועדת כלבי העבודה מ-5.1.2026</p>
        </div>
      </div>
      <div className="top-ctl">
        <label className="fld">
          תאריך המבחן
          <input type="date" value={s.date} onChange={(e) => store.setDate(e.target.value)} />
        </label>
        <label className="fld">
          תחילת הנחת עקבות
          <StartInput value={s.start} />
        </label>
        <button className={'btn live' + (st.live ? ' on' : '')} type="button" onClick={() => store.toggleLive()}>
          {st.live ? 'מצב חי פעיל' : 'הפעל מצב חי'}
        </button>
        <Clock />
      </div>
    </header>
  );
}

/** Start time commits when complete, so typing "0" then "8" doesn't reschedule at 00:00. */
function StartInput({ value }: { value: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { if (v && v !== value) store.setStart(v); };
  return <input type="time" aria-label="תחילת הנחת עקבות" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />;
}

function ShareBanner() {
  const { tx } = useStore();
  const sum = shareSummary(tx.incoming!);
  const nF = sum.fields, nC = sum.competitors;
  const when = new Date(sum.at).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <section className="share-in" data-testid="share-banner">
      <span>התקבל מבחן משותף: {nC} נבחנים, {nF} {nF === 1 ? 'שטח' : 'שטחים'}, תאריך המבחן {sum.date}. נוצר ב-{when}.</span>
      {sum.layoutMayDiffer && <span className="note">הקישור נוצר בגרסה קודמת של המערכת: השטחים, הנבחנים והזמנים זהים, אבל המסלולים יוצבו מחדש ועשויים להיראות אחרת.</span>}
      <span className="row">
        <button className="btn pri" type="button" onClick={() => store.acceptShare()}>פתח את המבחן המשותף</button>
        <button className="btn" type="button" onClick={() => store.rejectShare()}>השאר את שלי</button>
      </span>
    </section>
  );
}

function Kpis() {
  const { st, M } = useStore();
  if (!M.tracks.length)
    return <section className="kpis" aria-label="סיכום"><span className="note">הוסיפו נבחנים כדי לבנות לו״ז.</span></section>;
  const firstDog = Math.min(...M.tracks.map((t) => t.start));
  const avgEx = M.tracks.reduce((a, t) => a + Math.max(0, t.excess), 0) / M.tracks.length;
  const kpi = (v: string | number, l: string) => <div className="kpi"><b>{v}</b><span>{l}</span></div>;
  return (
    <section className="kpis" aria-label="סיכום" data-testid="kpis">
      {kpi(M.tracks.length, 'נבחנים')}
      {kpi(fmt(M.firstLay), 'הנחה ראשונה')}
      {kpi(fmt(firstDog), 'כלב ראשון')}
      {kpi(fmt(M.lastEnd), 'סיום משוער')}
      {kpi(dur(M.lastEnd - M.firstLay), 'משך כולל')}
      {kpi(Math.round(avgEx) + ' דק׳', 'המתנה ממוצעת מעבר להשהייה')}
      <div className="warns">
        {warnings(st, M).map(([c, t], i) => <span key={i} className={'pill ' + c}>{t}</span>)}
      </div>
    </section>
  );
}
