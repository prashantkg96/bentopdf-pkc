/**
 * "This tool needs an internet connection" notice.
 *
 * The Office→PDF tools run on LibreOffice compiled to WebAssembly — a ~75 MB
 * payload served from the WASM proxy Worker rather than bundled, because it is
 * three times Cloudflare's 25 MiB per-asset limit. That means they are the one
 * family of tools here that genuinely cannot work offline, and they are
 * deliberately left out of the offline precache (see
 * scripts/generate-offline-manifest.mjs, which reads the same JSON list).
 *
 * Without this module the offline experience is a dead drop-zone: the user
 * picks a file and nothing happens, or the conversion hangs on a fetch that
 * will never resolve. Instead we replace the tool UI with a plain explanation.
 *
 * This lives in the shared bundle that main.ts pulls in — NOT in the per-tool
 * chunk — precisely because the per-tool chunk is not precached. Offline, that
 * chunk 404s and the page script never runs, so the notice has to come from
 * code that is already cached.
 *
 * Side-effect module: imported once from main.ts, which every page loads.
 */

import config from '../config/internet-required-tools.json';

const TOOLS = new Set<string>(config.tools);

/** Page basename without the extension, e.g. "word-to-pdf". */
function currentSlug(): string | null {
  const path = window.location.pathname;
  const withExt = path.match(/\/([^/]+)\.html$/);
  if (withExt) return withExt[1];
  const withoutExt = path.match(/\/([^/]+)\/?$/);
  return withoutExt?.[1] ?? null;
}

export function isInternetRequiredTool(slug: string | null): boolean {
  return !!slug && TOOLS.has(slug);
}

const NOTICE_ID = 'internet-required-notice';

function noticeMarkup(): string {
  // Inline SVG rather than a lucide/phosphor glyph: this renders offline, and
  // the icon fonts may not have been re-initialised by the time we run.
  const icon =
    '<svg class="w-6 h-6 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/></svg>';

  return `
    <div
      id="${NOTICE_ID}"
      role="status"
      class="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 text-left"
    >
      ${icon}
      <div>
        <h2 class="font-semibold text-white mb-1">
          This tool needs an internet connection
        </h2>
        <p class="text-sm text-gray-300">
          Office conversions run on a ~75&nbsp;MB LibreOffice engine that is far
          too large to store for offline use, so it is downloaded on demand.
          Every other tool here keeps working offline.
        </p>
        <p class="text-sm text-gray-400 mt-2">
          Reconnect and this page will switch itself back on.
        </p>
      </div>
    </div>`;
}

/**
 * Hide the tool's own controls and show the notice in their place. Everything
 * above the drop zone (back link, title, subtitle) is deliberately left alone
 * so the page still reads as the tool the user asked for.
 */
function showNotice(): void {
  const host = document.getElementById('tool-uploader');
  if (!host || document.getElementById(NOTICE_ID)) return;

  const dropZone = document.getElementById('drop-zone');
  const options = document.getElementById('tool-options');
  const fileList = document.getElementById('file-display-area');
  // "First load takes a moment as we download our conversion engine" is
  // actively misleading when there is no connection to download it over.
  const firstLoadHint = document
    .querySelector('[data-i18n="tools.firstLoadNotice"]')
    ?.closest('div');
  for (const el of [dropZone, options, fileList, firstLoadHint]) {
    if (el) el.classList.add('hidden');
  }

  const holder = document.createElement('div');
  holder.innerHTML = noticeMarkup();
  const notice = holder.firstElementChild;
  if (!notice) return;
  if (dropZone && dropZone.parentElement) {
    dropZone.parentElement.insertBefore(notice, dropZone);
  } else {
    host.appendChild(notice);
  }
}

function hideNotice(): void {
  const notice = document.getElementById(NOTICE_ID);
  if (notice) notice.remove();
  document
    .querySelector('[data-i18n="tools.firstLoadNotice"]')
    ?.closest('div')
    ?.classList.remove('hidden');
  for (const id of ['drop-zone', 'tool-options', 'file-display-area']) {
    const el = document.getElementById(id);
    // #tool-options and the file list start hidden by design; only the drop
    // zone is unconditionally safe to reveal again.
    if (el && id === 'drop-zone') el.classList.remove('hidden');
  }
}

const STYLE_ID = 'internet-required-style';

/**
 * Mark links to these tools while the browser is offline, so the limitation is
 * visible before the click rather than only after it.
 *
 * Done as a generated stylesheet keyed on href plus one `data-offline` flag on
 * <html>, rather than by tagging elements: the homepage tool grid is built
 * dynamically by main.ts and other pages render their own cards, so anything
 * element-based would need a MutationObserver and would still miss late
 * renders. CSS applies to whatever exists, whenever it appears.
 *
 * The links stay clickable on purpose — clicking through to the page's full
 * explanation is more useful than a dead card.
 */
function installLinkStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const selectors = config.tools
    .flatMap((slug) => [`a[href$="/${slug}"]`, `a[href$="/${slug}.html"]`])
    .map((sel) => `html[data-offline] ${sel}`);

  const css = `
${selectors.join(', ')} {
  opacity: 0.55;
}
${selectors.map((sel) => `${sel}.tool-card::after`).join(', ')} {
  content: 'Needs internet';
  display: block;
  margin-top: 0.35rem;
  font-size: 0.65rem;
  line-height: 1;
  letter-spacing: 0.02em;
  color: rgb(251 191 36);
  border: 1px solid rgb(251 191 36 / 0.4);
  border-radius: 9999px;
  padding: 0.2rem 0.45rem;
}`;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

function markLinks(offline: boolean): void {
  if (offline) {
    installLinkStyles();
    document.documentElement.setAttribute('data-offline', '');
  } else {
    document.documentElement.removeAttribute('data-offline');
  }
}

function sync(): void {
  markLinks(!navigator.onLine);
  if (navigator.onLine) {
    // Coming back online mid-session: the per-tool chunk was never fetched, so
    // reload to pick it up rather than un-hiding a drop zone with no handlers.
    if (document.getElementById(NOTICE_ID)) window.location.reload();
    return;
  }
  if (isInternetRequiredTool(currentSlug())) showNotice();
}

export function initInternetRequiredNotice(): void {
  // Runs on every page: the on-page notice only applies to the 13 tools, but
  // the offline link marking applies anywhere those tools are linked from.
  const run = () => {
    sync();
    window.addEventListener('offline', sync);
    window.addEventListener('online', sync);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}

// Exported for the tools grid, so cards can be marked before the user clicks.
export const internetRequiredTools: readonly string[] = config.tools;

export { hideNotice as __hideNoticeForTests };

initInternetRequiredNotice();
