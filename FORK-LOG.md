# PKC PDF Tools — fork log

Running record of what this fork changed relative to upstream and why, so the
reasoning survives after the details are forgotten.

**What this repo is:** a fork of BentoPDF (`alam00000/bentopdf`, AGPL-3.0)
rebranded as **PKC PDF Tools** and deployed as a static sub-path app at
`https://prashantkumarchandra.in/toolkits/pdf-tools`.

**Fork mechanics you need to know before touching upstream:**

- `upstream` remote: `https://github.com/alam00000/bentopdf.git`
- The two histories are **unrelated** — there is no merge base, so
  `git merge upstream/main` does not work and never will. Everything is
  cherry-picked or patch-applied per commit.
- The fork snapshot was taken at upstream **~2026-06-27** (upstream v2.8.5 plus
  the qpdf split fix `d2dc459`, minus the v2.8.6 release commit `53bcf09`).
- Working tree is CRLF (`core.autocrlf=true`, no `.gitattributes`). Compare
  against upstream with `git diff HEAD upstream/main -- <path>` (git objects are
  LF on both sides) — a raw `diff` of working files reports every line changed.

**How to survey upstream for new work:**

```sh
git fetch upstream --prune
git log --format='%h %ad %s' --date=short <last-synced-sha>..upstream/main \
  | grep -v 'signed the CLA'
```

---

## 2026-09-04 — Upstream sync: 2026-06-27 → 2026-09-03 (upstream v2.8.8)

Branch: `upstream-sync-2026-09`.

Reviewed every non-CLA upstream commit in that window and sorted it into take /
adapt / skip. Baseline before the sync: 816 tests, 9 failing (all pre-existing
fork staleness — see "Known stale tests" below).

### Security and correctness fixes taken

| Upstream              | What                                                                                                                                                                   | Why it mattered here                                                                                                                                                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `8dcd936`             | Escape + protocol-check the unwrapped SafeLinks URL in `sanitizeEmailHtml`                                                                                             | Our copy ran DOMPurify and then re-injected the _decoded_ URL into `href="…"` raw. A `"` or a `javascript:` scheme in the decoded target escaped the attribute **after** sanitisation. Live XSS in the Email→PDF tool.                                                                    |
| `7070bae`             | Service-worker cache lookup: trusted-origin check + exact basename instead of `pathname.endsWith()`                                                                    | `findCachedFile()`/`removeDuplicateCache()` would serve any cached response whose path merely _ended with_ the wanted filename — e.g. a third-party `…/x-pdf.worker.min.mjs` returned as our pdf.js worker. Worse here than upstream because our offline mode caches the whole dist tree. |
| `115bc70` + `c449a85` | `Map.prototype.getOrInsert{,Computed}` polyfill, loaded ahead of the pdf.js worker                                                                                     | We ship the same `pdfjs-dist ^5.4.624`, which calls these TC39 Map-upsert methods. Browsers that have not shipped them yet hard-crash on render.                                                                                                                                          |
| `58cd1a8` (partial)   | Input validation: CBZ zip-bomb limits, bookmark JSON/CSV hardening, `email-to-pdf` MIME-type check, redact-node control-char strip, form-creator date-format allowlist | All applied. **Deliberately skipped** the `cloudflare/cors-proxy-worker.js` SSRF hardening in the same commit — we do not deploy that worker (`build:deploy` never sets `VITE_CORS_PROXY_URL`).                                                                                           |
| `706e74f`             | `safe-storage.ts`; i18n and `main.ts` route all `localStorage` through it; English bundled into the JS as an i18n resource                                             | Raw `localStorage` in `i18n.ts` throws in Safari private mode / storage-blocked contexts, which killed i18n init and took the page with it. The bundled-English half is also an **offline-mode** win: the UI keeps its strings when the locale JSON fetch fails.                          |
| `ee17fa8`             | `BASE_PATH` support in `scripts/seo-audit.mjs`                                                                                                                         | This is exactly why `build:deploy` had to drop `seo-audit.mjs`: canonical URLs never matched under `/toolkits/pdf-tools`. Audit is back in the deploy build.                                                                                                                              |
| `58cd1a8`             | `scripts/security-patterns-check.mjs` + `npm run security:patterns`, wired into `security:audit`                                                                       | Static check for code-injection sinks. Passes; two `sanitize-then-mutate` warnings remain, one of which is the `helpers.ts` site the SafeLinks fix above escapes at the sink.                                                                                                             |

