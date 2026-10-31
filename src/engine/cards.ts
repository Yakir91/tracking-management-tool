import { dirName } from './geometry';
import { legAtPace } from './shapes';
import type { Settings, Track } from './types';
import { fmt, rng } from './util';

export const resName = (t: Track) => (t.pool === 'own' ? 'המוביל מניח בעצמו (רכז מפקח ' + (t.res + 1) + ')' : 'מניח עקבות ' + (t.res + 1));

export function compName(t: Track) {
  if (t.comp) return t.comp.handler + ' עם ' + t.comp.dog;
  return t.group.draw ? '—' : 'מסלול ' + t.no + ' בקבוצה ' + t.group.id + ' (טרם הוגרל)';
}

/** Instruction card for the tracklayer (or the handler laying an own track). */
export function trackCard(t: Track, s: Settings): string {
  const g = t.geo, lv = t.lv;
  const out: string[] = [];
  out.push(`מסלול ${t.no} · ${lv.short} (${lv.heb}) · ${lv.paces} צעדים · ${lv.legs} רגליים`);
  out.push(`נבחן: ${compName(t)}`);
  out.push(`${resName(t)} · הנחה ${rng(t.layStart, t.layEnd)}`);
  out.push(`השהייה מינימלית ${t.aging} דק׳ · יציאת הכלב ${fmt(t.start)} · גיל המסלול ביציאה ${Math.round(t.age)} דק׳ · זמן עבודה מרבי ${lv.work} דק׳`);
  if (!g) {
    out.push('', 'אין עדיין מיקום בשטח. סמנו שטח ולחצו "צור מסלולים".');
    return out.join('\n');
  }
  out.push('');
  if (t.approach) {
    const fr = t.approachFrom ? 'מנקודת היציאה של מסלול ' + t.approachFrom.no : 'מנקודת הכינוס';
    out.push(`הגעה: ${fr}, ${Math.round(t.approach.len)} מ׳ בנתיב ההליכה המסומן${t.approach.blocked ? ' (⚠ לא נמצא נתיב בטוח, לבדוק בשטח)' : ''}.`);
  }
  out.push(`כניסה מהשביל: דגל ההתחלה ${s.setback} מ׳ מהשביל, ננעץ משמאל למשטח הריח. לעמוד רגע על המשטח ואז לצאת בהליכה טבעית לתוך השטח.`);
  g.legs.forEach((leg, i) => {
    if (i > 0) {
      const c = g.corners[i - 1];
      out.push(`  פינה ${i}: ${c.dir > 0 ? 'ימינה' : 'שמאלה'} ${c.acute ? '· זווית חדה ' + c.interior + '°' : '90°'}`);
    }
    const arts = g.articles.filter((a) => legAtPace(g, a.pace) === i && a.pace < g.total).map((a) => `חפץ ${a.n} בצעד ${a.pace - leg.start} של הרגל`);
    if (leg.type === 'semi')
      out.push(`רגל ${i + 1} (חצי עיגול): ${leg.paces} צעדים, רדיוס ${s.semiR} מ׳, מתעקל ${leg.dir! > 0 ? 'ימינה' : 'שמאלה'}, יציאה בכיוון ${Math.round(leg.bearing)}° (${dirName(leg.bearing)})`);
    else out.push(`רגל ${i + 1}: ${leg.paces} צעדים · כיוון ${Math.round(leg.bearing)}° (${dirName(leg.bearing)})${arts.length ? ' · ' + arts.join(', ') : ''}`);
  });
  out.push(`סיום: חפץ ${lv.articles} בסוף המסלול (צעד ${g.total}). להמשיך לפחות 10 צעדים ישר, בכיוון ${Math.round(g.exitBearing)}°, ולצאת אל השביל.`);
  out.push('אין להניח חפצים בטווח 20 צעדים לפני או אחרי פינה. הליכה רגילה, בלי גרירת רגליים.');
  if (g.cross && g.cross.length) out.push('', crossCard(t));
  return out.join('\n');
}

/** Instructions for the cross-track layer. */
export function crossCard(t: Track): string {
  const g = t.geo;
  if (!g || !g.cross || !g.cross.length) return '';
  const c = g.cross[0], tt = (t.crossT || [])[0], r = t.crossRoutes || [];
  const out: string[] = [];
  out.push(`עקבה חוצה למסלול ${t.no} (${t.lv.short}) · מניח עקבות חוצות ${(t.crossRes || 0) + 1}`);
  out.push(`  הנחה ${tt ? rng(tt.s, tt.e) : '—'}, כ-30 דק׳ לפני יציאת הכלב (${fmt(t.start)}).`);
  if (r[0]) out.push(`  הגעה: ${t.crossFrom || 'מנקודת הכינוס'} לנקודה A, ${Math.round(r[0].len)} מ׳ בנתיב המסומן, בלי לדרוך על מסלולים${r[0].blocked ? ' (⚠ לבדוק בשטח)' : ''}.`);
  out.push(`  מנקודה A: ${c.paces} צעדים בקו ישר בכיוון ${Math.round(c.bearing)}° (${dirName(c.bearing)}).`);
  out.push(`    בצעד ${c.cx[0].atPace} חוצים את רגל ${c.cx[0].leg + 1} (צעד ${c.cx[0].pace} במסלול).`);
  out.push(`    בצעד ${c.cx[1].atPace} חוצים את רגל ${c.cx[1].leg + 1} (צעד ${c.cx[1].pace} במסלול).`);
  out.push(`  מסיימים בנקודה B${r[1] ? ` ויוצאים לשביל, ${Math.round(r[1].len)} מ׳ בנתיב המסומן` : ''}. כל רגל נחצית פעם אחת בלבד.`);
  return out.join('\n');
}
