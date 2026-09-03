// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import config from '../js/config/internet-required-tools.json';

const ROOT = process.cwd();

describe('internet-required tools', () => {
  it('lists every LibreOffice-backed page and nothing else', () => {
    // The defining property is the LibreOffice WASM dependency: those tools
    // cannot work offline. Anything importing libreoffice-loader must be on the
    // list, and nothing else may be — epub/mobi/fb2 conversions look similar but
    // run on PyMuPDF, which IS precached and does work offline.
    const backedByLibreOffice = config.tools.filter((slug) => {
      const page = join(ROOT, 'src/js/logic', `${slug}-page.ts`);
      return (
        existsSync(page) &&
        readFileSync(page, 'utf8').includes('libreoffice-loader')
      );
    });

    expect(backedByLibreOffice.sort()).toEqual([...config.tools].sort());
  });

  it('does not list a tool that works offline', () => {
    for (const offlineCapable of ['epub-to-pdf', 'mobi-to-pdf', 'fb2-to-pdf']) {
      expect(config.tools).not.toContain(offlineCapable);
    }
  });

  it('has a page for every slug', () => {
    for (const slug of config.tools) {
      expect(
        existsSync(join(ROOT, 'src/pages', `${slug}.html`)),
        `missing src/pages/${slug}.html`
      ).toBe(true);
    }
  });

  it('is excluded from the precache by the manifest generator', () => {
    const gen = readFileSync(
      join(ROOT, 'scripts/generate-offline-manifest.mjs'),
      'utf8'
    );
    // Same JSON, not a second hand-maintained copy.
    expect(gen).toContain('internet-required-tools.json');
    // And the build must fail rather than silently precache them again.
    expect(gen).toMatch(
      /throw new Error\([\s\S]*?internet-required tool chunks/
    );
  });

  it('keeps libreoffice-loader itself cacheable', () => {
    // pdf-workflow.html statically imports it, so excluding the shared loader
    // chunk would break the whole workflow page offline, not just Office nodes.
    const gen = readFileSync(
      join(ROOT, 'scripts/generate-offline-manifest.mjs'),
      'utf8'
    );
    expect(gen).not.toMatch(/libreoffice-loader[^\n]*\.push\(/);
    const workflowNode = readFileSync(
      join(ROOT, 'src/js/workflow/nodes/word-to-pdf-node.ts'),
      'utf8'
    );
    expect(workflowNode).toContain('libreoffice-loader');
  });

  it('ships the notice in the shared bundle, not the per-tool chunk', () => {
    // The per-tool chunk is not precached, so a notice living there would never
    // run offline — which is exactly when it is needed.
    const main = readFileSync(join(ROOT, 'src/js/main.ts'), 'utf8');
    expect(main).toContain('internet-required');
  });
});
