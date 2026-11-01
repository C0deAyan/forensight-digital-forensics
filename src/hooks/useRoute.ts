import { useEffect, useState } from 'react';

export function navigate(path: string) {
  window.location.hash = path;
}

export function useRoute(): string[] {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
}
