/**
 * "Enable offline mode" toggle (next to the homepage search bar).
 *
 * When enabled, it asks the service worker to precache the whole app (all tool
 * code + WASM + fonts + assets, from offline-manifest.json) so every tool works
 * with no internet. Opt-in and reversible; state persists in localStorage.
 *
 * No-ops gracefully where the SW isn't available (e.g. local `vite` dev, where
 * SW registration is intentionally skipped).
 */

const STORAGE_KEY = 'pkc_offline_enabled';
// Set once we've auto-enabled offline mode inside the installed PWA, so a user
// who later turns it back off isn't nagged into re-downloading on every launch.
const PWA_AUTO_KEY = 'pkc_offline_pwa_auto';

const OFF_CLASSES =
  'offline-toggle flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors text-sm font-semibold whitespace-nowrap';
const ON_CLASSES =
  'offline-toggle flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-green-500 bg-green-600 text-white hover:bg-green-700 transition-colors text-sm font-semibold whitespace-nowrap';
const WORKING_CLASSES =
  'offline-toggle flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-indigo-500 bg-indigo-600 text-white transition-colors text-sm font-semibold whitespace-nowrap cursor-progress';

type State = 'off' | 'working' | 'on';

// Icons (inline so they don't depend on lucide re-rendering after init):
// download cloud for off/working, encircled tick once offline-ready.
const ICON_DOWNLOAD =
  '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 13v8"/><path d="m8 17 4 4 4-4"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/></svg>';
const ICON_CHECK =
  '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>';

function btn(): HTMLButtonElement | null {
  return document.getElementById('offline-toggle') as HTMLButtonElement | null;
}

function setUi(state: State, label: string) {
  const b = btn();
  if (!b) return;
  b.dataset.state = state;
  b.className =
    state === 'on'
      ? ON_CLASSES
      : state === 'working'
        ? WORKING_CLASSES
        : OFF_CLASSES;
  b.disabled = state === 'working';
  b.innerHTML =
    (state === 'on' ? ICON_CHECK : ICON_DOWNLOAD) +
    '<span id="offline-toggle-label"></span>';
  const span = document.getElementById('offline-toggle-label');
  if (span) span.textContent = label;
}

/** Resolve the active service worker, or null. Looks the registration up by
 * scope (BASE_URL) rather than relying on `controller`/`ready`, which only
 * resolve once the current page is actually controlled by the SW. */
async function getSw(): Promise<ServiceWorker | null> {
  if (!('serviceWorker' in navigator)) return null;
  if (navigator.serviceWorker.controller)
    return navigator.serviceWorker.controller;
  try {
    const reg = await navigator.serviceWorker.getRegistration(
      import.meta.env.BASE_URL
    );
    return reg ? reg.active || reg.waiting || reg.installing : null;
  } catch {
    return null;
  }
}

async function fetchManifest(): Promise<string[]> {
  // ?t= bypasses the SW cache (the SW skips requests carrying a `t` query),
  // so we always read the freshest manifest after a deploy.
  const res = await fetch(
    `${import.meta.env.BASE_URL}offline-manifest.json?t=${Date.now()}`,
    { cache: 'no-cache' }
  );
  if (!res.ok) throw new Error(`manifest ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.urls) ? data.urls : [];
}

/**
 * Send the precache request to the SW. When `silent`, the UI stays on "Offline
 * ready" (used on page load to re-affirm the cache after an app update); other-
 * wise it shows live progress.
 */
async function startPrecache(silent: boolean) {
  const sw = await getSw();
  if (!sw) {
    if (!silent) {
      setUi('off', 'Unavailable here');
      setTimeout(() => restore(), 2500);
    }
    return;
  }

  let urls: string[];
  try {
    urls = await fetchManifest();
  } catch {
    if (!silent) {
      setUi('off', 'Failed — try again');
      setTimeout(() => restore(), 2500);
    }
    return;
  }
  if (!urls.length) return;

  if (!silent) setUi('working', 'Caching… 0%');

  const onMessage = (e: MessageEvent) => {
    const d = e.data || {};
    if (d.type === 'PRECACHE_PROGRESS' && !silent) {
      const pct = d.total ? Math.round((d.done / d.total) * 100) : 0;
      setUi('working', `Caching… ${pct}%`);
    } else if (d.type === 'PRECACHE_DONE') {
      navigator.serviceWorker.removeEventListener('message', onMessage);
      localStorage.setItem(STORAGE_KEY, '1');
      setUi('on', 'Offline ready');
    }
  };
  navigator.serviceWorker.addEventListener('message', onMessage);
  sw.postMessage({ type: 'PRECACHE_URLS', urls });
}

async function disableOffline() {
  const sw = await getSw();
  if (sw) sw.postMessage({ type: 'CLEAR_CACHE' });
  localStorage.removeItem(STORAGE_KEY);
  // Turning it off in the installed PWA is a deliberate choice — remember it so
  // we don't auto-re-download on the next launch.
  localStorage.setItem(PWA_AUTO_KEY, '1');
  setUi('off', 'Offline mode');
}

function restore() {
  if (localStorage.getItem(STORAGE_KEY) === '1') setUi('on', 'Offline ready');
  else setUi('off', 'Offline mode');
}

function init() {
  const b = btn();
  if (!b) return;
  restore();

  // If offline mode was previously enabled, quietly re-affirm the cache (an app
  // update bumps the SW cache version and clears it). Already-cached URLs are
  // skipped, so this is cheap when nothing changed.
  if (localStorage.getItem(STORAGE_KEY) === '1') {
    startPrecache(true);
  }

  b.addEventListener('click', () => {
    const state = b.dataset.state;
    if (state === 'working') return;
    if (state === 'on') disableOffline();
    else startPrecache(false);
  });

  maybeAutoEnableForPwa();
}

/**
 * When launched as an installed PWA, enable offline mode automatically the
 * first time so every tool works with no connection out of the box. Only fires
 * once (guarded by PWA_AUTO_KEY) so a later manual disable is respected, and
 * waits for the service worker to be active before precaching.
 */
function maybeAutoEnableForPwa() {
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (!standalone) return;
  if (localStorage.getItem(STORAGE_KEY) === '1') return; // already enabled
  if (localStorage.getItem(PWA_AUTO_KEY) === '1') return; // user opted out
  if (!('serviceWorker' in navigator)) return;

  // Don't set a guard here: on the very first launch the service worker taking
  // control triggers a one-time reload (see sw-register.ts) that can interrupt
  // this. Leaving STORAGE_KEY/PWA_AUTO_KEY unset means the retry after reload
  // runs again and completes; success sets STORAGE_KEY, a manual disable sets
  // PWA_AUTO_KEY — either one stops future auto-triggers.
  navigator.serviceWorker.ready
    .then(() => startPrecache(false))
    .catch(() => {
      /* SW never became ready; leave the toggle for manual use */
    });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
