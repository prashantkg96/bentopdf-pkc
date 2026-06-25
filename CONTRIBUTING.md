# Contributing

**PKC PDF Tools** is a rebranded, slimmed-down fork of
[BentoPDF](https://github.com/alam00000/bentopdf), published as the
corresponding AGPL-3.0 source for the toolkit running at
[prashantkumarchandra.in/toolkits/pdf-tools](https://prashantkumarchandra.in/toolkits/pdf-tools).

It is primarily a source mirror for this one deployment, so contributions are
scoped accordingly:

- **The PDF tools themselves** (features, or fixes to the actual PDF/WASM
  functionality) are best contributed **upstream to BentoPDF** at
  [github.com/alam00000/bentopdf](https://github.com/alam00000/bentopdf), so the
  whole community benefits. This fork tracks upstream for that work.
- **PKC-specific packaging** — the branding/theme (`src/css/pkc-theme.css`), the
  top-pill nav, the per-tool header/footer injection
  (`scripts/generate-i18n-pages.mjs`), the privacy analytics
  (`src/js/utils/pkc-tool-analytics.ts`), the `_headers` CSP, or the Cloudflare
  Worker deploy — are fair game for issues and pull requests **here**.

There is **no Contributor License Agreement** for this fork. It is AGPL-3.0,
inherited from upstream; by contributing you agree your changes are licensed
under AGPL-3.0.

## Local setup

Requires Node 20+. See the [README](README.md#build--deploy) for build and
deploy details (note the required `BASE_URL=/toolkits/pdf-tools`).

```bash
npm install
npm run dev
```