Dependency bumps: `dompurify ^3.4.0 → ^3.4.14`, `mermaid ^11.15.0 → ^11.17.2`,
`markdown-it ^14.1.1 → ^14.3.1`, `vite ^8.0.10 → ^8.2.2`.

### Deliberately not taken

| Upstream                                                                                                | Why not                                                                                                           |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `10b63b5` sw-precache Vite plugin                                                                       | Our `scripts/generate-offline-manifest.mjs` already walks the whole dist tree and does strictly more.             |
| `866ecfe` build flag to disable the GitHub star counter                                                 | Already covered — `src/js/main.ts` gates it behind `__SIMPLE_MODE__`, and `build:deploy` sets `SIMPLE_MODE=true`. |
| `d2dc459` qpdf-based split                                                                              | Already in the tree, byte-identical. Predates the fork point.                                                     |
| `ca95925` nginx JSON cache, `0447cfc` Docker PORT validation, helm/Dockerfile/badge work                | We deploy static files, not the container.                                                                        |
| `f404ff0` Kura + Hyper Compress product pages and site redesign; `bfc3287` robots.txt; README/CLA churn | Upstream's own marketing. Conflicts with the PKC rebrand.                                                         |
| `58cd1a8` cors-proxy-worker SSRF hardening                                                              | We do not deploy that worker. Revisit if `VITE_CORS_PROXY_URL` is ever set.                                       |

### Features taken

Ported with `scripts/pkc/pkcify-page.py` (see below) so every new page picks up
the PKC head, theme bootstrap, `pkc-shell` wrapper, favicon and FAQ markup that
the rest of the fork already uses.

| Upstream  | What                                                                                                                                                                                                                                                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `829b13f` | **Duplex Collate** — new tool. Reorders a front-block/back-block duplex scan into collated page order, optionally exporting one PDF per original document as a ZIP. Pure `pdf-lib` + `jszip`, no new dependencies. Registered in `tools.ts`, `main.ts`, `tools.html`, `pdf-merge-split.html`, `vite.config.ts`, the en locale and the docs sidebar. |
| `9635c39` | **Tiled watermark** layout with adjustable horizontal/vertical gaps, plus a tile preview canvas.                                                                                                                                                                                                                                                    |
| `af5b95e` | **Merge → "Remove duplicate fonts"** — meaningful size win when merging PDFs built from the same template.                                                                                                                                                                                                                                          |
| `e1a4a31` | PDF→TIFF now reports an out-of-memory failure with actionable advice (lower DPI / disable multi-page) instead of dying.                                                                                                                                                                                                                             |
| `b21f602` | TSA URL validation and an allowlist of preset hosts, applied to digital-sign and the timestamp workflow node.                                                                                                                                                                                                                                       |

For `add-watermark.html` and `merge-pdf.html` the upstream page had drifted far
enough that a hunk-level patch conflicted. Both were re-taken wholesale from
`upstream/main` and run through `pkcify-page.py`; the only thing the fork had
that upstream did not was branding, which the script reproduces.

### Porting a page from upstream

`scripts/pkc/pkcify-page.py <src/pages/*.html>` applies every transformation the
fork made by hand to its other tool pages: theme bootstrap script, brand and URL
rewrite, dropping BentoPDF artwork/handles, the PKC favicon, the
`<main class="pkc-shell">` wrapper, the lucide upload icon, and converting
upstream's redesigned `.faq-*` markup back to the fork's theme-aware inline
Tailwind. Run `npx prettier --write` afterwards. It is validated by round-tripping
`alternate-merge.html`: the output matches the hand-converted page except for
upstream's own later copy edits.

