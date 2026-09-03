import createModule from 'bentopdf-pdfium';

const inBrowser = typeof window !== 'undefined';

let ENGINE_VERSION = 'dev';
try {
  ENGINE_VERSION = __ENGINE_VERSION__;
} catch {
  ENGINE_VERSION = 'dev';
}

function resolveWasmUrl() {
  if (inBrowser) {
    const url = new URL('bentopdf-pdfium/editcore.wasm', import.meta.url);
    if (import.meta.env?.DEV) {
      url.searchParams.set('v', ENGINE_VERSION);
    }
    return url.href;
  }
  const resolve = import.meta.resolve;
  if (typeof resolve !== 'function') return null;
  // A file: URL's pathname is "/D:/..." on Windows. Handing that to Emscripten
  // makes fs.readFileSync resolve it against the current drive root, so it ends
  // up looking for "D:\D:\...". Strip the leading slash and decode escapes so
  // paths containing spaces survive too.
  const path = decodeURIComponent(
    new URL(resolve('bentopdf-pdfium/editcore.wasm')).pathname
  );
  return /^\/[A-Za-z]:\//.test(path) ? path.slice(1) : path;
}

const wasmUrl = resolveWasmUrl();

export const ENGINE_BUILD = `bentopdf-pdfium@${ENGINE_VERSION}`;

export function createEngineModule(options) {
  return createModule({
    ...(options ?? {}),
    locateFile: (file, prefix) =>
      file.endsWith('.wasm')
        ? (wasmUrl ?? `${prefix}editcore.wasm`)
        : `${prefix}${file}`,
  });
}
