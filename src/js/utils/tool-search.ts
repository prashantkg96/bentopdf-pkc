/**
 * Ranks the tools for the search box on the tools page.
 *
 * It used to list every tool whose name or subtitle contained the text, in
 * catalogue order. A search for "image" then put Images to PDF behind every tool
 * that merely mentions images, from PDF Editor ("add shapes/images") down. Now the
 * name counts before the subtitle, and a name that starts with the text comes
 * first:
 *
 *   0  the name is the search ("png to pdf" finds PNG to PDF)
 *   1  the name starts with it ("image" finds Images to PDF)
 *   2  every word of the search starts a word of the name ("image to pdf" finds
 *      Images to PDF, "images" finds Extract Images)
 *   3  the name contains it anywhere ("erge" finds Merge PDF)
 *   4  every word starts a word of the name or the subtitle
 *   5  the subtitle contains it anywhere
 *
 * Ranks 3 and 5 are the old rule, so nothing it found is lost. Within a rank the
 * catalogue order stands.
 */

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const wordsOf = (s: string) => s.split(/[^a-z0-9]+/).filter(Boolean);

const everyWordStarts = (query: string[], words: string[]) =>
  query.length > 0 && query.every((q) => words.some((w) => w.startsWith(q)));

/** The rank of one tool for a search, or null when it does not match. */
export function searchRank(
  name: string,
  subtitle: string,
  search: string
): number | null {
  const q = norm(search);
  if (!q) return null;
  const n = norm(name);
  const s = norm(subtitle);
  const qWords = wordsOf(q);
  const nWords = wordsOf(n);

  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (everyWordStarts(qWords, nWords)) return 2;
  if (n.includes(q)) return 3;
  if (everyWordStarts(qWords, [...nWords, ...wordsOf(s)])) return 4;
  if (s.includes(q)) return 5;
  return null;
}

/** The matching items, best first; equal ranks keep their order. */
export function rankTools<T>(
  items: T[],
  search: string,
  textOf: (item: T) => { name: string; subtitle: string }
): T[] {
  return items
    .map((item, i) => {
      const { name, subtitle } = textOf(item);
      return { item, i, rank: searchRank(name, subtitle, search) };
    })
    .filter((r) => r.rank !== null)
    .sort((a, b) => a.rank! - b.rank! || a.i - b.i)
    .map((r) => r.item);
}
