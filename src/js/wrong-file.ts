/**
 * A file this tool cannot take is pointed at the tool that can.
 *
 * Until this, a PNG dropped on JPG to PDF was simply refused ("Only JPG, JPEG, JP2,
 * and JPX files are allowed"), and a JPG dropped on Compress PDF got "Please
 * upload a valid PDF file": the user was left to work out which of 100 tools
 * wanted it. Now, when EVERY file is one this tool cannot take, the page never
 * sees them. A dialog names the tool that can ("PNG to PDF"), and its button opens
 * that tool with the files already added. Which tool, and when, is decided in
 * utils/tool-suggest.ts; this module is only the page side.
 *
 * HOW IT STEPS IN FRONT OF 100 DIFFERENT PAGES: every tool page takes files the
 * same two ways, a change on #file-input and a drop on #drop-zone, each wired by
 * the page's own script. Listening on window in the capture phase runs before
 * either, so one listener here covers every page without touching them.
 *
 * HOW THE FILES TRAVEL: in IndexedDB, on this device only, for one page load.
 * The next tool page to load takes them out and deletes them, whether or not they
 * were meant for it, and uses them only if they were and are under two minutes
 * old. Nothing is uploaded, as everywhere else in these tools.
 *
 * Side-effect module: imported once from main.ts, which every page loads.
 */
import { categories } from './config/tools.js';
import { suggestTool } from './utils/tool-suggest.js';

const DB_NAME = 'pkc-handoff';
const STORE = 'files';
const KEY = 'pending';
// Set beside the stash so a page load can tell, without opening IndexedDB, that
// there is something to collect. localStorage rather than sessionStorage so a stash
// left by a closed tab is still found, and deleted, by the next page.
const FLAG = 'pkc-handoff';
const MAX_AGE_MS = 2 * 60 * 1000;
const DIALOG_ID = 'pkc-wrong-file';

const TOOLS = new Map<string, { name: string; href: string }>();
for (const category of categories) {
  for (const tool of category.tools) {
    if (!TOOLS.has(tool.id)) TOOLS.set(tool.id, tool);
  }
}

/** Page basename without the extension, e.g. "jpg-to-pdf". */
function currentSlug(): string | null {
  const path = window.location.pathname;
  const withExt = path.match(/\/([^/]+)\.html$/);
  if (withExt) return withExt[1];
  const withoutExt = path.match(/\/([^/]+)\/?$/);
  return withoutExt?.[1] ?? null;
}

/* ── the handoff ─────────────────────────────────────────────────────────── */

interface Handoff {
  to: string;
  files: File[];
  at: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function stash(handoff: Handoff): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(handoff, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  localStorage.setItem(FLAG, handoff.to);
}

/** Reads the stash and deletes it in the same transaction. */
async function take(): Promise<Handoff | null> {
  const db = await openDb();
  try {
    return await new Promise<Handoff | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const get = store.get(KEY);
      store.delete(KEY);
      tx.oncomplete = () => resolve((get.result as Handoff) ?? null);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function receive(): Promise<void> {
  try {
    if (!localStorage.getItem(FLAG)) return;
    localStorage.removeItem(FLAG);
  } catch {
    return;
  }
  const handoff: Handoff | null = await take().catch((): null => null);
  if (!handoff || handoff.to !== currentSlug()) return;
  if (Date.now() - handoff.at > MAX_AGE_MS) return;

  const input = document.getElementById('file-input');
  if (!(input instanceof HTMLInputElement)) return;
  try {
    const dt = new DataTransfer();
    handoff.files.forEach((f) => dt.items.add(f));
    input.files = dt.files;
  } catch {
    return;
  }
  // The page's own change handler takes it from here, as if the files were picked.
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/* ── the dialog ──────────────────────────────────────────────────────────── */

function closeDialog(): void {
  document.getElementById(DIALOG_ID)?.remove();
}

function offer(to: string, files: File[]): void {
  const here = TOOLS.get(currentSlug() || '')?.name || 'This tool';
  const there = TOOLS.get(to);
  if (!there) return;
  closeDialog();

  // Built empty and filled with textContent: a file name is the user's text, and
  // never goes through innerHTML. `fixed inset-0 z-50` is lifted above the sticky
  // nav pill by the overlay rule in styles.css; pkc-frost keeps the panel solid
  // in glass mode.
  const overlay = document.createElement('div');
  overlay.id = DIALOG_ID;
  overlay.className =
    'fixed inset-0 z-50 flex items-center justify-center bg-gray-900/90 p-4';
  overlay.innerHTML = `
    <div role="dialog" aria-modal="true" aria-labelledby="pkc-wrong-file-title"
      class="pkc-frost bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full border border-gray-700">
      <h3 id="pkc-wrong-file-title" class="text-xl font-bold text-white mb-2"></h3>
      <p class="text-gray-300 mb-6"></p>
      <div class="flex flex-col gap-3">
        <button type="button" data-act="go" class="btn-gradient w-full"></button>
        <button type="button" data-act="stay"
          class="w-full bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold py-2 px-4 rounded-lg">Not now</button>
      </div>
    </div>`;

  const what =
    files.length === 1 ? files[0].name : `these ${files.length} files`;
  overlay.querySelector('h3')!.textContent = `Use ${there.name} for this`;
  overlay.querySelector('p')!.textContent =
    `${here} can't open ${what}. ${there.name} can.`;
  const go = overlay.querySelector<HTMLButtonElement>('[data-act="go"]')!;
  go.textContent = `Open ${there.name}`;

  go.addEventListener('click', async () => {
    go.disabled = true;
    try {
      await stash({ to, files, at: Date.now() });
    } catch {
      // No IndexedDB (some private windows): the tool opens empty, and the
      // files can be added there.
    }
    window.location.href = there.href;
  });
  overlay
    .querySelector('[data-act="stay"]')!
    .addEventListener('click', closeDialog);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeDialog();
  });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDialog();
  });

  document.body.appendChild(overlay);
  go.focus();
}

/* ── stepping in ─────────────────────────────────────────────────────────── */

function onChange(e: Event): void {
  const input = e.target;
  if (!(input instanceof HTMLInputElement) || input.id !== 'file-input') return;
  const files = Array.from(input.files || []);
  const to = suggestTool(files, currentSlug());
  if (!to) return;
  e.stopImmediatePropagation();
  input.value = '';
  offer(to, files);
}

function onDrop(e: DragEvent): void {
  const target = e.target;
  if (!(target instanceof Element)) return;
  if (!target.closest('#drop-zone') && target.id !== 'file-input') return;
  const files = Array.from(e.dataTransfer?.files || []);
  const to = suggestTool(files, currentSlug());
  if (!to) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  // The page lights its drop zone on dragover and clears it on drop or dragleave.
  // It never sees this drop, so tell it the drag left.
  document.getElementById('drop-zone')?.dispatchEvent(new Event('dragleave'));
  offer(to, files);
}

window.addEventListener('change', onChange, true);
window.addEventListener('drop', onDrop, true);

// After load, so the page's own script has wired #file-input before the files
// arrive on it.
if (document.readyState === 'complete') {
  setTimeout(receive, 0);
} else {
  window.addEventListener('load', () => setTimeout(receive, 0), { once: true });
}