It does NOT fix where the page pins things. Upstream assumed a 64px navbar, so a
ported page with a sticky bar, a full-screen editor or an embedded viewer will sit
under the shared top pill. After building, run
`node scripts/pkc/audit-nav-overlap.mjs <page>` and apply the rule in the
2026-10-23 entry below.

### Office to PDF restored

The fork dropped the 22 Office to PDF tools in `70e0834` for one concrete
reason: the LibreOffice WASM payload is ~75 MB (`soffice.wasm.gz` +
`soffice.data.gz`) and Cloudflare caps a Worker site asset at 25 MiB, so the
deploy failed. That constraint no longer applies, because the fork has since
built a first-party WASM proxy Worker (`cloudflare/wasm-proxy-worker.js`,
`a6fa9f6`) for exactly this class of problem.

What changed to make it work:

- `cloudflare/wasm-proxy-worker.js` gains a `/libreoffice/*` route backed by a
  `LIBREOFFICE_SOURCE` binding, alongside the existing pymupdf/gs/cpdf routes.
  **This needs setting before the tools work in production:**
  `npx wrangler secret put LIBREOFFICE_SOURCE -c wasm-wrangler.toml`.
- `src/js/utils/libreoffice-loader.ts` reads `VITE_WASM_LIBREOFFICE_URL` and
  falls back to `public/libreoffice-wasm/` when it is unset, so a plain
  `npm run build` or a self-host still works the upstream way.
- A cross-origin URL cannot be handed to `new Worker()`, so when the payload is
  remote the three glue scripts are fetched and re-published as same-origin
  `blob:` URLs. `worker-src 'self' blob:` in the generated CSP already allows it.
- `public/sw.js` and `src/js/sw-register.ts` know about the proxied path, so the
  payload is cached for offline use after first use, and the proxy origin is
  trusted.
- The 75 MB blobs are **not** committed and never enter `dist/`.

Everything else was a reverse-apply of `70e0834` (`git apply -R`) for the
registration points: `tools.ts`, `pdf-tools.ts`, `main.ts`, `tools.html`,
`pdf-converter.html`, `vite.config.ts`, `generate-sitemap.mjs`,
`wasm-preloader.ts`, the workflow node registry, and the en locale. The 13 tool
pages were taken from `upstream/main` and run through `pkcify-page.py`. The
non-English locales stay deleted — that half of `70e0834` was a separate
decision and still stands.

Also fixed while here: `build:deploy` now exports `MSYS_NO_PATHCONV=1` and
`MSYS2_ARG_CONV_EXCL='*'`. Without them, Git Bash on Windows rewrites
`BASE_URL=/toolkits/pdf-tools` into `C:/Program Files/Git/toolkits/pdf-tools`
and every generated canonical URL and sitemap entry comes out mangled. The
newly re-enabled SEO audit is what surfaced this; it had been failing silently.

### Edit PDF Text, and the viewer engine swap underneath it

Upstream's headline feature for this window. Click a paragraph in a PDF and
rewrite it in place, with live reflow, font and style controls, and FreeText
annotations burned into the page content stream on export.

It does not work on `embedpdf-snippet`, so this also does the engine migration
upstream did across `e8f26c4`, `78cb827`, `8dc7509` and `6ac503e`:

- `vendor/embedpdf/embedpdf-snippet-2.9.1.tgz` is gone. In its place,
  `vendor/bentopdf-viewer/` and `vendor/bentopdf-pdfium/` (both at upstream's
  `8ff5002c6cd5` build) — one engine shared by the viewer and the text editor,
  instead of two WebAssembly instances.
- The viewer no longer ships its own `pdfium.wasm`, so `viteStaticCopy` and its
  target are gone from `vite.config.ts`. The engine is loaded through
  `EmbedPDF.init({ wasmUrl })`.
- `__ENGINE_VERSION__` (a hash of the vendored `editcore.js` + `editcore.wasm`)
  is defined at build time so bumping the tarball invalidates cached copies.
