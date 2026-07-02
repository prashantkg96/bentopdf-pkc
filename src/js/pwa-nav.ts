/**
 * PWA (installed / standalone) nav trimming.
 *
 * The shared PKC top-pill nav is loaded from the main site and links OUT to
 * Home / S.I.R / Contact / Instagram — all outside this app's
 * /toolkits/pdf-tools/ scope. Tapping any of them inside the installed PWA
 * leaves the app (and breaks offline use). So when the page is running as an
 * installed PWA we collapse the pill down to a single "PDF Tools" link (→ the
 * tools index) and repoint the brand logo at the same place. In a normal
 * browser tab the full nav is left completely untouched.
 *
 * Side-effect module: imported once from main.ts, which every page loads.
 */

// import.meta.env.BASE_URL is /toolkits/pdf-tools/ in the deployed build.
const TOOLS_HOME = import.meta.env.BASE_URL || '/toolkits/pdf-tools/';

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function trimNav(mount: HTMLElement): void {
  // Brand logo → tools home (the shared markup points it at "/").
  const brand = mount.querySelector<HTMLAnchorElement>('.brand-link');
  if (brand) brand.href = TOOLS_HOME;

  // Replace the multi-section desktop menu with a single "PDF Tools" link.
  const list = mount.querySelector('.nav-menu-list');
  if (list) {
    list.innerHTML = `<li><a class="nav-menu-link is-active" data-menu-key="pdf-tools" href="${TOOLS_HOME}">PDF Tools</a></li>`;
  }

  // Same for the mobile dropdown + its label.
  const dropdown = mount.querySelector('.nav-menu-dropdown');
  if (dropdown) {
    dropdown.innerHTML = `<a class="nav-menu-dropdown-link is-active" data-menu-key="pdf-tools" href="${TOOLS_HOME}">PDF Tools</a>`;
  }
  const current = mount.querySelector('.menu-current');
  if (current) current.textContent = 'PDF Tools';

  // Drop the external "Follow me on Instagram" link; keep the theme toggle.
  const social = mount.querySelector('.nav-action-pill .social-link');
  if (social) social.remove();
}

function init(): void {
  if (!isStandalone()) return;
  document.documentElement.setAttribute('data-pwa', 'standalone');

  const mount = document.getElementById('topPillsMount');
  if (!mount) return;

  // The pill is injected asynchronously by the shared top-pills.js loader, so
  // trim now if it's already there, otherwise wait for it to render.
  if (mount.querySelector('.top-pills')) {
    trimNav(mount);
    return;
  }
  const obs = new MutationObserver(() => {
    if (mount.querySelector('.top-pills')) {
      trimNav(mount);
      obs.disconnect();
    }
  });
  obs.observe(mount, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
