/**
 * Which tool takes this file? The logic behind src/js/wrong-file.ts, kept free of
 * the DOM so it can be tested over every tool.
 *
 * What a tool takes is the `accept` attribute of its page's #file-input, collected
 * into config/tool-inputs.json by scripts/pkc/gen-tool-inputs.mjs. The rule for a
 * suggestion, in order:
 *
 *   1. Only when EVERY file is one this tool cannot take, and we know what each
 *      file is. A mix (a JPG and a PNG on JPG to PDF) is left to the page, which
 *      keeps what it can use and says what it skipped. A file we cannot identify
 *      is left to the page too: guessing would send a real PDF away.
 *   2. The reverse of this tool when that fits: a PDF dropped on JPG to PDF most
 *      likely wanted PDF to JPG.
 *   3. Otherwise a converter into PDF that takes every file, the most specific one
 *      (the fewest accepted types): PNG to PDF before Images to PDF for a PNG,
 *      Images to PDF for a PNG and a WebP together. Ties keep catalogue order.
 *   4. Nothing else. A PDF dropped on Images to PDF could want any of 80 PDF tools,
 *      and a wrong guess is worse than the page's own message.
 */
import inputs from '../config/tool-inputs.json';

export interface FileLike {
  name: string;
  type: string;
}

export const TOOL_INPUTS: Record<string, string> = inputs.tools;

// The type a file's extension implies, for files the browser gave no type to (it
// happens with PDFs and HEIC on some Windows set-ups). Without it a PDF with an
// empty type would not match "application/pdf" and be sent away from a PDF tool.
const EXT_TYPE: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jp2: 'image/jp2',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  txt: 'text/plain',
  csv: 'text/csv',
  xml: 'text/xml',
  rtf: 'application/rtf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  epub: 'application/epub+zip',
  eml: 'message/rfc822',
};

// The reverse of a converter whose name does not follow pdf-to-<same word>.
const REVERSE: Record<string, string> = {
  'txt-to-pdf': 'pdf-to-text',
  'word-to-pdf': 'pdf-to-docx',
};

const tokensOf = (accept: string) =>
  accept
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

const extOf = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

// Every extension some tool names outright, so a file of that kind counts as known.
const NAMED_EXTS = new Set(
  Object.values(TOOL_INPUTS)
    .flatMap(tokensOf)
    .filter((t) => t.startsWith('.'))
    .map((t) => t.slice(1))
);

/** Whether we can say what this file is at all. */
export function isKnown(file: FileLike): boolean {
  const ext = extOf(file.name);
  return !!file.type || ext in EXT_TYPE || NAMED_EXTS.has(ext);
}

/** Whether a file fits an `accept` string, the way a browser's picker reads it. */
export function fits(file: FileLike, accept: string): boolean {
  const ext = extOf(file.name);
  const types = [file.type.toLowerCase(), EXT_TYPE[ext] || ''].filter(Boolean);
  return tokensOf(accept).some((t) => {
    if (t.startsWith('.')) return t.slice(1) === ext;
    if (t.endsWith('/*'))
      return types.some((y) => y.startsWith(t.slice(0, -1)));
    return types.includes(t);
  });
}

/** The tool to send these files to from `current`, or null to leave them be. */
export function suggestTool(
  files: FileLike[],
  current: string | null,
  tools: Record<string, string> = TOOL_INPUTS
): string | null {
  if (!current || !tools[current] || files.length === 0) return null;
  const here = tools[current];
  if (files.some((f) => !isKnown(f) || fits(f, here))) return null;

  const fitAll = Object.keys(tools).filter(
    (slug) => slug !== current && files.every((f) => fits(f, tools[slug]))
  );

  const base = current.match(/^(.+)-to-pdf$/);
  const reverse = REVERSE[current] || (base ? `pdf-to-${base[1]}` : '');
  if (reverse && fitAll.includes(reverse)) return reverse;

  const converters = fitAll.filter((slug) => slug.endsWith('-to-pdf'));
  if (converters.length === 0) return null;
  // Array.prototype.sort is stable, so equal counts keep catalogue order.
  converters.sort(
    (a, b) => tokensOf(tools[a]).length - tokensOf(tools[b]).length
  );
  return converters[0];
}
