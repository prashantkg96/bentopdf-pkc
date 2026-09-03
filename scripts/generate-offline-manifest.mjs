// Generates dist/offline-manifest.json — the list of asset URLs the service
// worker precaches when the user enables "Offline mode" on the homepage.
//
// Runs at the END of the build (after Vite + the i18n/sitemap/header steps) so
// it captures every emitted asset. We walk the whole dist tree and keep the
// cacheable, runtime-needed files (JS/WASM/CSS/fonts/images/locale JSON),
// excluding source maps and pre-compressed (.br/.gz) variants and HTML (the
// loaded shell is already runtime-cached by the SW's network-first strategy).
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const DIST = 'dist';
const BASE = (process.env.BASE_URL || '/').replace(/\/?$/, '/'); // trailing slash

// Includes .html — PKC PDF Tools tools are separate pages (merge-pdf.html, …), so
// they must be cached for offline navigation to work, not just their assets.
const CACHEABLE =
  /\.(html|js|mjs|css|wasm|whl|zip|json|png|jpe?g|gif|svg|woff2?|ttf)$/i;
const EXCLUDE = /\.(map|br|gz)$/i;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const localUrls = walk(DIST)
  .filter((f) => CACHEABLE.test(f) && !EXCLUDE.test(f))
  .map((f) => relative(DIST, f).split(sep).join('/'))
  .filter((p) => p !== 'offline-manifest.json')
  .map((p) => BASE + p)
  .sort();

// CDN-hosted WASM packages loaded at RUNTIME by several tools (compress,
// PDF/A, merge/bookmarks/metadata, extract, deskew, e-book conversions).
// They live on jsDelivr, NOT in dist, so the dist walk above misses them —
// and without precaching them those tools break the moment you go offline
// (this is why "Compress PDF" failed offline). Keep versions in sync with
// src/js/utils/wasm-provider.ts (CDN_DEFAULTS) + src/js/const/cdn-version.ts.
const JSDELIVR = 'https://cdn.jsdelivr.net/npm';
const GS = '@bentopdf/gs-wasm@0.1.1';
const CPDF = 'coherentpdf@2.5.5';
const PYMUPDF = '@bentopdf/pymupdf-wasm@0.11.16';

const cdnWasmUrls = [
  // Ghostscript — PDF/A conversion, Font to Outline.
  `${JSDELIVR}/${GS}/assets/gs.js`,
  `${JSDELIVR}/${GS}/assets/gs.wasm`,
  // CoherentPDF — merge, split-by-bookmarks, table of contents, metadata, JSON.
  `${JSDELIVR}/${CPDF}/dist/coherentpdf.browser.min.js`,
  // PyMuPDF (pyodide runtime + every Python wheel it can load) — compress,
  // extract images/tables, deskew, EPUB/MOBI/FB2/XPS/CBZ conversions, etc.
  `${JSDELIVR}/${PYMUPDF}/dist/index.js`,
  ...[
    'pyodide.js',
    'pyodide.asm.js',
    'pyodide.asm.wasm',
    'pyodide-lock.json',
    'python_stdlib.zip',
    'pymupdf-1.26.3-cp313-none-pyodide_2025_0_wasm32.whl',
    'pymupdf4llm-0.0.27-py3-none-any.whl',
    'pdf2docx-0.5.8-py3-none-any.whl',
    'python_docx-1.2.0-py3-none-any.whl',
    'fonttools-4.56.0-py3-none-any.whl',
    'lxml-5.4.0-cp313-cp313-pyodide_2025_0_wasm32.whl',
    'numpy-2.2.5-cp313-cp313-pyodide_2025_0_wasm32.whl',
    'opencv_python-4.11.0.86-cp313-cp313-pyodide_2025_0_wasm32.whl',
    'typing_extensions-4.12.2-py3-none-any.whl',
  ].map((f) => `${JSDELIVR}/${PYMUPDF}/assets/${f}`),
];

// Tesseract.js (OCR PDF, Compare via OCR) also loads from jsDelivr at runtime:
// a worker script, ONE core WASM variant chosen by the browser's SIMD support,
// and per-language training data. Versions are read from the installed package
// so they can't drift from what tesseract.js actually requests. We precache the
// worker + ALL core variants (so whichever the browser selects is covered) +
// ENGLISH data (both the LSTM "best_int" and the legacy dirs, since the path
// depends on the OEM). Non-English OCR languages (100+) are far too large to
// bundle — they still download on first use and only work offline afterwards.
const tessPkg = require('tesseract.js/package.json');
const tessVer = tessPkg.version; // e.g. 7.0.0
const tessCoreVer = (tessPkg.dependencies['tesseract.js-core'] || '').replace(
  /^\D*/,
  ''
); // "^7.0.0" -> "7.0.0" (matches tesseract.js's own coreVersion.substring(1))
const TESS_CORE_VARIANTS = [
  'tesseract-core',
  'tesseract-core-lstm',
  'tesseract-core-simd',
  'tesseract-core-simd-lstm',
  'tesseract-core-relaxedsimd',
  'tesseract-core-relaxedsimd-lstm',
];
const tesseractUrls = [
  `${JSDELIVR}/tesseract.js@v${tessVer}/dist/worker.min.js`,
  ...TESS_CORE_VARIANTS.flatMap((v) => [
    `${JSDELIVR}/tesseract.js-core@v${tessCoreVer}/${v}.wasm.js`,
    `${JSDELIVR}/tesseract.js-core@v${tessCoreVer}/${v}.wasm`,
  ]),
  `${JSDELIVR}/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz`,
  `${JSDELIVR}/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz`,
];

// BASE (the tools index itself) is prepended so the installed PWA's start_url
// is guaranteed cached — otherwise launching the app offline shows "page
// unavailable" even though the tool sub-pages are cached.
const urls = [BASE, ...localUrls, ...cdnWasmUrls, ...tesseractUrls];

const manifest = { base: BASE, count: urls.length, urls };
writeFileSync(join(DIST, 'offline-manifest.json'), JSON.stringify(manifest));
console.log(
  `[offline-manifest] wrote ${urls.length} asset URLs (base ${BASE})`
);
