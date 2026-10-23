import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

// pkc-theme.css remaps the dark-first Tailwind palette this app is written in
// (gray-900 page, gray-800 panels, gray-700 inputs, white and gray-200 text) onto
// theme tokens, so one set of classes serves light and dark. Upstream's
// light-palette classes go through the same remap and come out inside out: in
// light mode bg-white is the dark strong-text colour and text-gray-700 a pale
// surface colour. That is how the Bookmark editor's panels went dark brown with
// cream text, and Form Creator's page and Multi Tool's thumbnails went dark.

const root = resolve(__dirname, '../..');
const files = [
  ...readdirSync(join(root, 'src/pages'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => `src/pages/${f}`),
  ...readdirSync(join(root, 'src/js/logic'))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => `src/js/logic/${f}`),
];

// Every class attribute in the pages, and every string literal in the scripts.
const classStrings = files.flatMap((file) => {
  const text = readFileSync(join(root, file), 'utf8');
  const re = file.endsWith('.html')
    ? /class="([^"]*)"/g
    : /['"`]([^'"`\n]*)['"`]/g;
  return [...text.matchAll(re)].map((m) => ({ file, cls: m[1] }));
});
const tokens = (cls: string) => cls.split(/\s+/);

describe('no tool uses classes the theme remap turns inside out', () => {
  it('no light-palette panels or text', () => {
    const inverted =
      /^(hover:)?(bg-gray-(50|100|200)|text-gray-(700|800|900)|from-gray-(50|100)|to-gray-(100|200))$/;
    const offenders = classStrings
      .filter(({ cls }) => tokens(cls).some((t) => inverted.test(t)))
      .map(({ file, cls }) => `${file}: ${cls}`);
    expect(offenders).toEqual([]);
  });

  it('bg-white only on paper (pkc-paper), toggle knobs and resize handles', () => {
    const offenders = classStrings
      .filter(({ cls }) => tokens(cls).includes('bg-white'))
      .filter(
        ({ cls }) =>
          !['pkc-paper', 'rounded-full', 'resize-handle'].some((ok) =>
            tokens(cls).includes(ok)
          )
      )
      .map(({ file, cls }) => `${file}: ${cls}`);
    expect(offenders).toEqual([]);
  });
});
