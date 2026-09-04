/**
 * PKC PDF Tools WASM Proxy Worker
 *
 * This Cloudflare Worker proxies WASM module requests to bypass CORS restrictions.
 * It fetches WASM libraries (PyMuPDF, Ghostscript, CoherentPDF) from configured sources
 * and serves them with proper CORS headers.
 *
 * Endpoints:
 * - /pymupdf/* - Proxies to PyMuPDF WASM source
 * - /gs/* - Proxies to Ghostscript WASM source
 * - /cpdf/* - Proxies to CoherentPDF WASM source
 * - /libreoffice/* - Proxies to the LibreOffice WASM source (Office to PDF)
 *
 * Deploy: cd cloudflare && npx wrangler deploy -c wasm-wrangler.toml
 *
 * Required Environment Variables (set in Cloudflare dashboard):
 * - PYMUPDF_SOURCE: Base URL for PyMuPDF WASM files (e.g., https://cdn.example.com/pymupdf)
 * - GS_SOURCE: Base URL for Ghostscript WASM files (e.g., https://cdn.example.com/gs)
 * - CPDF_SOURCE: Base URL for CoherentPDF files (e.g., https://cdn.example.com/cpdf)
 * - LIBREOFFICE_SOURCE: Base URL for the LibreOffice WASM build. ~75 MB of
 *   soffice.wasm.gz + soffice.data.gz, which is exactly why it is proxied
 *   rather than shipped as a site asset (Cloudflare caps assets at 25 MiB).
 */

const ALLOWED_ORIGINS = [
  'https://prashantkumarchandra.in',
  'https://www.prashantkumarchandra.in',
];

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

const RATE_LIMIT_MAX_REQUESTS = 100;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

const CACHE_TTL_SECONDS = 604800;

const ALLOWED_EXTENSIONS = [
  '.js',
  '.mjs',
  '.wasm',
  '.data',
  '.py',
  '.so',
  '.zip',
  '.json',
  '.mem',
  '.asm.js',
  '.worker.js',
  '.html',
  '.gz', // tesseract.js-data/*/**.traineddata.gz
  '.whl', // pymupdf's pyodide Python wheel dependencies (numpy, opencv, etc.)
];

// PKC: /tesseract/* is a scoped passthrough to jsDelivr's npm CDN, not an open
// mirror. Only these package-name prefixes are allowed through, so this can't
// be abused to proxy arbitrary jsDelivr traffic. Tesseract.js (OCR) needs its
// worker script, its WASM core, and per-language .traineddata.gz files (one
// package per language — ~100 possible, hence a prefix allowlist rather than
// fixed URLs like the PYMUPDF_SOURCE/GS_SOURCE/CPDF_SOURCE routes above).
const TESSERACT_JSDELIVR_BASE = 'https://cdn.jsdelivr.net/npm';
const TESSERACT_ALLOWED_PREFIXES = [
  'tesseract.js@',
  'tesseract.js-core@',
  '@tesseract.js-data/',
];

function isAllowedTesseractPath(subpath) {
  const p = subpath.replace(/^\/+/, '');
  return TESSERACT_ALLOWED_PREFIXES.some((prefix) => p.startsWith(prefix));
}

function isAllowedOrigin(origin) {
  if (!origin) return true; // Allow no-origin requests (e.g., direct browser navigation)
  return ALLOWED_ORIGINS.some((allowed) =>
    origin.startsWith(allowed.replace(/\/$/, ''))
  );
}

