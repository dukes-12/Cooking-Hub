/** Minuscules, sans accents, apostrophes et ponctuation normalisées. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/[’'`]/g, ' ')
    .replace(/[^a-z0-9%.,/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

/** Hash déterministe 0..1 (pour des variations de prix stables). */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}
