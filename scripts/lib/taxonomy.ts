/** Lecture des taxonomies Open Food Facts (format texte : un bloc par entrée, séparé par une ligne vide). */

export interface TaxEntry {
  id: string; // ex. "en:artichoke"
  names: Record<string, string[]>; // langue → noms (le premier est le nom principal)
  parents: string[]; // références brutes, ex. "en:shoot vegetable"
  props: Record<string, Record<string, string>>; // propriété → langue → valeur
}

const NAME_RE = /^([a-z]{2,3}(?:-[A-Za-z0-9]+)?):\s*(.+)$/;
const PROP_RE = /^([a-z_0-9]+):([a-z]{2,3}):\s*(.*)$/;

export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseTaxonomy(text: string): TaxEntry[] {
  const entries: TaxEntry[] = [];
  for (const block of text.split(/\r?\n\s*\r?\n/)) {
    const lines = block.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
    if (!lines.length) continue;
    const names: Record<string, string[]> = {};
    const parents: string[] = [];
    const props: TaxEntry['props'] = {};
    for (const line of lines) {
      if (line.startsWith('<')) {
        parents.push(line.replace(/^<\s*/, '').trim());
        continue;
      }
      if (/^(stopwords|synonyms):/.test(line)) continue;
      const prop = line.match(PROP_RE);
      if (prop && !/^[a-z]{2,3}$/.test(prop[1])) {
        (props[prop[1]] ??= {})[prop[2]] = prop[3].trim();
        continue;
      }
      const m = line.match(NAME_RE);
      if (m) {
        const lang = m[1].toLowerCase();
        const values = m[2].split(',').map((v) => v.trim()).filter(Boolean);
        (names[lang] ??= []).push(...values);
      }
    }
    if (!names.en?.length) continue;
    entries.push({ id: `en:${slug(names.en[0])}`, names, parents, props });
  }
  return entries;
}

/** Résout une référence de parent ("en: shoot vegetable") vers l'id d'une entrée. */
export function buildResolver(entries: TaxEntry[]) {
  const bySyn = new Map<string, string>();
  for (const e of entries) {
    for (const n of e.names.en ?? []) if (!bySyn.has(slug(n))) bySyn.set(slug(n), e.id);
  }
  return (ref: string): string | undefined => {
    const m = ref.match(/^([a-z]{2,3}):\s*(.+)$/);
    if (!m) return undefined;
    return m[1] === 'en' ? bySyn.get(slug(m[2])) : undefined;
  };
}
