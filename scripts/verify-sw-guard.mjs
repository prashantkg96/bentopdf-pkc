// verify-sw-guard.mjs — guards against a regression of the 2026-07-13 fix
// (commit 2eeaacf) for the false "A new version is available" prompt that
// misfired on first-ever visits.
//
// The fix is exactly one condition: the update-available confirm() must only
// fire when the page is ALREADY controlled by a previous instance of this
// app's own service worker (`controller.scriptURL === swUrl`). Without it, a
// first-ever install (where `controller` is null) or a foreign controller
// (the main site's broader-scope /sw.js) can misfire the prompt.
//
// Run standalone: `node scripts/verify-sw-guard.mjs`
// Also wired into deploy.py's verify() step for the pdf-tools target, so a
// deploy fails loudly instead of silently shipping a regression.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TARGET = path.resolve(__dirname, '../src/js/sw-register.ts');
const GUARD = 'controller.scriptURL === swUrl';

const src = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, 'utf8') : null;

if (src === null) {
  console.error(`[verify-sw-guard] FAIL: ${TARGET} not found.`);
  process.exit(1);
}

if (!src.includes(GUARD)) {
  console.error(
    `[verify-sw-guard] FAIL: ${path.relative(process.cwd(), TARGET)} is missing the ` +
      `"${GUARD}" guard on the update-available prompt.\n` +
      '  Without it, a first-ever visit (no prior controller) or a foreign controller ' +
      '(the main site\'s /sw.js) can misfire "A new version is available" on a page ' +
      'that was never actually updated. See commit 2eeaacf for the original fix.'
  );
  process.exit(1);
}

console.log('[verify-sw-guard] OK: update-available guard present.');