- New: `src/js/editcore/` (7 files), `edit-pdf-text-page.ts`,
  `edit-pdf-text-dock.ts`, `editor-fonts.ts`, the three `freetext-*` utils,
  `edit-pdf-text.css`, and the page. Registered in `tools.ts` (including popular
  tools), `main.ts`, `tools.html`, `pdf-editor.html`, `vite.config.ts`, and the
  en locale (114 strings, so the tool is fully internationalised).

Built assets stay well inside Cloudflare's 25 MiB per-asset cap — the largest is
`editcore.wasm` at 7.0 MB.

**One fix carried on top of upstream.** `src/js/editcore/engine-loader.js`
resolved the Node-side wasm path with `new URL(...).pathname`, which on Windows
yields `/D:/...`; Emscripten then resolved that against the current drive root
and looked for `D:\D:\...`. The leading slash is now stripped and the path
percent-decoded, so the editcore tests run on Windows. Worth re-checking after
any upstream bump of that file — it is an upstream bug, not a fork-local one.

### Branding sweep

Porting three tiers of upstream work reintroduced a lot of BentoPDF branding, so
this is now a repeatable script rather than a one-off:
`python scripts/pkc/debrand.py [--write]`. It reports by default and is
idempotent — a clean tree reports "0 files would change". **Run it after every
upstream port.**

What ships now, verified against a real `build:deploy` output:

- Zero `BentoPDF` / `Bento PDF` strings in any shipped HTML.
- Zero outbound links to `bentopdf.com`, `github.com/alam00000`, or upstream's
  Instagram/LinkedIn/X. The only `bentopdf` substring left in the built site is
  `github.com/prashantkg96/bentopdf-pkc` — this fork's own repo, linked from
  every page as the AGPL corresponding source.
- No BentoPDF artwork at all. Deleted `bentopdf-tools.png`, five `og-*.png`,
  `favicon.png/.svg/-no-bg.svg/-192x192.png/-512x512.png`, `apple-touch-icon.png`,
  `badge.svg`, `public/favicon.ico` and the two `docs/public/images` marks. The
  navbar/footer logo fallbacks and the docs logo now use `pkc-icon-192.png`.
  `public/images/` holds only the PKC icons plus the generic CCPA/GDPR/HIPAA badges.
- Removed the DigitalOcean referral badge from `index.html` — upstream's
  affiliate link, not ours.

Two things that were doing real damage, not just cosmetic:

- `scripts/generate-security-headers.mjs` had `DEFAULT_CORS_PROXY_ORIGIN`
  pointing at `bentopdf-cors-proxy.bentopdf.workers.dev`, which put a live
  `connect-src` grant for upstream's infrastructure into our shipped CSP and
  `public/_headers`. There is now **no** default; the directive omits it unless
  `VITE_CORS_PROXY_URL` is set.
- `src/js/main.ts` fetched the GitHub star count from
  `api.github.com/repos/alam00000/bentopdf` — upstream's repo. Retargeted.

Deliberately left alone:

- **`LICENSE`, `README.md`, `FORK-LOG.md`, `CLAUDE.md`.** AGPL-3.0 requires
  upstream's copyright and licence notices to survive, and these documents exist
  to say what this fork is a fork _of_. An early run rewrote README's credit into
  "a modified fork of PKC PDF Tools", which is both nonsense and a licence
  problem. None of them ship in the built site. They are in the script's
  `SKIP_PATHS` so this cannot happen again.
- **Load-bearing runtime keys**, protected in the script by name: the service
  worker purges old caches via `startsWith('bentopdf-')`, and `bentopdf-fonts`
  (IndexedDB) and `bentopdf:wasm-providers` (localStorage) hold user state.
  Renaming them is a silent data migration that orphans downloaded fonts and
  provider settings rather than moving them.
- **npm package names** — `@bentopdf/pymupdf-wasm`, `@bentopdf/gs-wasm`,
  `bentopdf-viewer`, `bentopdf-pdfium` — and the fork's own Worker/repo names.
  These are identifiers, not branding.

