import { chainsFor, type Chain } from '../data/reference';
import { normalize } from './text';

export interface NearbyStore {
  chain: Chain;
  name: string;
  distanceM: number;
  address?: string;
  lat: number;
  lon: number;
  /** Google impose d'afficher son attribution. */
  source?: 'google';
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

/** Position d'une ville / d'un code postal via Google (par notre serveur), si la géolocalisation est refusée. */
export async function geocodePlace(query: string, country: string): Promise<{ lat: number; lon: number; label: string }> {
  const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}&country=${country}`);
  const data = (await res.json().catch(() => ({}))) as { lat?: number; lon?: number; label?: string; error?: string };
  if (!res.ok || data.lat == null || data.lon == null) throw new Error(data.error ?? `Recherche de lieu indisponible (${res.status}).`);
  return { lat: data.lat, lon: data.lon, label: data.label ?? query };
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

/** Supermarchés via Google Places, par notre serveur (la clé n'est jamais dans l'appli). */
export async function findNearbyStores(pos: { lat: number; lon: number }, country: string, radiusM = 4000): Promise<NearbyStore[]> {
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

export function fmtDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}
