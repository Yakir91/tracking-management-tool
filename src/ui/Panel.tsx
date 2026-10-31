import { useEffect, useRef, useState } from 'react';
import {
  events, fieldsOf, fmt, getPaths, groupSizeFor, hasField, LEVELS, liveEvents, LKEYS, needOf, pathField, rng, totalArea, trackCard,
} from '../engine';
import { pathLen, polyArea } from '../engine/geometry';
import type { LevelKey, MapMode, Settings } from '../engine/types';
import { hm } from '../engine/util';
import { store } from '../state/store';
import { ArmButton, LevelSelect, LvTag, Note, NumInput, useStore } from './common';

export const TABS: [string, string][] = [
  ['comp', 'נבחנים'], ['field', 'שטח ומפה'], ['draw', 'קבוצות והגרלות'], ['sched', 'לו״ז'], ['cards', 'כרטיסי מניחים'], ['live', 'בקרה חיה'], ['share', 'שיתוף'], ['set', 'הגדרות'],
];

export function Panel() {
  const { st } = useStore();
  const tab = st.ui.tab;
  return (
    <aside className="panel">
      <nav className="tabs" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => store.setTab(k)}>
            {l}
          </button>
        ))}
      </nav>
      <div className="tabbody" role="tabpanel">
        {tab === 'comp' && <Competitors />}
        {tab === 'field' && <FieldTab />}
        {tab === 'draw' && <Draws />}
        {tab === 'sched' && <Schedule />}
        {tab === 'cards' && <Cards />}
        {tab === 'live' && <Live />}
        {tab === 'share' && <Share />}
        {tab === 'set' && <SettingsTab />}
      </div>
    </aside>
  );
}