One near-miss worth remembering: the sweep renamed the noindex script path in
`entrypoint.sh` but the `Dockerfile.nonroot` `COPY` target was edited by hand to
a different name, which would have silently broken `ROBOTS_NOINDEX` in the
container. Both now say `pkc-pdf-tools-noindex.sh`. If you rename anything that
crosses a file boundary like this, grep both sides.

### PWA and offline mode

Checked rather than assumed, since this release adds ~30 pages and a new WASM
engine:

- **Offline manifest** — `generate-offline-manifest.mjs` walks the whole `dist`
  tree, so every new page is picked up with no per-tool registration. Verified in
  the built output: 734 URLs, including Edit PDF Text, Duplex Collate and all 13
  Office to PDF pages, plus `editcore.wasm`.
- **Existing offline-mode users** need no action. `src/js/offline-mode.ts`
  silently re-affirms the cache on page load from a cache-busted
  `offline-manifest.json?t=`, so a returning user picks up the new tools on their
  next visit.
- **`pwa-nav.ts` and `site.webmanifest`** are tool-agnostic (the nav trim collapses
  the pill to a single "PDF Tools" link regardless of tool count), so neither
  needed touching.
- **LibreOffice offline** — `public/sw.js` now caches the proxied
  `/libreoffice/` payload, and `sw-register.ts` sends the proxy origin in
  `SET_TRUSTED_CDN_HOSTS`, so Office to PDF works offline after first use.
- **`CACHE_VERSION` bumped v15 → v16.** This one is deliberate, not
  housekeeping: `findCachedFile()` previously matched on `pathname.endsWith()`,
  so a cache populated by v15 may hold an entry that matcher would have
  mis-served. Tightening the matcher stops _new_ bad matches but cannot un-cache
  old ones — only a version bump evicts them.

### Office to PDF is excluded from offline mode, by design

Office to PDF is the only tool family here that genuinely cannot work offline —
the LibreOffice payload is remote by necessity. Rather than let it look broken,
it is explicitly out of the offline story:

- `src/js/config/internet-required-tools.json` is the single source of truth,
  read by both `generate-offline-manifest.mjs` (build) and
  `src/js/utils/internet-required.ts` (runtime), so the precache and the notice
  cannot drift apart.
- The 13 per-tool JS chunks are dropped from the precache (~51 KB). The build
  **throws** if it does not exclude exactly 13, so a change in rollup's chunk
  naming fails loudly instead of silently re-caching them.
- The HTML shells stay cached on purpose: navigating there offline has to render
  a real page for the notice to appear on.
- The notice therefore lives in the shared bundle pulled in by `main.ts`, not in
  the per-tool chunk — that chunk is precisely the thing that is not cached.
- `libreoffice-loader-*.js` is **not** excluded. `pdf-workflow.html` statically
  imports and modulepreloads it, so dropping it would break the entire workflow
  page offline rather than just the Office nodes. It is 16 KB.
- `epub`/`mobi`/`fb2` to PDF look like the same family but run on PyMuPDF, which
  is precached and does work offline. A test asserts the list contains exactly
  the LibreOffice-backed tools and none of these.

### Browser verification (2026-09-04)

Ran against a real `build:deploy` output served at the deploy base path.

- **Edit PDF Text** — full round trip. The editcore WASM engine loaded, parsed a
  14-page PDF into 38 paragraph boxes with the embedded font detected, an inline
  edit reflowed live, Export produced a valid PDF, and re-importing that PDF
  showed the edited text still there with the font re-detected. Also confirms the
  Tier 1 pdf.js polyfill wrapper is live (`pdf.worker-*.js` is the wrapped one).
- **Word to PDF** — converted a .docx to a valid 1-page PDF 1.7. Tested against a
  cross-origin stand-in for the proxy route, which means the blob:-URL worker
  path in `libreoffice-loader.ts` is exercised, not just the same-origin path:
  all five payload files were fetched cross-origin and the conversion completed.
