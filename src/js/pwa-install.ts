/**
 * PWA install button — shown next to the offline toggle on the homepage.
 *
 * On Chrome/Edge/Android: captures beforeinstallprompt and shows a native
 * install prompt when the user clicks. Hidden once installed.
 *
 * On iOS (no beforeinstallprompt): shows the button immediately with a
 * Share → "Add to Home Screen" instruction alert.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

function btn(): HTMLButtonElement | null {
  return document.getElementById('pwa-install-btn') as HTMLButtonElement | null;
}

function isIos(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !(window as unknown as Record<string, unknown>)['MSStream']
  );
}

function isInstalled(): boolean {
  return (
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

function init() {
  const b = btn();
  if (!b || isInstalled()) return;

  if (isIos()) {
    b.hidden = false;
    b.addEventListener('click', () => {
      alert(
        'To install: tap the Share button (the box with an arrow) then "Add to Home Screen".'
      );
    });
    return;
  }

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    b.hidden = false;
  });

  b.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') b.hidden = true;
    deferredPrompt = null;
  });

  window.addEventListener('appinstalled', () => {
    b.hidden = true;
    deferredPrompt = null;
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
