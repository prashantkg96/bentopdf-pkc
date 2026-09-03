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

### Known stale tests (pre-existing, not caused by this sync)

- `src/tests/i18n.test.ts` — 8 failures. Asserts multi-language `getLanguageFromUrl`
  behaviour (`de`, `fr`, …) that the fork removed when it dropped non-English locales.
- `src/tests/pdf-tools.test.ts` — 1 failure. Expects 5 `simpleTools`; the fork has 4
  because Word→PDF was removed.

Both are verified pre-existing by running the suite on a clean `main` worktree.