- **Duplex Collate** — 14-page input, auto-split at 7, correct preview summary,
  and the collated output re-parses as a valid 14-page PDF.
- **The offline notice** — appears on going offline, hides the drop zone and the
  (now misleading) "first load downloads our engine" hint, and reloads the page
  back to working state on reconnect.

**Correction to an earlier note in this log.** Getting Office to PDF working in
production needs **two** steps, not one. The deployed WASM proxy Worker is still
running the old code — its `/` health endpoint does not list a `libreoffice`
endpoint and `/libreoffice/*` 404s. So:

```sh
cd cloudflare
npx wrangler deploy -c wasm-wrangler.toml          # ship the /libreoffice/* route
npx wrangler secret put LIBREOFFICE_SOURCE -c wasm-wrangler.toml
```

Until both are done, the Office tools will fail at the payload fetch. Everything
on the client side is verified correct — it requests
`<proxy>/libreoffice/soffice.{wasm,data}.gz` and the three glue scripts.

### Office to PDF is deployed and live (2026-09-04)

**Done — no further action needed.** The Worker is deployed and Word to PDF was
verified converting against it end to end.

- **R2 bucket `pkc-pdf-tools-wasm`**, prefix `libreoffice/`, holding the 75 MB
  payload (`soffice.wasm.gz` 46.5 MB, `soffice.data.gz` 27.3 MB, plus the three
  glue scripts). The files were recovered from this repo's own history —
  `git cat-file -p 70e0834^:public/libreoffice-wasm/<file>` — so they are the
  exact build the loader expects, not a repack.
- **Bound to the Worker, not proxied through a public bucket URL.**
  `[[r2_buckets]] binding = "LIBREOFFICE_BUCKET"` in `wasm-wrangler.toml`. This
  keeps the bucket private (no `pub-*.r2.dev` endpoint to rate-limit or abuse),
  removes a network hop, and needs no DNS. `LIBREOFFICE_SOURCE` proxying is kept
  as a fallback for self-hosters, so no secret is required here at all.
- The `/` health endpoint now reports `libreofficeBackend: "r2-binding"`.

**Three bugs found and fixed by testing this properly rather than assuming:**

1. `bucket.get(key, { range })` was passed the whole `Request`; R2 wants
   `request.headers`. Range requests 500'd.
2. Every plain GET answered **206**. Passing an options object at all makes R2
   populate `object.range`, so the 206 branch fired without a Range request —
   a protocol violation. Now only ranged requests get 206.
3. **The important one.** CORS headers were baked into the cached response, and
   the cache key does not vary on `Origin`. Whichever origin warmed the cache
   had its `Access-Control-Allow-Origin` served to every other origin. Both
   `prashantkumarchandra.in` and its `www.` host are allowlisted, so this was a
   real production failure waiting to happen, not a theoretical one. Cached
   bodies are now stored CORS-free and `withCors()` applies the right header per
   request. Verified: apex, www and a third origin each get their own ACAO back
   from the same cached object.

Verification note: the allowlist briefly included `http://localhost:4173` so the
conversion could be driven from a local build. It was removed and redeployed
immediately; `localhost` is confirmed 403 again and both production origins 200.

### Offline marking on tool cards

Links to the 13 internet-required tools are dimmed and badged "Needs internet"
while the browser is offline, so the limitation shows before the click as well
as after it.

Implemented as a generated stylesheet keyed on `href` plus one `data-offline`
attribute on `<html>`, rather than by tagging elements. The homepage tool grid is
built dynamically by `main.ts` and other pages render their own cards, so
anything element-based would need a MutationObserver and would still miss late
renders; CSS applies to whatever exists whenever it appears. The links stay
clickable on purpose — reaching the page's full explanation beats a dead card.

Verified in-browser on `pdf-converter.html`: exactly 13 cards marked, the
image/text/data converters (jpg, png, webp, svg, heic, tiff, bmp, markdown, csv,
json) untouched, and everything clears on reconnect.

