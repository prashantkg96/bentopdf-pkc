import { describe, expect, it } from 'vitest';

import { categories } from '@/js/config/tools';
import { rankTools, searchRank } from '@/js/utils/tool-search';

// Each tool once, in catalogue order, as the tools page lists them.
const seen = new Set<string>();
const TOOLS = categories
  .flatMap((c) => c.tools)
  .filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
  .map((t) => ({ id: t.id, name: t.name, subtitle: t.subtitle || '' }));

const search = (q: string) => rankTools(TOOLS, q, (t) => t).map((t) => t.id);

describe('tool search', () => {
  it('puts Images to PDF first for "image"', () => {
    expect(search('image')[0]).toBe('image-to-pdf');
    expect(search('Image')[0]).toBe('image-to-pdf');
  });

  it('matches word by word, so "image to pdf" finds Images to PDF', () => {
    expect(search('image to pdf')[0]).toBe('image-to-pdf');
  });

  it('puts names before subtitles', () => {
    const jpg = search('jpg');
    expect(jpg.slice(0, 2)).toEqual(['jpg-to-pdf', 'pdf-to-jpg']);
    expect(search('images').indexOf('extract-images')).toBeLessThan(
      search('images').indexOf('edit-pdf')
    );
  });

  it('finds every tool first by its own name', () => {
    for (const tool of TOOLS) {
      const twins = TOOLS.filter(
        (t) => t.name.toLowerCase() === tool.name.toLowerCase()
      ).map((t) => t.id);
      expect(twins, tool.name).toContain(search(tool.name)[0]);
    }
  });

  it('still finds everything the old search found', () => {
    const queries = new Set<string>();
    for (const t of TOOLS) {
      for (const w of `${t.name} ${t.subtitle}`.toLowerCase().split(/\s+/)) {
        if (w.length >= 3) queries.add(w.slice(1, 4));
        queries.add(w);
      }
    }
    for (const q of queries) {
      const old = TOOLS.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.subtitle.toLowerCase().includes(q)
      ).map((t) => t.id);
      const now = new Set(search(q));
      for (const id of old) expect(now.has(id), `"${q}" lost ${id}`).toBe(true);
    }
  });

  it('keeps catalogue order within a rank, and ignores an empty search', () => {
    const items = [
      { name: 'Merge B', subtitle: '' },
      { name: 'Merge A', subtitle: '' },
    ];
    expect(rankTools(items, 'merge', (t) => t).map((t) => t.name)).toEqual([
      'Merge B',
      'Merge A',
    ]);
    expect(searchRank('Merge PDF', '', '   ')).toBeNull();
  });
});
