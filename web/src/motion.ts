import { createContext, useContext, useEffect, useState } from 'react';

export const MotionContext = createContext(true);
export const useMotionEnabled = () => useContext(MotionContext);

export function useMotionSettings() {
  const [preferred, setPreferred] = useState(() => {
    try { return localStorage.getItem('gilded-ace-motion') !== 'off'; } catch { return true; }
  });
  const [systemReduced, setSystemReduced] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setSystemReduced(query.matches);
    query.addEventListener?.('change', changed);
    return () => query.removeEventListener?.('change', changed);
  }, []);
  const toggle = () => setPreferred(value => {
    try { localStorage.setItem('gilded-ace-motion', value ? 'off' : 'on'); } catch { /* Storage is optional. */ }
    return !value;
  });
  return { enabled: preferred && !systemReduced, systemReduced, toggle };
}
