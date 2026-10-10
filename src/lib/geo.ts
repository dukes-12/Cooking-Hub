import { chainsFor, type Chain } from '../data/reference';
import { normalize } from './text';

export interface NearbyStore {
  chain: Chain;
  name: string;
  distanceM: number;
  address?: string;
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
    stores.push({ chain, name: tags.name || chain.name, distanceM: haversine(pos, p), address: address || undefined });
  }
  return stores.sort((a, b) => a.distanceM - b.distanceM);
}

export function fmtDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}
