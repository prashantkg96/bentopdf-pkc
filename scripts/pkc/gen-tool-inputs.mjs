// Writes src/js/config/tool-inputs.json: what each tool's upload box accepts, read
// from the `accept` attribute of the #file-input on its page.
//
// WHY GENERATED: src/js/wrong-file.ts uses it to send a file dropped on the wrong
// tool to the right one (a PNG on JPG to PDF goes to PNG to PDF). Each page already
// says what it takes, in that attribute; a second hand-kept list would drift from
// the pages within a month. src/tests/tool-suggest.test.ts re-reads the pages and
// fails while this file is stale, so after changing a page's `accept`, run:
//
//   node scripts/pkc/gen-tool-inputs.mjs
//
// Tools are listed in catalogue order (the order of src/js/config/tools.ts), which
// is the tie-break when two tools fit a file equally well.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function acceptOf(html) {
  const input = html.match(/<input[^>]*\bid="file-input"[^>]*>/s);
  const accept = input && input[0].match(/\baccept="([^"]*)"/);
  return accept ? accept[1] : null;
}

const config = readFileSync(join(ROOT, 'src/js/config/tools.ts'), 'utf8');
const slugs = [
  ...new Set([...config.matchAll(/'([a-z0-9-]+)\.html'/g)].map((m) => m[1])),
];

const tools = {};
for (const slug of slugs) {
  const page = join(ROOT, 'src/pages', `${slug}.html`);
  if (!existsSync(page)) continue;
  const accept = acceptOf(readFileSync(page, 'utf8'));
  if (accept) tools[slug] = accept;
}

const out = join(ROOT, 'src/js/config/tool-inputs.json');
writeFileSync(out, `${JSON.stringify({ tools }, null, 2)}\n`);
console.log(
  `${Object.keys(tools).length} tools -> src/js/config/tool-inputs.json`
);
