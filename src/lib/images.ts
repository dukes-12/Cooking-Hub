/**
 * Photo d'un aliment : image principale de son élément Wikidata (propriété P18), hébergée sur Wikimedia Commons.
 * Images sous licences libres (souvent CC BY-SA) : on affiche toujours le lien vers la page de l'image.
 */
export interface ProductImage {
  url: string;
  credit: string; // page Commons de l'image
}

const KEY = 'cooking-hub:images';
const memory = new Map<string, Promise<ProductImage | null>>();

function readCache(): Record<string, ProductImage | null> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeCache(id: string, img: ProductImage | null) {
  try {
    const all = readCache();
    all[id] = img;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // stockage indisponible : on se passe du cache
  }
}

export function productImage(wikidataId: string | undefined): Promise<ProductImage | null> {
  if (!wikidataId || !/^Q\d+$/.test(wikidataId)) return Promise.resolve(null);
  const cached = readCache();
  if (wikidataId in cached) return Promise.resolve(cached[wikidataId]);
  if (!memory.has(wikidataId)) {
    const url = `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${wikidataId}&property=P18&format=json&origin=*`;
    memory.set(
      wikidataId,
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const file: string | undefined = data?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
          const img = file
            ? {
                url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=640`,
                credit: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`,
              }
            : null;
          writeCache(wikidataId, img);
          return img;
        })
        .catch(() => null), // hors-ligne : pas de photo, sans mettre en cache l'échec
    );
  }
  return memory.get(wikidataId)!;
}
