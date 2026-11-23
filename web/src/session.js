// Per-browser session history (searches and opened documents) used for personalized recommendations.
// Stored in localStorage when available; the app keeps working without it.
import { useCallback, useEffect, useState } from 'react';

const KEY = 'sgc-toyota-history-v1';
const MAX = 15;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { queries: [], viewed: [] }; } catch { return { queries: [], viewed: [] }; }
}
function save(h) {
  try { localStorage.setItem(KEY, JSON.stringify(h)); } catch { /* private mode: keep in memory only */ }
}

let state = load();
const listeners = new Set();
function update(next) { state = next; save(state); listeners.forEach((fn) => fn(state)); }

export function addQuery(q) {
  const queries = [...state.queries.filter((x) => x !== q), q].slice(-MAX);
  update({ ...state, queries });
}
export function addViewed(id) {
  const viewed = [...state.viewed.filter((x) => x !== id), id].slice(-MAX);
  update({ ...state, viewed });
}
export function clearHistory() { update({ queries: [], viewed: [] }); }

export function useHistory() {
  const [h, setH] = useState(state);
  useEffect(() => { listeners.add(setH); return () => listeners.delete(setH); }, []);
  return h;
}

export function useHashRoute(defaultRoute) {
  const read = () => window.location.hash.replace(/^#\/?/, '') || defaultRoute;
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((r) => { window.location.hash = `/${r}`; }, []);
  return [route, go];
}
