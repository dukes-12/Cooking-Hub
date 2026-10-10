import { chainsFor, type Chain } from '../data/reference';
import { normalize } from './text';

export interface NearbyStore {
  chain: Chain;
  name: string;
  distanceM: number;
  address?: string;
  lat: number;
  lon: number;
  /** D'où vient le résultat (Google impose d'afficher son attribution). */
  source?: 'osm' | 'google';
}

export function getPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Géolocalisation indisponible sur cet appareil.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => reject(new Error(e.code === 1 ? 'Autorisation de localisation refusée.' : 'Position introuvable.')),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  });
}

/** Position d'une ville / d'un code postal via OpenStreetMap Nominatim (si la géolocalisation est refusée). */
export async function geocodePlace(query: string, country: string): Promise<{ lat: number; lon: number; label: string }> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=${country.toLowerCase()}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'fr' } });
  if (!res.ok) throw new Error(`Recherche de lieu indisponible (${res.status}).`);
  const [hit] = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  if (!hit) throw new Error(`Lieu « ${query} » introuvable.`);
  return { lat: Number(hit.lat), lon: Number(hit.lon), label: hit.display_name };
}

function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function matchChain(name: string, country: string): Chain | undefined {
  const n = normalize(name);
  const candidates = chainsFor(country)
    .flatMap((c) => c.osm.map((o) => ({ c, o: normalize(o) })))
    .sort((x, y) => y.o.length - x.o.length);
  return candidates.find(({ o }) => n === o || n.startsWith(o + ' ') || n.includes(o))?.c;
}

/** Supermarchés autour d'une position via OpenStreetMap (API Overpass, gratuite). */
export async function findNearbyStores(pos: { lat: number; lon: number }, country: string, radiusM = 4000): Promise<NearbyStore[]> {
  const q = `[out:json][timeout:20];(nwr["shop"~"supermarket|convenience|greengrocer"](around:${radiusM},${pos.lat},${pos.lon}););out center tags 120;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(q),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) throw new Error(`OpenStreetMap indisponible (${res.status})`);
  const data = (await res.json()) as { elements: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] };
  const stores: NearbyStore[] = [];
  for (const el of data.elements) {
    const tags = el.tags ?? {};
    const label = tags.brand || tags.name || '';
    const chain = matchChain(label, country);
    const p = el.center ?? (el.lat != null && el.lon != null ? { lat: el.lat, lon: el.lon } : null);
    if (!chain || !p) continue;
    const address = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']].filter(Boolean).join(' ');
    stores.push({ chain, name: tags.name || chain.name, distanceM: haversine(pos, p), address: address || undefined, lat: p.lat, lon: p.lon, source: 'osm' });
  }
  return stores.sort((a, b) => a.distanceM - b.distanceM);
}

/** Supermarchés via Google Places, par notre serveur (la clé n'est jamais dans l'appli). */
export async function findNearbyStoresGoogle(pos: { lat: number; lon: number }, country: string, radiusM = 4000): Promise<NearbyStore[]> {
  const res = await fetch(`/api/stores?lat=${pos.lat}&lon=${pos.lon}&radius=${radiusM}`);
  const data = (await res.json().catch(() => ({}))) as { stores?: { name: string; address: string; lat: number; lon: number }[]; error?: string };
  if (!res.ok) throw new Error(data.error ?? `Google indisponible (${res.status})`);
  const out: NearbyStore[] = [];
  for (const s of data.stores ?? []) {
    const chain = matchChain(s.name, country);
    if (chain) out.push({ chain, name: s.name, distanceM: haversine(pos, s), address: s.address, lat: s.lat, lon: s.lon, source: 'google' });
  }
  return out.sort((a, b) => a.distanceM - b.distanceM);
}

/** OpenStreetMap d'abord (gratuit) ; Google en complément seulement si OSM trouve moins de 3 enseignes connues. */
export async function findStoresWithFallback(pos: { lat: number; lon: number }, country: string, radiusM = 4000, wantAll = false): Promise<NearbyStore[]> {
  let osm: NearbyStore[] = [];
  let osmError: Error | null = null;
  try {
    osm = await findNearbyStores(pos, country, radiusM);
  } catch (e) {
    osmError = e as Error;
  }
  const chains = new Set(osm.map((s) => s.chain.id));
  if (chains.size >= 3 && !wantAll) return osm;
  try {
    const google = await findNearbyStoresGoogle(pos, country, radiusM);
    // Sur la carte on veut tous les magasins ; à l'inscription, une ligne par enseigne suffit.
    const near = (a: NearbyStore, b: NearbyStore) => a.chain.id === b.chain.id && haversine(a, b) < 150;
    const extra = google.filter((g) => !osm.some((o) => near(o, g)));
    return [...osm, ...extra].sort((a, b) => a.distanceM - b.distanceM);
  } catch (e) {
    if (osm.length) return osm; // Google non configuré ou en panne : on garde ce qu'OSM a trouvé
    throw osmError ?? (e as Error);
  }
}

export function fmtDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}
