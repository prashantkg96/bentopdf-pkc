/**
 * Service Worker Registration
 * Registers the service worker to enable offline caching
 *
 * Note: Service Worker is disabled in development mode to prevent
 * conflicts with Vite's HMR (Hot Module Replacement)
 */

// Skip service worker registration in development mode
const isDevelopment =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.port !== '';

function collectTrustedWasmHosts(): string[] {
  const hosts = new Set<string>();
  const candidates = [
    import.meta.env.VITE_WASM_PYMUPDF_URL,
    import.meta.env.VITE_WASM_GS_URL,
    import.meta.env.VITE_WASM_CPDF_URL,
    import.meta.env.VITE_TESSERACT_WORKER_URL,
    import.meta.env.VITE_TESSERACT_CORE_URL,
    import.meta.env.VITE_TESSERACT_LANG_URL,
    import.meta.env.VITE_OCR_FONT_BASE_URL,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    try {
      hosts.add(new URL(raw).origin);
    } catch {
      console.warn(
        `[SW] Ignoring malformed VITE_* URL for SW trusted-hosts: ${raw}`
      );
    }
  }
  return Array.from(hosts);
}

function sendTrustedHostsToSw(target: ServiceWorker | null | undefined) {
  if (!target) return;
  const hosts = collectTrustedWasmHosts();
  if (hosts.length === 0) return;
  target.postMessage({ type: 'SET_TRUSTED_CDN_HOSTS', hosts });
}

if (isDevelopment) {
  console.log('[Dev Mode] Service Worker registration skipped in development');
  console.log('Service Worker will be active in production builds');
} else if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swPath = `${import.meta.env.BASE_URL}sw.js`;
    // Absolute URL of *our* SW, so we can tell it apart from any other SW that
    // may already control this page (e.g. the main PKC site registers a
    // broader-scope /sw.js that claims /toolkits/pdf-tools/ too).
    const swUrl = new URL(swPath, window.location.href).href;
    // Was this page already controlled by a PREVIOUS copy of *our* SW when it
    // loaded? That is the only case in which a controllerchange is a genuine
    // handover worth reacting to. Read it now, before register() can change it.
    const hadOwnController =
      navigator.serviceWorker.controller?.scriptURL === swUrl;
    console.log('[SW] Registering Service Worker at:', swPath);
    navigator.serviceWorker
      .register(swPath)
      .then((registration) => {
        console.log(
          '[SW] Service Worker registered successfully:',
          registration.scope
        );

        sendTrustedHostsToSw(
          registration.active || registration.waiting || registration.installing
        );

        setInterval(
          () => {
            registration.update();
          },
          24 * 60 * 60 * 1000
        );

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated') {
                sendTrustedHostsToSw(newWorker);
              }
              // Only a genuine update: the page must already be controlled by a
              // PREVIOUS version of *our* SW. A foreign controller (the main
              // site's /sw.js) on a first visit is not an update — treat that as
              // a silent first install.
              const controller = navigator.serviceWorker.controller;
              if (
                newWorker.state === 'installed' &&
                controller &&
                controller.scriptURL === swUrl
              ) {
                // No prompt. This used to confirm() on every load after a
                // deploy, and the question was never real: sw.js called
                // skipWaiting() in install and clients.claim() in activate, so
                // the new worker took over and the controllerchange handler
                // below reloaded the page whichever button was pressed.
                // Cancelling bought nothing but a second of delay.
                //
                // sw.js no longer skips waiting, so this worker now sits in
                // 'waiting' until every tab in scope is closed and picks itself
                // up on the next visit. Navigations are network-first, so the
                // HTML and its hashed bundles are already current regardless;
                // what waits here is the offline cache, which nobody needs to
                // be interrupted for.
                console.log(
                  '[SW] New version installed; it will activate once all tabs are closed.'
                );
              }
            });
          }
        });
      })
      .catch((error) => {
        console.error('[SW] Service Worker registration failed:', error);
      });

    navigator.serviceWorker.ready.then((registration) => {
      sendTrustedHostsToSw(registration.active);
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Only a HANDOVER justifies a reload. On a first visit there is no
      // controller at all until our SW calls clients.claim() — and this event
      // fires for that too, so the unguarded version reloaded the page on every
      // visitor's first ever view of the tools, discarding a page they had just
      // waited for. hadOwnController is false in exactly that case.
      if (!hadOwnController) {
        console.log('[SW] First install claimed this page; not reloading.');
        return;
      }
      console.log('[SW] New service worker took over, reloading...');
      window.location.reload();
    });
  });
}
