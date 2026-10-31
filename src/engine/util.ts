/** Random source. Swappable so tests can run deterministically. */
let random: () => number = Math.random;
export const setRandom = (fn: () => number) => {
  random = fn;
};
export const rand = () => random();
/** Run body with a different random source, then put the previous one back. */
export function withRandom<T>(fn: () => number, body: () => T): T {
  const prev = random;
  random = fn;
  try {
    return body();
  } finally {
    random = prev;
  }
}
/** Small stable string hash (FNV-1a), for seeding. */
export function hashStr(str: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
export const rnd = (a: number, b: number) => a + random() * (b - a);

/** Small seeded generator (mulberry32) for tests. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Unbiased shuffle; uses crypto when available (draws must be fair). */
export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  const r = new Uint32Array(a.length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(r);
  else for (let i = 0; i < r.length; i++) r[i] = Math.floor(random() * 2 ** 32);
  for (let i = a.length - 1; i > 0; i--) {
    const j = r[i] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const uid = () => Math.random().toString(36).slice(2, 9);
export const pad = (n: number) => String(n).padStart(2, '0');

/** "HH:MM" to minutes. */
export const hm = (str: string | null | undefined) => {
  const [h, m] = (str || '0:0').split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Minutes to "HH:MM" (with "(+1)" past midnight). */
export const fmt = (m: number | null | undefined) => {
  if (m == null || !isFinite(m)) return '—';
  const r = Math.round(m);
  const d = Math.floor(r / 1440);
  const x = ((r % 1440) + 1440) % 1440;
  return pad(Math.floor(x / 60)) + ':' + pad(x % 60) + (d > 0 ? ' (+' + d + ')' : '');
};

/** Minutes to "HH:MM" for <input type=time>. */
export const hmStr = (m: number) => {
  const r = Math.round(m);
  const x = ((r % 1440) + 1440) % 1440;
  return pad(Math.floor(x / 60)) + ':' + pad(x % 60);
};

export const rng = (a: number, b: number) => fmt(a) + ' עד ' + fmt(b);

export const dur = (m: number) => {
  m = Math.round(m);
  return m < 60 ? m + ' דק׳' : Math.floor(m / 60) + ':' + pad(m % 60) + ' ש׳';
};

export const todayISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
};

export const trialMidnight = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};

/** Minutes since the trial date's midnight. */
export const nowMin = (date: string, now = Date.now()) => (now - trialMidnight(date)) / 60000;
