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

const DIST = 'dist';
const BASE = (process.env.BASE_URL || '/').replace(/\/?$/, '/'); // trailing slash

// Includes .html — BentoPDF tools are separate pages (merge-pdf.html, …), so
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

const urls = walk(DIST)
  .filter((f) => CACHEABLE.test(f) && !EXCLUDE.test(f))
  .map((f) => relative(DIST, f).split(sep).join('/'))
  .filter((p) => p !== 'offline-manifest.json')
  .map((p) => BASE + p)
  .sort();

const manifest = { base: BASE, count: urls.length, urls };
writeFileSync(join(DIST, 'offline-manifest.json'), JSON.stringify(manifest));
console.log(
  `[offline-manifest] wrote ${urls.length} asset URLs (base ${BASE})`
);