function Competitors() {
  const { st } = useStore();
  const [h, setH] = useState('');
  const [d, setD] = useState('');
  const [lv, setLv] = useState<LevelKey>('FPR1');
  const [bulk, setBulk] = useState('');
  const hRef = useRef<HTMLInputElement>(null);
  const ex = st.competitors.some((c) => c.example);
  const counts = LKEYS.map((k) => [k, st.competitors.filter((c) => c.level === k).length] as const).filter((x) => x[1]);
  const add = () => {
    if (store.addCompetitor(h, d, lv)) {
      setH('');
      setD('');
      hRef.current?.focus();
    }
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  };
  return (
    <>
      {ex && (
        <div className="box ex">
          <Note><b>רשימת דוגמה.</b> הנבחנים כאן הם לדוגמה בלבד, כדי שתראו איך המערכת עובדת.</Note>
          <div className="row"><button className="btn sm" type="button" onClick={() => store.clearExample()}>מחק את הדוגמה</button></div>
        </div>
      )}
      <div className="row">
        {counts.length ? counts.map(([k, n]) => <span key={k} className="pill"><LvTag k={k} /> {n}</span>) : <span className="note">אין נבחנים עדיין.</span>}
      </div>
      <div className="box">
        <h4>הוספת נבחן</h4>
        <div className="row">
          <input ref={hRef} placeholder="שם המוביל" aria-label="שם המוביל" style={{ flex: '1 1 120px' }} value={h} onChange={(e) => setH(e.target.value)} onKeyDown={onKey} />
          <input placeholder="שם הכלב" aria-label="שם הכלב" style={{ flex: '1 1 90px' }} value={d} onChange={(e) => setD(e.target.value)} onKeyDown={onKey} />
          <LevelSelect value={lv} onChange={setLv} label="רמה" />
          <button className="btn pri" type="button" onClick={add}>הוסף</button>
        </div>
      </div>
      <details className="box">
        <summary>הדבקת רשימה</summary>
        <Note>שורה לכל נבחן: מוביל, כלב, רמה. רמות: FPR1 FPR2 FPR3 FH1 FH2 FH3.</Note>
        <textarea placeholder="דנה כהן, לונה, FPR3" aria-label="רשימת נבחנים" value={bulk} onChange={(e) => setBulk(e.target.value)} />
        <div className="row">
          <button className="btn" type="button" onClick={() => { if (store.bulkAdd(bulk)) setBulk(''); }}>הוסף את כולם</button>
        </div>
      </details>
      <div className="tw">
        <table data-testid="competitors">
          <thead><tr><th>מוביל</th><th>כלב</th><th>רמה</th><th /></tr></thead>
          <tbody>
            {st.competitors.map((c) => (
              <tr key={c.id}>
                <td>{c.handler}</td>
                <td>{c.dog}</td>
                <td><LevelSelect value={c.level} label="רמה" onChange={(k) => store.setCompetitorLevel(c.id, k)} /></td>
                <td><button className="btn sm ghost" type="button" aria-label="מחק" onClick={() => store.deleteCompetitor(c.id)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FieldTab() {
  const S = useStore();
  const { st, M, tx } = S;
  const m = st.map, s = st.settings;
  const [q, setQ] = useState('');
  const [calibD, setCalibD] = useState(100);
  const FL = m.fields.map((f, i) => ({ f, i })).filter((x) => x.f && x.f.length > 2);
  const DP = m.paths.map((p, i) => ({ p, i })).filter((x) => x.p && x.p.length >= 2);
  const PS = getPaths(st);
  const plen = PS.reduce((a, x) => a + pathLen(x.pts), 0);
  const byField = (k: number) => M.tracks.filter((t) => t.geo && t.geo.fi === k).length;
  const modes: [MapMode, string][] = [['satellite', 'מפה אמיתית'], ['image', 'תמונת אוויר'], ['schematic', 'רשת סכמטית']];
  return (
    <>
      <div className="box">
        <h4>סוג מפה</h4>
        <div className="seg" role="group">
          {modes.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={m.mode === k} onClick={() => store.setMode(k)}>{l}</button>
          ))}
        </div>
        {tx.tilesOK === false && <Note style={{ color: 'var(--warn)' }}>שרתי המפה האמיתית לא נגישים מהדפדפן הזה כרגע. אפשר לעבוד עם תמונת אוויר שתעלו, או עם הרשת הסכמטית.</Note>}
        {m.mode === 'schematic' && <Note>רשת של 50 מ׳ ללא רקע, לתכנון לפני שבחרתם שטח.</Note>}
        {m.mode === 'image' && (
          <>
            <Note>העלו צילום מסך של השטח מ-govmap או Google Earth, ואז כיילו קנה מידה לפי שתי נקודות שהמרחק ביניהן ידוע.</Note>
            <input type="file" accept="image/*" aria-label="תמונת אוויר" onChange={(e) => { const f = e.target.files?.[0]; if (f) store.uploadImage(f); }} />
            <div className="row">
              <button className="btn sm" type="button" disabled={!m.image} onClick={() => store.startDraw('calib')}>כיול קנה מידה</button>
              {m.image && <span className="note mono">{m.image.scale.toFixed(3)} מ׳ לפיקסל</span>}
            </div>
            {tx.calibPts.length === 2 && (
              <div className="row">
                <label className="fld">
                  המרחק האמיתי בין שתי הנקודות (מ׳)
                  <input type="number" min={1} step={1} value={calibD} onChange={(e) => setCalibD(+e.target.value)} />
                </label>
                <button className="btn pri sm" type="button" onClick={() => store.calibrate(calibD)}>החל</button>
                <button className="btn sm" type="button" onClick={() => store.cancelDraw()}>בטל</button>
              </div>
            )}
            {tx.drawMode === 'calib' && <Note>לחצו על שתי נקודות במפה.</Note>}
          </>
        )}
        {m.mode === 'satellite' && (
          <>
            <h4>חיפוש מקום</h4>
            <div className="row">
              <input placeholder="למשל: מושב בית חלקיה, או 31.84, 34.80" aria-label="חיפוש מקום" style={{ flex: '1 1 180px' }} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') store.search(q); }} />
              <button className="btn sm" type="button" onClick={() => store.search(q)}>חפש</button>
              <button className="btn sm" type="button" onClick={() => store.myLocation()}>המיקום שלי</button>
            </div>
            <div className="row">
              {typeof tx.searchRes === 'string' ? <span className="note">{tx.searchRes}</span> : (tx.searchRes || []).map((r, i) => (
                <button key={i} className="btn sm" type="button" onClick={() => store.goTo(r.ll)}>{r.label}</button>
              ))}
            </div>
            <Note>מצאו את המקום, סמנו את גבולות השטח שבחרתם ואת שביל הגישה, והמסלולים יוצבו בתוכו לפי קנה המידה האמיתי.</Note>
          </>
        )}
      </div>
      <div className="box">
        <h4>1. שטחי המסלולים</h4>
        <div className="row">
          <button className="btn" type="button" onClick={() => store.startDraw('field')}>{FL.length ? 'סמן שטח נוסף' : 'סמן שטח'}</button>
          <button className="btn" type="button" onClick={() => store.startDraw('base')}>קבע נקודת כינוס</button>
        </div>
        <Note>לחצו על פינות השטח לפי הסדר; אורך כל צלע מוצג על המפה. לחיצה כפולה או "סיים" מסיימת. אפשר לסמן כמה שטחים: המסלולים ממלאים אותם לפי סדר הסימון. אחר כך אפשר לגרור כל פינה, והמסלולים מוצבים מחדש.</Note>
        {FL.length > 0 && (
          <>
            <div className="tw">
              <table data-testid="fields">
                <thead><tr><th>שטח</th><th>דונם</th><th>מסלולים</th><th /></tr></thead>
                <tbody>
                  {FL.map((x, k) => (
                    <tr key={x.i}>
                      <td>שטח {k + 1}</td>
                      <td className="num">{Math.round(polyArea(x.f) / 1000)}</td>
                      <td className="num">{byField(x.i)}</td>
                      <td><ArmButton label="מחק" onConfirm={() => store.deleteField(x.i)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {FL.length > 1 && <div className="row"><ArmButton className="btn sm" label="מחק את כל השטחים" armedLabel="לחצו שוב כדי למחוק" onConfirm={() => store.clearFields()} /></div>}
            {FL.length === 1 && <div className="row"><ArmButton className="btn sm" label="מחק את השטח והשבילים" armedLabel="לחצו שוב כדי למחוק" onConfirm={() => store.clearFields()} /></div>}
          </>
        )}
        <FitBox />
      </div>
      <div className="box">
        <h4>2. שבילי גישה</h4>
        <div className="row"><button className="btn" type="button" onClick={() => store.startDraw('path')}>{DP.length ? 'סמן שביל נוסף' : 'סמן שביל גישה'}</button></div>
        {DP.length > 0 && (
          <div className="tw">
            <table data-testid="paths">
              <thead><tr><th>שביל</th><th>שטח</th><th>אורך</th><th /></tr></thead>
              <tbody>
                {DP.map((x, k) => {
                  const fi = pathField(st, x.p);
                  const fk = FL.findIndex((y) => y.i === fi);
                  return (
                    <tr key={x.i}>
                      <td>שביל {k + 1}</td>
                      <td>{fk >= 0 ? 'שטח ' + (fk + 1) : <span className="note">מחוץ לשטח</span>}</td>
                      <td className="num">{Math.round(pathLen(x.p))} מ׳</td>
                      <td><ArmButton label="מחק" onConfirm={() => store.deletePath(x.i)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Note>
          כל שביל משויך לשטח שהוא עובר בו. בשטח שאין בו שביל מסומן נוצר שביל אוטומטי במקביל לצלע הארוכה; בשטח עמוק השביל עובר באמצע או שיש כמה שבילים, עם מסלולים משני הצדדים.
          {PS.length > 0 && <> סה״כ {PS.length} שבילים, <b className="mono">{Math.round(plen)}</b> מ׳.</>} המסלולים מסודרים לאורך השבילים זה לצד זה: כל מסלול נכנס מהשביל ויוצא בחזרה לכיוונו, והבא מתחיל {s.sep} מ׳ אחרי היציאה.
        </Note>
      </div>
      <div className="box">
        <h4>3. הצבה</h4>
        <div className="row">
          <button className="btn pri" type="button" onClick={() => store.regen(true)}>צור מסלולים מחדש</button>
          <label className="row note"><input type="checkbox" checked={st.ui.showRoutes} onChange={(e) => store.toggleRoutes(e.target.checked)} /> הצג את כל נתיבי ההליכה</label>
        </div>
        {M.tracks.length > 0 && <Note>{M.tracks.filter((t) => t.geo).length} מתוך {M.tracks.length} מסלולים ממוקמים.</Note>}
        <Note>מרווח של {s.sep} מ׳ לפחות בין כל חלקי המסלולים, {s.setback} מ׳ בין השביל לדגל ההתחלה, {s.edge} מ׳ מגבול השטח ו-{s.intraSep} מ׳ בין רגליים לא סמוכות של אותו מסלול.</Note>
      </div>
    </>
  );
}

function FitBox() {
  const { st, M } = useStore();
  if (!M.tracks.length) return null;
  const N = needOf(st, M.tracks);
  const G = st.lastGen;
  const FF = fieldsOf(st);
  const DPi = st.map.paths.map((_p, i) => i).filter((i) => (st.map.paths[i] || []).length >= 2);
  const pn = (i: number) => 'שביל ' + (DPi.indexOf(i) + 1);
  const shallow = G && !(G.closePaths || []).length ? (Object.entries(G.depthNeed || {}) as [LevelKey, number][]).filter(([, d]) => !G.depth || d > G.depth * 0.9) : [];
  return (
    <div className="box" style={{ background: 'var(--surface)' }} data-testid="fit">
      <h4>התאמת השטח לנבחנים</h4>
      <Note>
        ל-{M.tracks.length} הנבחנים צריך בערך <b className="mono">{N.dunam}</b> דונם: חזית של כ-<b className="mono">{N.front}</b> מ׳ לאורך שביל הגישה (או חצי מזה אם יש שטח משני צדי השביל), ועומק של כ-<b className="mono">{N.depth}</b> מ׳ מהשביל.
      </Note>
      {!hasField(st) ? (
        <Note>עוד לא סומן שטח.</Note>
      ) : (
        <>
          <Note>
            {FF.length > 1 ? `${FF.length} שטחים, יחד` : 'השטח שסומן:'} <b className="mono">{Math.round(totalArea(st) / 1000)}</b> דונם
            {G && G.frontage ? <> · חזית <b className="mono">{G.frontage}</b> מ׳ · עומק ממוצע <b className="mono">{G.depth}</b> מ׳</> : null}.
          </Note>
          {G && G.byLevel && (
            <>
              <div className="tw">
                <table>
                  <thead><tr><th>רמה</th><th>נכנסו</th><th /></tr></thead>
                  <tbody>
                    {(Object.entries(G.byLevel) as [LevelKey, { need: number; placed: number }][]).map(([k, b]) => (
                      <tr key={k}>
                        <td><LvTag k={k} /></td>
                        <td className="num">{b.placed} / {b.need}</td>
                        <td>{b.placed === b.need ? <span className="pill ok">נכנס</span> : <span className="pill bad">חסרים {b.need - b.placed}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {G.fails ? (
                <>
                  <Note style={{ color: 'var(--bad)' }}>{G.fails} מסלולים לא נכנסו. כדי להכניס אותם צריך עוד כ-<b className="mono">{G.extra}</b> מ׳ של חזית לאורך השביל, או שטח גם בצד השני של השביל.</Note>
                  {(G.closePaths || []).map((c, i) => (
                    <Note key={i} style={{ color: 'var(--bad)' }}>{pn(c.a)} ו{pn(c.b)} קרובים מדי זה לזה ({c.d} מ׳). המסלולים של כל שביל יכולים להגיע רק עד חצי הדרך לשביל השני, ולכן צריך לפחות כ-{c.need} מ׳ ביניהם. מחקו אחד מהם או הרחיקו אותו.</Note>
                  ))}
                  {shallow.length > 0 && (
                    <Note style={{ color: 'var(--bad)' }}>השטח רדוד מדי ל-{shallow.map(([k, d]) => `${LEVELS[k].short} (צריך כ-${d} מ׳)`).join(', ')}. העומק הממוצע מהשביל כאן {G.depth} מ׳; בחרו שטח עמוק יותר או סמנו את השביל בצד אחר של השטח.</Note>
                  )}
                </>
              ) : (
                <Note style={{ color: 'var(--ok)' }}>כל המסלולים נכנסו בשטח שסומן.</Note>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Draws() {
  const { st, M } = useStore();
  const s = st.settings;
  const sizes: [number, string][] = [[0, 'אוטומטי'], [3, '3'], [6, '6']];
  const name = (id: string) => st.competitors.find((x) => x.id === id)?.handler || '';
  return (
    <>
      <Note>במסלולים עצמיים (FPr 1, FH 1) אין הגרלה. במסלולי מניח זר, מסלולי הקבוצה מונחים בזה אחר זה, כל מסלול סמוך ככל האפשר לזמן היציאה של הכלב שלו, וההגרלה נערכת מיד אחרי שהמסלול האחרון בקבוצה הונח. בגלל שההגרלה באה אחרי כל ההנחות, המסלול הראשון בקבוצה ממתין יותר מהמינימום, ולכן קבוצה קטנה יותר מקצרת את ההמתנה.</Note>
      <div className="row">
        <span className="note">גודל קבוצה</span>
        <div className="seg">
          {sizes.map(([n, l]) => <button key={n} type="button" aria-pressed={s.groupSize === n} onClick={() => store.setGroupSize(n)}>{l}</button>)}
        </div>
      </div>
      {!s.groupSize && (
        <Note>אוטומטי: 6 רק ברמה שבה ההשהייה ארוכה מספיק כדי לשפוט 5 כלבים בזמן הנחת הקבוצה, אחרת 3. כרגע: {LKEYS.filter((k) => !LEVELS[k].own && st.competitors.some((c) => c.level === k)).map((k) => LEVELS[k].short + ' ' + groupSizeFor(st, k)).join(' · ')}</Note>
      )}
      {M.groups.filter((g) => g.noDraw).map((g) => (
        <div key={g.id} className="box">
          <b><LvTag k={g.level} /> {g.single ? 'נבחן יחיד, ללא הגרלה' : 'מסלול עצמי, ללא הגרלה'}</b>
          <Note>{g.single ? 'בקבוצה יש נבחן אחד, ולכן אין צורך בהגרלה.' : 'כל מוביל מניח את המסלול שלו בזמן שנקבע לו, ויוצא לפי סדר ההנחה.'}</Note>
          <div className="tw">
            <table>
              <thead><tr><th>מסלול</th><th>הנחה</th><th>יציאה</th><th>מוביל</th></tr></thead>
              <tbody>
                {g.seq.map((t) => (
                  <tr key={t.id}>
                    <td className="num">{t.no}</td>
                    <td className="num">{fmt(t.layStart)}</td>
                    <td className="num">{fmt(t.start)}</td>
                    <td>{t.comp ? `${t.comp.handler} · ${t.comp.dog}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {M.groups.filter((g) => !g.noDraw).map((g) => (
        <div key={g.id} className="box" data-testid={'group-' + g.id}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b><LvTag k={g.level} /> קבוצה {g.index + 1}/{g.count}</b>
            {s.judges > 1 && (
              <select aria-label="שופט" value={g.judge} onChange={(e) => store.setGroupJudge(g.id, +e.target.value)}>
                {Array.from({ length: s.judges }, (_, j) => <option key={j} value={j}>שופט {j + 1}</option>)}
              </select>
            )}
          </div>
          <Note style={{ fontVariantNumeric: 'tabular-nums' }}>הנחה {rng(g.layMin, g.layMax)} · הגרלה {fmt(g.layMax)} · כלב ראשון {fmt(g.firstStart)}</Note>
          <Note>מניח זר: ההגרלה קובעת איזה נבחן עובד באיזה מסלול. המסלולים נעבדים לפי סדר ההנחה.</Note>
          <div className="tw">
            <table>
              <thead><tr><th>יציאה</th><th>שעה</th><th>מסלול</th><th>נבחן</th></tr></thead>
              <tbody>
                {g.seq.map((t, i) => (
                  <tr key={t.id}>
                    <td className="num">{i + 1}</td>
                    <td className="num">{fmt(t.start)}</td>
                    <td className="num">{t.no}</td>
                    <td>{t.comp ? `${t.comp.handler} · ${t.comp.dog}` : <span className="note">טרם הוגרל</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            {g.draw ? (
              <>
                <span className="note">הוגרל ב-{new Date(g.draw.at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
                <button className="btn sm" type="button" onClick={() => store.undraw(g.id)}>בטל הגרלה</button>
              </>
            ) : (
              <button className="btn pri sm" type="button" onClick={() => store.draw(g.id)}>ערוך הגרלה</button>
            )}
          </div>
          {!g.draw && <Note>משתתפים: {g.members.map(name).join(', ')}</Note>}
        </div>
      ))}
    </>
  );
}

const KIND_LABEL = { lay: '', cross: '', judge: 'יציאת כלב', draw: 'הגרלה' } as const;

function Schedule() {
  const { M } = useStore();
  const ev = events(M);
  return (
    <>
      <div className="row">
        <button className="btn" type="button" onClick={() => store.copy(store.scheduleText(false))}>העתק לו״ז למשתתפים</button>
        <button className="btn" type="button" onClick={() => store.copy(store.scheduleText(true))}>העתק לו״ז מלא</button>
      </div>
      <div className="tw">
        <table data-testid="schedule">
          <thead><tr><th>שעה</th><th>אירוע</th><th>אחראי</th></tr></thead>
          <tbody>
            {ev.map((e, i) => (
              <tr key={i}>
                <td className="num">{fmt(e.t)}</td>
                <td>
                  <LvTag k={e.level} /> {KIND_LABEL[e.kind] ? <b>{e.text}</b> : e.text}
                </td>
                <td>{e.who}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Cards() {
  const { st, M, tx } = useStore();
  useEffect(() => {
    if (!tx.scrollCard || !st.ui.sel) return;
    const t = M.tracks.find((x) => x.id === st.ui.sel);
    if (t) document.getElementById('card-' + t.no)?.scrollIntoView({ block: 'nearest' });
    tx.scrollCard = false;
  });
  return (
    <>
      <div className="row"><button className="btn" type="button" onClick={() => store.copy(store.cardsText())}>העתק את כל הכרטיסים</button></div>
      <Note>כל כרטיס מיועד למניח העקבות או למוביל שמניח בעצמו. הכיוונים בפורמט מצפן: 0° צפון, 90° מזרח{st.map.mode !== 'satellite' ? ' (בתמונה ובסכמה: צפון כלפי מעלה)' : ''}.</Note>
      {M.tracks.slice().sort((a, b) => a.no - b.no).map((t) => (
        <div key={t.id} className={'card' + (st.ui.sel === t.id ? ' sel' : '')} id={'card-' + t.no}>
          <div className="hd">
            <LvTag k={t.level} />
            <b>מסלול {t.no}</b>
            <span className="note mono">{fmt(t.layStart)}</span>
            <button className="btn sm" type="button" onClick={() => store.copy(trackCard(t, st.settings))}>העתק</button>
            <button className="btn sm ghost" type="button" onClick={() => store.select(t.id)}>הצג במפה</button>
          </div>
          <pre>{trackCard(t, st.settings)}</pre>
        </div>
      ))}
    </>
  );
}

function Live() {
  const { st, M } = useStore();
  const [manual, setManual] = useState<Record<string, string>>({});
  if (!st.live)
    return (
      <div className="box">
        <Note>במצב חי כל לחיצה רושמת את השעה בפועל, והלו״ז של שאר המסלולים מתעדכן לפי השעה הנוכחית ולפי עיכובים.</Note>
        <div className="row"><button className="btn pri" type="button" onClick={() => store.toggleLive()}>הפעל מצב חי</button></div>
      </div>
    );
  const ev = liveEvents(M).slice(0, 40);
  return (
    <>
      <Note>אירועים פתוחים לפי סדר הזמנים. אפשר להזין שעה ידנית לפני הלחיצה.</Note>
      {ev.length ? ev.map((e) => {
        const key = e.track.id + e.k;
        return (
          <div key={key} className={'ev' + (e.t < M.NOW - 1 ? ' late' : '')} data-testid="live-ev">
            <span className="t">{fmt(e.t)}</span>
            <span><LvTag k={e.track.level} /> {e.text}</span>
            <div className="acts">
              <input type="time" aria-label="שעה ידנית" value={manual[key] || ''} onChange={(x) => setManual({ ...manual, [key]: x.target.value })} />
              <button className="btn sm pri" type="button" onClick={() => {
                const v = manual[key] ? store.timeFor(e.track.id, e.k, manual[key]) ?? hm(manual[key]) : undefined;
                store.mark(e.track.id, e.k, v);
              }}>{e.label}</button>
              {e.undo && <button className="btn sm" type="button" onClick={() => store.unmark(e.track.id, e.undo!)}>בטל</button>}
            </div>
          </div>
        );
      }) : <Note>אין אירועים פתוחים.</Note>}
      <div className="row"><ArmButton className="btn sm" label="מחק את כל הרישומים בפועל" armedLabel="לחצו שוב לאישור" onConfirm={() => store.resetActuals()} /></div>
    </>
  );
}

function Share() {
  const { tx } = useStore();
  const ta = useRef<HTMLTextAreaElement>(null);
  const hosted = /^https?:$/.test(location.protocol) && !/^(localhost|127\.)/.test(location.hostname);
  const url = tx.shareUrl;
  return (
    <div className="box">
      <h4>קישור שיתוף</h4>
      <Note>הקישור מכיל את כל המבחן: נבחנים, שטחים ושבילים, מסלולים, הגרלות, לו״ז וזמנים שנרשמו. מי שפותח אותו מקבל את אותה פריסה על המפה במכשיר שלו, בלי התקנה ובלי הרשמה.</Note>
      <Note>זו תמונת מצב של הרגע שבו יצרתם את הקישור. שינויים שתעשו אחר כך לא יגיעו למי שכבר פתח אותו, וצריך לשלוח קישור חדש.</Note>
      {!hosted && <Note style={{ color: 'var(--warn)' }}>המערכת פתוחה כאן מהמחשב המקומי, ולכן קישור ממנה לא ייפתח אצל אחרים. צרו את הקישור מהאתר ב-GitHub Pages.</Note>}
      <div className="row">
        <button className="btn pri" type="button" onClick={() => store.makeShare()}>צור קישור</button>
        {url && (
          <>
            <button className="btn" type="button" onClick={async () => { if (!(await store.copy(url))) { ta.current?.focus(); ta.current?.select(); } }}>העתק</button>
            {'share' in navigator && <button className="btn" type="button" onClick={() => navigator.share({ title: 'מבחן גישוש', url }).catch(() => {})}>שלח…</button>}
          </>
        )}
      </div>
      {url && (
        <>
          <textarea ref={ta} readOnly aria-label="קישור השיתוף" value={url} />
          <Note>אורך הקישור: {url.length.toLocaleString('he-IL')} תווים.</Note>
          {url.includes('#s=') && (
            <Note style={{ color: 'var(--warn)' }}>
              הקישור ארוך כי הוא כולל את צורת כל המסלולים: הם הוצבו בגרסה קודמת של המערכת או שונו אחרי ההצבה. כדי לקבל קישור קצר, לחצו "צור מסלולים מחדש" בלשונית "שטח ומפה" (המסלולים יוצבו מחדש) וצרו קישור שוב.
            </Note>
          )}
        </>
      )}
    </div>
  );
}

function SettingsTab() {
  const { st, tx } = useStore();
  const s = st.settings;
  const [io, setIo] = useState('');
  const num = (k: keyof Settings, l: string, step = 1, min = 0) => (
    <>
      <label htmlFor={'s-' + k}>{l}</label>
      <NumInput id={'s-' + k} value={s[k] as number} step={step} min={min} onCommit={(v) => store.setSetting(k, v)} />
    </>
  );
  return (
    <>
      <div className="box">
        <h4>צוות</h4>
        <div className="grid2">
          {num('judges', 'שופטים', 1, 1)}
          {num('layers', 'מניחי עקבות (מסלולי מניח זר)', 1, 1)}
          {num('crossLayers', 'מניחי עקבות חוצות', 1, 1)}
          {num('ownParallel', 'מסלולים עצמיים שמונחים במקביל (רמות שונות)', 1, 1)}
        </div>
      </div>
      <div className="box">
        <h4>קצב ומרחקים</h4>
        <div className="grid2">
          {num('pace', 'אורך צעד (מ׳)', 0.05, 0.5)}
          {num('layRate', 'קצב הנחה (צעדים לדקה)', 5, 30)}
          {num('walkKmh', 'מהירות הליכה בשטח (קמ״ש)', 0.5, 1)}
          {num('detour', 'מקדם עיקוף להליכה', 0.1, 1)}
          {num('changeover', 'החלפה בין כלבים לשופט (דק׳)', 1, 0)}
          {num('drawBuf', 'זמן להגרלה אחרי הנחה (דק׳)', 1, 0)}
          {num('sep', 'מרחק מינימלי בין מסלולים (מ׳)', 1, 5)}
          {num('intraSep', 'מרחק בין רגליים לא סמוכות (מ׳)', 1, 10)}
          {num('edge', 'מרחק מגבול השטח (מ׳)', 1, 0)}
          {num('walkBuf', 'מרחק בטיחות להולכים ממסלול (מ׳)', 1, 3)}
          {num('crossExt', 'המשך העקבה החוצה מעבר לרגל (מ׳)', 1, 16)}
          {num('crossClear', 'מרחק עקבה חוצה ממסלולים אחרים (מ׳)', 1, 5)}
          {num('semiR', 'רדיוס חצי העיגול ב-FH 3 (מ׳)', 1, 20)}
          {num('setback', 'מרחק דגל ההתחלה מהשביל (מ׳)', 1, 5)}
        </div>
      </div>
      <div className="box">
        <h4>רמות</h4>
        <Note>השהייה מינימלית לפי התקנון; אפשר רק להאריך. זמן עבודה משוער משמש לתכנון, ובמצב חי מוחלף בזמן בפועל.</Note>
        <div className="tw">
          <table>
            <thead><tr><th>רמה</th><th>צעדים</th><th>השהייה</th><th>מרבי</th><th>משוער</th></tr></thead>
            <tbody>
              {LKEYS.map((k) => {
                const lv = LEVELS[k];
                return (
                  <tr key={k}>
                    <td><LvTag k={k} /></td>
                    <td className="num">{lv.paces}</td>
                    <td><NumInput value={s.aging[k]} min={lv.aging} step={5} label={'השהייה ' + lv.short} onCommit={(v) => store.setAging(k, v)} /></td>
                    <td className="num">{lv.work}</td>
                    <td><NumInput value={s.est[k]} min={3} max={lv.work} step={1} label={'זמן משוער ' + lv.short} onCommit={(v) => store.setEst(k, v)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <h4>סדר השיפוט</h4>
        <ol className="order">
          {s.levelOrder.map((k, i) => (
            <li key={k}>
              <LvTag k={k} />
              <button className="btn sm ghost" type="button" aria-label="למעלה" disabled={i === 0} onClick={() => store.moveLevel(i, -1)}>▲</button>
              <button className="btn sm ghost" type="button" aria-label="למטה" disabled={i === s.levelOrder.length - 1} onClick={() => store.moveLevel(i, 1)}>▼</button>
            </li>
          ))}
        </ol>
        <label className="row note">
          <input type="checkbox" checked={s.autoOrder} onChange={(e) => store.setAutoOrder(e.target.checked)} /> סדר שיפוט אוטומטי: המערכת בוחרת את הסדר שמקצר את המבחן ואת ההמתנה מעבר להשהייה
        </label>
      </div>
      <div className="box">
        <h4>גיבוי</h4>
        <Note>הנתונים נשמרים בדפדפן הזה בלבד. להעברה למכשיר אחר השתמשו בלשונית "שיתוף", או העתיקו גיבוי והדביקו אותו שם.</Note>
        <div className="row">
          <button className="btn sm" type="button" onClick={() => store.copy(store.exportText())}>העתק גיבוי</button>
          <button className="btn sm" type="button" onClick={() => { if (store.importText(io)) setIo(''); }}>טען גיבוי מהתיבה</button>
          <ArmButton className="btn sm" label="התחל מאפס" armedLabel="לחצו שוב לאישור" onConfirm={() => store.reset()} />
        </div>
        <textarea placeholder="הדביקו כאן גיבוי" aria-label="גיבוי" value={io} onChange={(e) => setIo(e.target.value)} />
        {tx.saveNote && <Note style={{ color: 'var(--warn)' }}>{tx.saveNote}</Note>}
      </div>
      <p className="src">
        מקורות: <a href="https://www.fci.be/medias/UTI-REG-IGP-en-2025-22401.pdf" target="_blank" rel="noopener">FCI-IGP Regulations 2025</a> ·{' '}
        <a href="https://adrk.de/attachments/article/2625/Modifizierung%20PO%202025.pdf" target="_blank" rel="noopener">תיקון 5.1.2026 (השהייה ב-IFH 1 ל-60 דק׳)</a>
      </p>
    </>
  );
}
