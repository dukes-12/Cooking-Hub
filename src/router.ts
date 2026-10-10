import { useEffect, useState } from 'react';

/** Routage minimal par hash (#/search, #/recipe/abc…) : marche hors-ligne et sans config serveur. */
export function useRoute(): string[] {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return parts.length ? parts : ['discover'];
}

export function go(path: string) {
  location.hash = path.startsWith('/') ? path : '/' + path;
}

export function back(fallback = '/discover') {
  if (history.length > 1) history.back();
  else go(fallback);
}
