import { useEffect, useRef, useState } from 'react';

export interface MapPoint {
  key: string;
  lat: number;
  lon: number;
  label: string;
  color: string;
  saved: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    google?: any;
    __cookingHubMapsReady?: () => void;
  }
}

type MapsConfig = { mapsKey: string | null; mapId: string };
let loading: Promise<MapsConfig> | null = null;

/** Charge une seule fois l'API Maps JavaScript avec la clé navigateur fournie par le serveur. */
function loadGoogleMaps(): Promise<MapsConfig> {
  loading ??= fetch('/api/config')
    .then((r) => (r.ok ? (r.json() as Promise<MapsConfig>) : Promise.reject(new Error(`Configuration indisponible (${r.status}).`))))
    .then(
      (cfg) =>
        new Promise<MapsConfig>((resolve, reject) => {
          if (!cfg.mapsKey) return resolve(cfg);
          if (window.google?.maps?.marker) return resolve(cfg);
          window.__cookingHubMapsReady = () => resolve(cfg);
          const s = document.createElement('script');
          s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(cfg.mapsKey)}&v=weekly&loading=async&libraries=marker&language=fr&callback=__cookingHubMapsReady`;
          s.async = true;
          s.onerror = () => reject(new Error('Impossible de charger Google Maps.'));
          document.head.appendChild(s);
        }),
    )
    .catch((e) => {
      loading = null; // on réessaiera au prochain affichage
      throw e;
    });
  return loading;
}

function dot(p: { color: string; saved: boolean } | null): HTMLElement {
  const el = document.createElement('div');
  el.className = `map-dot ${p ? (p.saved ? 'is-saved' : 'is-nearby') : 'is-me'}`;
  if (p) el.style.setProperty('--dot', p.color);
  return el;
}

/** Lien Google Maps (appli ou site) qui montre les supermarchés autour d'un point, sans clé. */
export function mapsAround(center: { lat: number; lon: number }): string {
  return `https://www.google.com/maps/search/supermarch%C3%A9/@${center.lat},${center.lon},15z`;
}

/**
 * Carte Google Maps : nos magasins en pastilles pleines, les magasins trouvés autour en pastilles claires.
 * Sans clé navigateur configurée, on propose d'ouvrir Google Maps à la place.
 */
export function StoreMap({ center, points, onSelect }: { center: { lat: number; lon: number }; points: MapPoint[]; onSelect?: (key: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const markers = useRef<any[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'nokey' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    loadGoogleMaps()
      .then((cfg) => {
        if (!alive || !el.current) return;
        if (!cfg.mapsKey) return setStatus('nokey');
        map.current = new window.google.maps.Map(el.current, {
          center: { lat: center.lat, lng: center.lon },
          zoom: 14,
          mapId: cfg.mapId,
          colorScheme: 'FOLLOW_SYSTEM',
          disableDefaultUI: true,
          zoomControl: true,
          fullscreenControl: true,
          clickableIcons: false,
          gestureHandling: 'greedy',
        });
        setStatus('ready');
      })
      .catch((e: Error) => {
        if (!alive) return;
        setError(e.message);
        setStatus('error');
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status === 'ready') map.current?.panTo({ lat: center.lat, lng: center.lon });
  }, [status, center.lat, center.lon]);

  useEffect(() => {
    if (status !== 'ready' || !map.current) return;
    const { AdvancedMarkerElement } = window.google.maps.marker;
    markers.current.forEach((m) => (m.map = null));
    markers.current = [new AdvancedMarkerElement({ map: map.current, position: { lat: center.lat, lng: center.lon }, content: dot(null), title: 'Toi', zIndex: 1 })];
    for (const p of points) {
      const m = new AdvancedMarkerElement({ map: map.current, position: { lat: p.lat, lng: p.lon }, content: dot(p), title: p.label, zIndex: p.saved ? 3 : 2 });
      m.addListener('click', () => onSelect?.(p.key));
      markers.current.push(m);
    }
  }, [status, points, center.lat, center.lon, onSelect]);

  if (status === 'nokey' || status === 'error') {
    return (
      <div className="store-map map-fallback">
        <p className="small muted">{status === 'nokey' ? 'La carte Google n’est pas encore activée sur ce site (clé GOOGLE_MAPS_BROWSER_KEY manquante).' : error}</p>
        <a className="btn btn-soft" href={mapsAround(center)} target="_blank" rel="noreferrer">🗺️ Voir les magasins dans Google Maps</a>
      </div>
    );
  }
  return <div ref={el} className="store-map" role="application" aria-label="Carte des magasins" />;
}
