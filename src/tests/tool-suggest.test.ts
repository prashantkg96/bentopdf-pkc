// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { categories } from '@/js/config/tools';
import {
  TOOL_INPUTS,
  fits,
  isKnown,
  suggestTool,
} from '@/js/utils/tool-suggest';

const ROOT = process.cwd();
const file = (name: string, type = '') => ({ name, type });

// One file of every kind some tool names, plus a PDF, with the type a browser
// would give it and with none (some Windows set-ups give none).
const EXTS = [
  ...new Set(
    Object.values(TOOL_INPUTS)
      .flatMap((a) => a.split(','))
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.startsWith('.'))
      .map((t) => t.slice(1))
      .concat('pdf')
  ),
];
const SAMPLES = EXTS.map((ext) => file(`sample.${ext}`));

describe('tool-inputs.json', () => {
  it("matches every tool page's upload box (else run node scripts/pkc/gen-tool-inputs.mjs)", () => {
    const want: Record<string, string> = {};
    for (const category of categories) {
      for (const tool of category.tools) {
        if (tool.id in want) continue;
        const page = join(ROOT, 'src/pages', `${tool.id}.html`);
        if (!existsSync(page)) continue;
        const input = readFileSync(page, 'utf8').match(
          /<input[^>]*\bid="file-input"[^>]*>/s
        );
        const accept = input?.[0].match(/\baccept="([^"]*)"/);
        if (accept) want[tool.id] = accept[1];
      }
    }
    // Order too: catalogue order is the tie-break.
    expect(Object.entries(TOOL_INPUTS)).toEqual(Object.entries(want));
  });
});

describe('fits', () => {
  it('reads accept the way a file picker does', () => {
    expect(fits(file('a.png', 'image/png'), 'image/png')).toBe(true);
    expect(fits(file('a.PNG'), 'image/png')).toBe(true);
    expect(fits(file('a.jpg', 'image/jpeg'), 'image/png')).toBe(false);
    expect(fits(file('a.heic'), '.heic,.heif')).toBe(true);
    expect(fits(file('a.gif', 'image/gif'), 'image/*')).toBe(true);
    expect(fits(file('a.pdf'), 'application/pdf')).toBe(true);
  });

  it('knows a file by its type or its extension, and not otherwise', () => {
    expect(isKnown(file('a.zzz'))).toBe(false);
    expect(isKnown(file('noext'))).toBe(false);
    expect(isKnown(file('a.zzz', 'application/octet-stream'))).toBe(true);
    expect(isKnown(file('a.wpd'))).toBe(true);
  });
});

describe('suggestTool', () => {
  it.each([
    [
      'a PNG on JPG to PDF',
      [file('a.png', 'image/png')],
      'jpg-to-pdf',
      'png-to-pdf',
    ],
    ['a PNG with no type', [file('a.png')], 'jpg-to-pdf', 'png-to-pdf'],
    [
      'a JPG on PNG to PDF',
      [file('a.jpg', 'image/jpeg')],
      'png-to-pdf',
      'jpg-to-pdf',
    ],
    [
      'a GIF, which only Images to PDF takes',
      [file('a.gif', 'image/gif')],
      'jpg-to-pdf',
      'image-to-pdf',
    ],
    [
      'a PNG and a WebP together',
      [file('a.png', 'image/png'), file('b.webp', 'image/webp')],
      'jpg-to-pdf',
      'image-to-pdf',
    ],
    [
      'a PDF on JPG to PDF wants the reverse',
      [file('a.pdf', 'application/pdf')],
      'jpg-to-pdf',
      'pdf-to-jpg',
    ],
    [
      'a PDF on Text to PDF',
      [file('a.pdf', 'application/pdf')],
      'txt-to-pdf',
      'pdf-to-text',
    ],
    [
      'a PDF on Word to PDF',
      [file('a.pdf', 'application/pdf')],
      'word-to-pdf',
      'pdf-to-docx',
    ],
    [
      'a JPG on Compress PDF',
      [file('a.jpg', 'image/jpeg')],
      'compress-pdf',
      'jpg-to-pdf',
    ],
    ['a DOCX on Merge PDF', [file('a.docx')], 'merge-pdf', 'word-to-pdf'],
    [
      'a CSV goes to CSV, not Excel',
      [file('a.csv', 'text/csv')],
      'merge-pdf',
      'csv-to-pdf',
    ],
    [
      'an ODT goes to ODT, not Word',
      [file('a.odt')],
      'merge-pdf',
      'odt-to-pdf',
    ],
    [
      'an XML goes to XML, not FB2',
      [file('a.xml', 'text/xml')],
      'merge-pdf',
      'xml-to-pdf',
    ],
    ['a HEIC with no type', [file('a.heic')], 'jpg-to-pdf', 'heic-to-pdf'],
  ])('%s', (_label, files, current, want) => {
    expect(suggestTool(files, current)).toBe(want);
  });

  it.each([
    ['a file the tool takes', [file('a.jpg', 'image/jpeg')], 'jpg-to-pdf'],
    ['a PDF on a PDF tool', [file('a.pdf', 'application/pdf')], 'compress-pdf'],
    ['a PDF with no type on a PDF tool', [file('a.pdf')], 'compress-pdf'],
    [
      'a mix the page can partly use',
      [file('a.jpg', 'image/jpeg'), file('b.png', 'image/png')],
      'jpg-to-pdf',
    ],
    ['a file nobody can name', [file('a.zzz')], 'jpg-to-pdf'],
    [
      'a file no tool takes',
      [file('a.zzz', 'application/octet-stream')],
      'jpg-to-pdf',
    ],
    [
      'a PDF on Images to PDF, which has no reverse',
      [file('a.pdf', 'application/pdf')],
      'image-to-pdf',
    ],
    [
      'a page without an upload box',
      [file('a.png', 'image/png')],
      'markdown-to-pdf',
    ],
    ['no page', [file('a.png', 'image/png')], null],
    ['no files', [], 'jpg-to-pdf'],
  ])('leaves alone %s', (_label, files, current) => {
    expect(suggestTool(files, current)).toBeNull();
  });

  it('never suggests the tool you are on, or one that cannot take the files', () => {
    for (const current of Object.keys(TOOL_INPUTS)) {
      for (const sample of SAMPLES) {
        const to = suggestTool([sample], current);
        if (!to) continue;
        expect(to, `${sample.name} on ${current}`).not.toBe(current);
        expect(
          fits(sample, TOOL_INPUTS[to]),
          `${sample.name} on ${current} -> ${to}`
        ).toBe(true);
      }
    }
  });

  it('finds a tool for every kind of file a converter takes, from a PDF tool', () => {
    for (const sample of SAMPLES) {
      if (sample.name.endsWith('.pdf')) continue;
      expect(suggestTool([sample], 'merge-pdf'), sample.name).not.toBeNull();
    }
  });
});
