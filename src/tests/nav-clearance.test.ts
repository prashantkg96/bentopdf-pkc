import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { pushFor } from '../js/nav-yield';

// The sticky top pill must never sit on a tool's controls. See the PKC note on
// --pkc-nav-clear in styles.css for the rule these tests hold every page to.

const root = resolve(__dirname, '../..');
const band = 112;
const rect = (top: number, height: number) => ({
  top,
  bottom: top + height,
  height,
});

describe('pushFor: a workspace shoves the header out of its way', () => {
  it('leaves the header alone while the workspace is below the band', () => {
    expect(pushFor([rect(400, 600)], band)).toBe(0);
    expect(pushFor([rect(band, 600)], band)).toBe(0);
  });

  it('moves the header up pixel for pixel as the workspace rises into the band', () => {
    expect(pushFor([rect(100, 600)], band)).toBe(12);
    expect(pushFor([rect(40, 600)], band)).toBe(72);
  });

  it('keeps the header out while the workspace fills the top of the viewport', () => {
    expect(pushFor([rect(0, 600)], band)).toBe(band);
    expect(pushFor([rect(-500, 600)], band)).toBe(band);
  });

  it('slides the header back once the workspace has gone above the viewport', () => {
    expect(pushFor([rect(-600, 600)], band)).toBe(band);
    expect(pushFor([rect(-650, 600)], band)).toBe(band - 50);
    expect(pushFor([rect(-800, 600)], band)).toBe(0);
  });

  it('ignores a workspace that is hidden until a file is open', () => {
    expect(pushFor([rect(0, 0)], band)).toBe(0);
  });

  it('takes the furthest push of several workspaces', () => {
    expect(pushFor([rect(500, 300), rect(50, 300)], band)).toBe(62);
  });
});

// Static guard for pages ported from upstream, which assumed a 64px navbar.
const pages = readdirSync(join(root, 'src/pages'))
  .filter((f) => f.endsWith('.html'))
  .map((f) => ({
    file: `src/pages/${f}`,
    text: readFileSync(join(root, 'src/pages', f), 'utf8'),
  }));

function tsFiles(dir: string): { file: string; text: string }[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory()
      ? tsFiles(`${dir}/${d.name}`)
      : d.name.endsWith('.ts')
        ? [
            {
              file: `${dir}/${d.name}`,
              text: readFileSync(join(root, dir, d.name), 'utf8'),
            },
          ]
        : []
  );
}

// Every class string in the pages, and every string literal in the scripts.
const classStrings = [
  ...pages.flatMap(({ file, text }) =>
    [...text.matchAll(/class="([^"]*)"/g)].map((m) => ({ file, cls: m[1] }))
  ),
  ...tsFiles('src/js').flatMap(({ file, text }) =>
    [...text.matchAll(/['"`]([^'"`\n]*)['"`]/g)].map((m) => ({
      file,
      cls: m[1],
    }))
  ),
];
const has = (cls: string, token: string) => cls.split(/\s+/).includes(token);

describe('no tool pins anything under the header', () => {
  it('sticky bars start at --pkc-nav-clear, not at a fixed offset', () => {
    const offenders = classStrings
      .filter(({ cls }) =>
        cls.split(/\s+/).some((t) => /^(lg:|md:|sm:)?sticky$/.test(t))
      )
      .filter(({ cls }) =>
        cls
          .split(/\s+/)
          .some(
            (t) =>
              /^(lg:|md:|sm:)?top-/.test(t) && !t.includes('--pkc-nav-clear')
          )
      )
      .map(({ file, cls }) => `${file}: ${cls}`);
    expect(offenders).toEqual([]);
  });

  it('full-screen overlays use a z-index the header rule raises above the pill', () => {
    // styles.css lifts exactly these to 4000; z-[9999] was above the pill already.
    const raised = ['z-40', 'z-50', 'z-[60]', 'z-[100]', 'z-[9999]'];
    const offenders = classStrings
      .filter(({ cls }) => has(cls, 'fixed') && has(cls, 'inset-0'))
      .filter(({ cls }) => !raised.some((z) => has(cls, z)))
      .map(({ file, cls }) => `${file}: ${cls}`);
    expect(offenders).toEqual([]);
  });

  it('styles.css still raises every overlay z-index the test above accepts', () => {
    const css = readFileSync(join(root, 'src/css/styles.css'), 'utf8');
    for (const sel of [
      '.fixed.inset-0.z-50',
      '.fixed.inset-0.z-40',
      '.fixed.inset-0.z-\\[60\\]',
      '.fixed.inset-0.z-\\[100\\]',
    ]) {
      expect(css).toContain(sel);
    }
  });

  it('every embedded viewer is marked as a workspace the header yields to', () => {
    const viewers: [string, string][] = [
      ['edit-pdf.html', 'embed-pdf-container'],
      ['sign-pdf.html', 'canvas-container-sign'],
      ['add-stamps.html', 'stamp-viewer-container'],
      ['form-filler.html', 'pdf-viewer-container'],
      ['compare-pdfs.html', 'compare-viewer'],
      ['markdown-to-pdf.html', 'markdown-editor-container'],
    ];
    for (const [page, id] of viewers) {
      const text = pages.find((p) => p.file.endsWith(`/${page}`))!.text;
      const tag = text.match(new RegExp(`<div[^>]*id="${id}"[^>]*>`))![0];
      expect(tag, page).toContain('data-pkc-workspace');
    }
  });
});