function isAllowedFile(pathname) {
  const ext = pathname.substring(pathname.lastIndexOf('.')).toLowerCase();
  if (ALLOWED_EXTENSIONS.includes(ext)) return true;

  if (!pathname.includes('.') || pathname.endsWith('/')) return true;

  return false;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range, Cache-Control',
    'Access-Control-Expose-Headers':
      'Content-Length, Content-Range, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function handleOptions(request) {
  const origin = request.headers.get('Origin');
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

function getContentType(pathname) {
  const ext = pathname.substring(pathname.lastIndexOf('.')).toLowerCase();
  const contentTypes = {
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.wasm': 'application/wasm',
    '.json': 'application/json',
    '.data': 'application/octet-stream',
    '.py': 'text/x-python',
    '.so': 'application/octet-stream',
    '.zip': 'application/zip',
    '.mem': 'application/octet-stream',
    '.html': 'text/html',
    '.gz': 'application/gzip',
    '.whl': 'application/zip',
  };
  return contentTypes[ext] || 'application/octet-stream';
}

// PKC: Tesseract.js builds its language-data URL two different ways depending
// on whether `langPath` is left at its default or overridden by us:
//   - default (unset):  `${jsdelivr}/@tesseract.js-data/${lang}/${version}/${lang}.traineddata.gz`
//     (version chosen internally: "4.0.0_best_int" for LSTM-only, else "4.0.0")
//   - overridden (ours): `${langPath}/${lang}.traineddata.gz` — flat, no version segment
// (see node_modules/tesseract.js/src/worker-script/index.js — `langPathDownload`).
// So a plain host-swap of the default URL doesn't work; this route reconstructs
// the version segment server-side. "4.0.0_best_int" matches what this app
// requests today (LSTM-only is the default OEM); "4.0.0" is a fallback for the
// Legacy/Combined OEM modes exposed in the OCR tool's Advanced Settings.
const TESSERACT_LANG_DATA_VERSIONS = ['4.0.0_best_int', '4.0.0'];

async function proxyTesseractLangData(request, subpath, origin) {
  const match = subpath.match(/^\/([a-zA-Z0-9_]+)\.traineddata\.gz$/);
  if (!match) {
    return new Response(
      JSON.stringify({
        error: 'Invalid path',
        message: 'Expected /tesseract-lang/<lang>.traineddata.gz',
      }),
      {
        status: 400,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      }
    );
  }
  const lang = match[1];

  for (const version of TESSERACT_LANG_DATA_VERSIONS) {
    const targetUrl = `${TESSERACT_JSDELIVR_BASE}/@tesseract.js-data/${lang}/${version}/${lang}.traineddata.gz`;
    const cacheKey = new Request(targetUrl, request);
    const cache = caches.default;
    let response = await cache.match(cacheKey);

    if (!response) {
      const upstream = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'PKC PDF Tools-WASM-Proxy/1.0',
          Accept: '*/*',
        },
      });
      if (!upstream.ok) continue; // try next version

      response = new Response(upstream.body, upstream);
      response.headers.set(
        'Cache-Control',
        `public, max-age=${CACHE_TTL_SECONDS}`
      );
      if (response.status === 200) {
        await cache.put(cacheKey, response.clone());
      }
    }

    const bodyData = await response.arrayBuffer();
    return new Response(bodyData, {
      status: 200,
      headers: {
        ...corsHeaders(origin),
        'Content-Type': 'application/gzip',
        'Content-Length': bodyData.byteLength.toString(),
        'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
        'X-Proxied-From': new URL(targetUrl).hostname,
      },
    });
  }

  return new Response(
    JSON.stringify({
      error: 'Failed to fetch resource',
      message: `No traineddata found for language "${lang}" under any known version.`,
    }),
    {
      status: 404,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Attach this request's CORS headers to a response, replacing any that a cached
 * copy already carries. Cached bodies are stored CORS-free on purpose.
 */
function withCors(response, origin) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Serve the LibreOffice payload straight out of R2.
 *
 * Preferred over proxying a public bucket URL: the bucket stays private (no
 * pub-*.r2.dev endpoint to rate-limit or abuse), there is no second network hop,
 * and no DNS/custom-domain setup. Falls back to LIBREOFFICE_SOURCE proxying when
 * no binding is present, so a self-hoster can still point this at any CDN.
 */
async function serveFromR2(request, ctx, bucket, key, origin) {
  if (!isAllowedFile(`/${key}`)) {
    return new Response(
      JSON.stringify({
        error: 'Forbidden file type',
        message: 'Only WASM-related file types are allowed.',
      }),
      {
        status: 403,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      }
    );
  }

  // The cache key does not vary on Range, so a cached full response would be
  // handed back for a ranged request. Range requests therefore skip the cache
  // in both directions and go straight to R2.
  const rangeRequested = request.headers.has('Range');
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).toString(), {
    method: 'GET',
  });
  if (!rangeRequested) {
    const cached = await cache.match(cacheKey);
    if (cached) return withCors(cached, origin);
  }

  // Only ask R2 for a range when the client actually sent one. Passing an
  // options object at all makes R2 populate object.range, which would otherwise
  // make every plain GET answer 206 — a protocol violation that some clients
  // (and intermediary caches) handle badly.
  const object = rangeRequested
    ? await bucket.get(key, { range: request.headers })
    : await bucket.get(key);
  if (!object) {
    return new Response(
      JSON.stringify({
        error: 'Not Found',
        message: `No object at ${key}. Upload the LibreOffice payload to the bound bucket.`,
      }),
      {
        status: 404,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      }
    );
  }

  // NB: no CORS headers here. The cache key does not vary on Origin, so baking
  // Access-Control-Allow-Origin into the cached body would serve whichever
  // origin happened to warm the cache to every other one — and both
  // prashantkumarchandra.in and its www. host are allowed, so that is a real
  // failure, not a theoretical one. CORS is applied per-request by withCors().
  const headers = new Headers({
    'Content-Type':
      object.httpMetadata?.contentType || getContentType(`/${key}`),
    'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}, immutable`,
    ETag: object.httpEtag,
    'X-Served-By': 'r2',
  });
  const isPartial = !!(rangeRequested && object.range);
  if (isPartial && object.size != null) {
    const start = object.range.offset ?? 0;
    const end = start + (object.range.length ?? object.size) - 1;
    headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
  }
  if (object.size != null && !isPartial) {
    headers.set('Content-Length', String(object.size));
  }
  headers.set('Accept-Ranges', 'bytes');

  const status = isPartial ? 206 : 200;
  const response = new Response(object.body, { status, headers });
  // Only full 200s are worth putting in the edge cache.
  if (status === 200) {
    ctx?.waitUntil?.(cache.put(cacheKey, response.clone()));
  }
  return withCors(response, origin);
}