### Known stale tests (pre-existing, not caused by this sync)

- `src/tests/i18n.test.ts` — 8 failures. Asserts multi-language `getLanguageFromUrl`
  behaviour (`de`, `fr`, …) that the fork removed when it dropped non-English locales.
- `src/tests/pdf-tools.test.ts` — 1 failure. Expects 5 `simpleTools`; the fork has 4
  because Word→PDF was removed.

Both were verified pre-existing by running the suite on a clean `main` worktree.

**Both are now fixed.** Restoring Word to PDF brought `simpleTools` back to 5.
The `i18n.test.ts` cases were rewritten to assert what actually matters for an
English-only build: that the resolution order (URL path, stored preference,
navigator, build-time default) still holds and that anything outside the
supported set is rejected at each step. Suite is green: 866 passing, 0 failing,
up from 805 passing / 9 failing at the fork's previous state.

---

## 2026-10-23 — The sticky top pill no longer sits on any tool's controls

Since the shared top pill started sticking on 2026-09-11 (`bc6cefc`) it covers
the top of the viewport at every scroll depth: the pills down to 72px, then the
frosted band that fades out by 112px. Nothing checked what that landed on. An
audit of all 119 tool pages, each opened with a sample file and scrolled top to
bottom at desktop sizes, found three kinds of fault:

| Tool                                                 | What was under the header                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edit PDF Text                                        | Its whole toolbar: Export, Back, Open, Add a text box, Find, Add an image. The editor is `position: fixed; inset: 0`, so no scrolling could uncover it.                                                                                                                       |
| Bookmark                                             | The sticky Undo / Redo / Delete All / Reset / Back bar (`sticky top-0`), as soon as the page scrolled.                                                                                                                                                                        |
| Form Creator                                         | Upstream's offsets for its own 64px navbar (`top-4`, `top-16`, `top-[120px]`): the Properties heading and the page/grid toolbar. Its two toolbars also overlapped each other whenever the first wrapped onto two rows.                                                        |
| Edit PDF, Sign PDF, Add Stamps, Form Filler, Compare | The embedded viewer's own toolbar (Annotate, Shapes, Redact, zoom, the stamp and signature tools, page navigation) slid under the pill when the page was scrolled to the viewer. Scrolling back up does not rescue it: the wheel over a viewer scrolls the PDF, not the page. |

Also two overlays still under the pill (`z-[60]` page preview, `z-[100]`
password prompt), missed by `bc6cefc` because both are built in TypeScript.

**The rule, written beside `--pkc-nav-clear` in `src/css/styles.css`:**

1. Anything pinned starts at `--pkc-nav-clear` (the END of the band, 112px — the
   band blurs whatever sits between 72px and 112px). A pinned bar that content
   scrolls under takes `pkc-pinned-bar`, which frosts it in glass mode.
2. Full-screen overlays go above the header (z-index 4000).
3. An embedded viewer carries `data-pkc-workspace`, and `src/js/nav-yield.ts`
   moves the header out of its way: as the viewer's top rises into the band the
   pill rises with it, and it slides back once the viewer has scrolled away.
   This is sticky containment done by hand. It moves the pill's sticky `top` and
   translates the band, never transforms `.top-pills` (that would shrink the
   band to the pill's width).

Edit PDF Text keeps the site nav above it, like PDF Multi Tool, and hides the PKC
intro cards while open (they peeked out between the pill and the editor).
Form Creator's two toolbars now stick as one block.

**Checks.** `src/tests/nav-clearance.test.ts` is a static guard over every page
and script: no sticky offset that ignores `--pkc-nav-clear`, every full-screen
overlay on a z-index that is raised, and every viewer marked. It fails on the
old Bookmark page. `scripts/pkc/audit-nav-overlap.mjs` is the browser audit
itself; run it after porting any page from upstream (usage in its header). On
the live site before this change it reports all of the above; on this build it
reports nothing at 1440x900, 1366x768 and 1920x1080.
