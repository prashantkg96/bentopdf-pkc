# Security Policy

**PKC PDF Tools** is a 100% client-side, in-browser PDF toolkit (a fork of
[BentoPDF](https://github.com/alam00000/bentopdf)). Files are processed entirely
in your browser using WebAssembly/JavaScript and are **never uploaded** to any
server. The only network traffic is loading the static app/WASM assets and an
anonymous usage ping (tool name + file type/size/count — never file names or
contents).

Because there is no server-side file handling, the security surface is mainly:

- the static assets and the Content-Security-Policy shipped in
  [`public/_headers`](public/_headers);
- the privacy analytics in `src/js/utils/pkc-tool-analytics.ts`;
- the Cloudflare Worker that reverse-proxies the site.

## Reporting a vulnerability

Please report security issues **privately** via this repository's
[GitHub Security Advisories](https://github.com/prashantkg96/bentopdf-pkc/security/advisories/new)
rather than opening a public issue. Include steps to reproduce and the affected
URL/tool.

If the vulnerability is in the **underlying PDF tooling** (i.e. it also affects
upstream), please also report it to
[BentoPDF](https://github.com/alam00000/bentopdf) so the fix benefits everyone.