async function proxyRequest(request, env, sourceBaseUrl, subpath, origin) {
  if (!sourceBaseUrl) {
    return new Response(
      JSON.stringify({
        error: 'Source not configured',
        message: 'This WASM module source URL has not been configured.',
      }),
      {
        status: 503,
        headers: {
          ...corsHeaders(origin),
          'Content-Type': 'application/json',
        },
      }
    );
  }

  const normalizedBase = sourceBaseUrl.endsWith('/')
    ? sourceBaseUrl.slice(0, -1)
    : sourceBaseUrl;
  const normalizedPath = subpath.startsWith('/') ? subpath : `/${subpath}`;
  const targetUrl = `${normalizedBase}${normalizedPath}`;

  if (!isAllowedFile(normalizedPath)) {
    return new Response(
      JSON.stringify({
        error: 'Forbidden file type',
        message: 'Only WASM-related file types are allowed.',
      }),
      {
        status: 403,
        headers: {
          ...corsHeaders(origin),
          'Content-Type': 'application/json',
        },
      }
    );
  }

  try {
    const cacheKey = new Request(targetUrl, request);
    const cache = caches.default;
    let response = await cache.match(cacheKey);

    if (!response) {
      response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'PKC PDF Tools-WASM-Proxy/1.0',
          Accept: '*/*',
        },
      });

      if (!response.ok) {
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch resource',
            status: response.status,
            statusText: response.statusText,
            targetUrl: targetUrl,
          }),
          {
            status: response.status,
            headers: {
              ...corsHeaders(origin),
              'Content-Type': 'application/json',
            },
          }
        );
      }

      const contentLength = parseInt(
        response.headers.get('Content-Length') || '0',
        10
      );
      if (contentLength > MAX_FILE_SIZE_BYTES) {
        return new Response(
          JSON.stringify({
            error: 'File too large',
            message: `File exceeds maximum size of ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`,
          }),
          {
            status: 413,
            headers: {
              ...corsHeaders(origin),
              'Content-Type': 'application/json',
            },
          }
        );
      }

      response = new Response(response.body, response);
      response.headers.set(
        'Cache-Control',
        `public, max-age=${CACHE_TTL_SECONDS}`
      );

      if (response.status === 200) {
        await cache.put(cacheKey, response.clone());
      }
    }

    const bodyData = await response.arrayBuffer();

    return new Response(bodyData, {
      status: 200,
      headers: {
        ...corsHeaders(origin),
        'Content-Type': getContentType(normalizedPath),
        'Content-Length': bodyData.byteLength.toString(),
        'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
        'X-Proxied-From': new URL(targetUrl).hostname,
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Proxy error',
        message: error.message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders(origin),
          'Content-Type': 'application/json',
        },
      }
    );
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    if (!isAllowedOrigin(origin)) {
      return new Response(
        JSON.stringify({
          error: 'Forbidden',
          message:
            'Origin not allowed. Add your domain to ALLOWED_ORIGINS if self-hosting.',
        }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(origin),
          },
        }
      );
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {
        status: 405,
        headers: corsHeaders(origin),
      });
    }

    if (env.RATE_LIMIT_KV) {
      const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
      const rateLimitKey = `wasm-ratelimit:${clientIP}`;
      const now = Date.now();

      const rateLimitData = await env.RATE_LIMIT_KV.get(rateLimitKey, {
        type: 'json',
      });
      const requests = rateLimitData?.requests || [];
      const recentRequests = requests.filter(
        (t) => now - t < RATE_LIMIT_WINDOW_MS
      );

      if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
        return new Response(
          JSON.stringify({
            error: 'Rate limit exceeded',
            message: `Maximum ${RATE_LIMIT_MAX_REQUESTS} requests per minute.`,
          }),
          {
            status: 429,
            headers: {
              ...corsHeaders(origin),
              'Content-Type': 'application/json',
              'Retry-After': '60',
            },
          }
        );
      }

      recentRequests.push(now);
      await env.RATE_LIMIT_KV.put(
        rateLimitKey,
        JSON.stringify({ requests: recentRequests }),
        {
          expirationTtl: 120,
        }
      );
    }

    if (pathname.startsWith('/pymupdf/')) {
      const subpath = pathname.replace('/pymupdf', '');
      return proxyRequest(request, env, env.PYMUPDF_SOURCE, subpath, origin);
    }

    if (pathname.startsWith('/gs/')) {
      const subpath = pathname.replace('/gs', '');
      return proxyRequest(request, env, env.GS_SOURCE, subpath, origin);
    }

    if (pathname.startsWith('/cpdf/')) {
      const subpath = pathname.replace('/cpdf', '');
      return proxyRequest(request, env, env.CPDF_SOURCE, subpath, origin);
    }

    if (pathname.startsWith('/libreoffice/')) {
      const subpath = pathname.replace('/libreoffice', '');
      if (env.LIBREOFFICE_BUCKET) {
        return serveFromR2(
          request,
          ctx,
          env.LIBREOFFICE_BUCKET,
          `libreoffice${subpath}`,
          origin
        );
      }
      return proxyRequest(
        request,
        env,
        env.LIBREOFFICE_SOURCE,
        subpath,
        origin
      );
    }

    if (pathname.startsWith('/tesseract/')) {
      const subpath = pathname.replace('/tesseract', '');
      if (!isAllowedTesseractPath(subpath)) {
        return new Response(
          JSON.stringify({
            error: 'Forbidden package',
            message:
              'Only tesseract.js, tesseract.js-core and @tesseract.js-data packages may be proxied.',
          }),
          {
            status: 403,
            headers: {
              ...corsHeaders(origin),
              'Content-Type': 'application/json',
            },
          }
        );
      }
      return proxyRequest(
        request,
        env,
        TESSERACT_JSDELIVR_BASE,
        subpath,
        origin
      );
    }

    if (pathname.startsWith('/tesseract-lang/')) {
      const subpath = pathname.replace('/tesseract-lang', '');
      return proxyTesseractLangData(request, subpath, origin);
    }

    if (pathname === '/' || pathname === '/health') {
      return new Response(
        JSON.stringify({
          service: 'PKC PDF Tools WASM Proxy',
          version: '1.0.0',
          endpoints: {
            pymupdf: '/pymupdf/*',
            gs: '/gs/*',
            cpdf: '/cpdf/*',
            libreoffice: '/libreoffice/*',
            tesseract: '/tesseract/*',
            tesseractLang: '/tesseract-lang/<lang>.traineddata.gz',
          },
          configured: {
            pymupdf: !!env.PYMUPDF_SOURCE,
            gs: !!env.GS_SOURCE,
            cpdf: !!env.CPDF_SOURCE,
            libreoffice: !!(env.LIBREOFFICE_BUCKET || env.LIBREOFFICE_SOURCE),
            libreofficeBackend: env.LIBREOFFICE_BUCKET
              ? 'r2-binding'
              : env.LIBREOFFICE_SOURCE
                ? 'proxy'
                : 'unconfigured',
            tesseract: true,
            tesseractLang: true,
          },
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders(origin),
            'Content-Type': 'application/json',
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        error: 'Not Found',
        message:
          'Use /pymupdf/*, /gs/*, /cpdf/*, /libreoffice/*, /tesseract/* or /tesseract-lang/* endpoints',
      }),
      {
        status: 404,
        headers: {
          ...corsHeaders(origin),
          'Content-Type': 'application/json',
        },
      }
    );
  },
};
