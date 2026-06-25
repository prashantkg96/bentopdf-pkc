<h1 align="center">PKC PDF Tools</h1>

> **A modified fork of [BentoPDF](https://github.com/alam00000/bentopdf), licensed under AGPL-3.0.**
> This repository is the complete corresponding source for the privacy-first,
> 100% client-side PDF toolkit running at
> **[prashantkumarchandra.in/toolkits/pdf-tools](https://prashantkumarchandra.in/toolkits/pdf-tools)**.
> Files are processed entirely in the browser — they never leave your device.

## About this fork

**PKC PDF Tools** is a rebranded, slimmed-down fork of the excellent open-source
[BentoPDF](https://github.com/alam00000/bentopdf) project. Per the AGPL-3.0
license, this repository is published as the corresponding source, and a
**“Source (AGPL-3.0)”** link is shown on every page of the running site.

### Changes from upstream BentoPDF

- **Rebranding** to “PKC PDF Tools” — PKC orange/black theme (`src/css/pkc-theme.css`); the BentoPDF navbar/footer are replaced by the shared PKC top-pill nav, a minimal footer, and a per-tool header (back link + breadcrumb) injected by `scripts/generate-i18n-pages.mjs`.
- **Deployment** — built in `SIMPLE_MODE` with `BASE_URL=/toolkits/pdf-tools`, deployed as its own Cloudflare Worker (`bentopdf-pkc`) and reverse-proxied by the main `pkc-in` site Worker.
- **Slimming** — removed the Office→PDF / LibreOffice-WASM feature and non-English locales to fit Cloudflare's 25 MiB per-asset limit.
- **Privacy-preserving analytics** (`src/js/utils/pkc-tool-analytics.ts`) — logs only the tool used + file type / size bucket / count, **never** file names or contents.
- **Security headers / CSP** shipped via `public/_headers`.
- A privacy-promise banner; the tools and their 100% client-side processing are otherwise unchanged from upstream.

All the underlying PDF capability is [BentoPDF](https://github.com/alam00000/bentopdf)'s work — huge thanks to the BentoPDF team. ❤️

## Privacy

Every operation runs in the browser (WebAssembly / JavaScript). No file is ever
uploaded to a server. The only network requests are loading the app/WASM assets
and an anonymous usage ping (tool name + file type/size/count — never the file
name or its contents).

## Build & deploy

Requires Node 20+. The build **must** set `BASE_URL=/toolkits/pdf-tools` so asset
URLs carry that prefix (the `pkc-in` Worker strips it when reverse-proxying).

```bash
npm install
npm run build:deploy   # tsc + vite build + i18n/sitemap/security-headers (SIMPLE_MODE, PKC branding)
npx wrangler deploy    # uploads ./dist to the bentopdf-pkc Worker
```

On Windows, set the env vars in **PowerShell** rather than relying on the bash
`export` inside `build:deploy` (Git Bash/MSYS rewrites the leading-slash value):

```powershell
$env:BASE_URL='/toolkits/pdf-tools'; $env:SIMPLE_MODE='true'
$env:VITE_BRAND_NAME='PKC PDF Tools'; $env:SITE_URL='https://prashantkumarchandra.in'
npx vite build
node scripts/generate-i18n-pages.mjs; node scripts/generate-sitemap.mjs; node scripts/generate-security-headers.mjs
npx wrangler deploy
```

For local development: `npm run dev`.

## License & credits

Licensed under **AGPL-3.0** — see [`LICENSE`](LICENSE) — inherited from upstream
BentoPDF. As this runs as a network service, the corresponding source is this
repository (also linked from every page of the live site).

This is a fork of **[BentoPDF](https://github.com/alam00000/bentopdf)** by
[@alam00000](https://github.com/alam00000) and contributors — thank you for
building and open-sourcing it. For the upstream project, its full feature list,
additional self-hosting options (Docker/Podman, commercial build, etc.) and
documentation, see the [BentoPDF repository](https://github.com/alam00000/bentopdf).
