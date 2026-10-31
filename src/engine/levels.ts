import type { Level, LevelKey } from './types';

/** FCI-IGP 2025 tracking parameters (minimums), with the 5 January 2026 change: FCI-IFH 1 minimum aging 60 minutes. */
export const LEVELS: Record<LevelKey, Level> = {
  FPR1: { code: 'FPR1', short: 'FPr 1', heb: 'גישוש 1', eq: 'שלב A ב-IGP 1', own: true, paces: 300, legs: 3, acute: 0, semi: false, articles: 3, aging: 20, work: 15, cross: 0, phases: 1, est: 9, leash: 5, color: '#2b6fc4', art: 'fpr12' },
  FPR2: { code: 'FPR2', short: 'FPr 2', heb: 'גישוש 2', eq: 'שלב A ב-IGP 2', own: false, paces: 400, legs: 3, acute: 0, semi: false, articles: 3, aging: 30, work: 15, cross: 0, phases: 1, est: 10, leash: 10, color: '#0f9488', art: 'fpr12' },
  FPR3: { code: 'FPR3', short: 'FPr 3', heb: 'גישוש 3', eq: 'שלב A ב-IGP 3', own: false, paces: 600, legs: 5, acute: 0, semi: false, articles: 3, aging: 60, work: 20, cross: 0, phases: 1, est: 13, leash: 10, color: '#6a4bd0', art: 'fpr3' },
  IFH1: { code: 'IFH1', short: 'FH 1', heb: 'כלב גישוש 1', eq: 'FCI-IFH 1', own: true, paces: 800, legs: 5, acute: 0, semi: false, articles: 3, aging: 60, work: 30, cross: 0, phases: 1, est: 18, leash: 10, color: '#c47f00', art: 'ifh' },
  IFH2: { code: 'IFH2', short: 'FH 2', heb: 'כלב גישוש 2', eq: 'FCI-IFH 2', own: false, paces: 1200, legs: 7, acute: 1, acuteLast: true, semi: false, articles: 4, aging: 120, work: 30, cross: 2, phases: 2, est: 20, leash: 10, color: '#d63a5c', art: 'ifh' },
  IFH3: { code: 'IFH3', short: 'FH 3', heb: 'כלב גישוש 3', eq: 'FCI-IFH 3 / IGP-FH', own: false, paces: 1800, legs: 8, acute: 2, semi: true, articles: 7, aging: 180, work: 45, cross: 2, phases: 3, est: 28, leash: 10, color: '#9a1fa6', art: 'ifh' },
};

export const LKEYS = Object.keys(LEVELS) as LevelKey[];
