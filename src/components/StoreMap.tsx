import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

export interface MapPoint {
  key: string;
  lat: number;
  lon: number;
  label: string;
  color: string;
  saved: boolean;
}

/**
 * Carte interactive (Leaflet + fonds OpenStreetMap, gratuits et sans clé).
 * Nos magasins sont des pastilles pleines, les magasins trouvés autour des cercles.
 */
export function StoreMap({ center, points, onSelect }: { center: { lat: number; lon: number }; points: MapPoint[]; onSelect?: (key: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lon], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© contributeurs OpenStreetMap',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    map.current?.setView([center.lat, center.lon], map.current.getZoom());
  }, [center.lat, center.lon]);

  useEffect(() => {
    if (!layer.current) return;
    layer.current.clearLayers();
    L.circleMarker([center.lat, center.lon], { radius: 7, color: '#fff', weight: 3, fillColor: '#2f80ed', fillOpacity: 1 })
      .bindTooltip('Toi')
      .addTo(layer.current);
    for (const p of points) {
      L.circleMarker([p.lat, p.lon], {
        radius: p.saved ? 10 : 8,
        color: p.saved ? '#fff' : p.color,
        weight: p.saved ? 3 : 2,
        fillColor: p.color,
        fillOpacity: p.saved ? 1 : 0.25,
      })
        .bindTooltip(p.label)
        .on('click', () => onSelect?.(p.key))
        .addTo(layer.current);
    }
  }, [points, center.lat, center.lon, onSelect]);

  return <div ref={el} className="store-map" role="application" aria-label="Carte des magasins" />;
}
