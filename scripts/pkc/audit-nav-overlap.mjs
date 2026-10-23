#!/usr/bin/env node
/**
 * Does the shared sticky top pill sit on any tool's controls?
 *
 * Opens every tool page in a real browser, opens a sample file in it, scrolls
 * the page top to bottom, and at every step lists the controls that are under
 * the header — the pills, or the frosted band that fades out below them. It
 * fails on the three kinds the rule in src/css/styles.css forbids (the PKC note
 * on --pkc-nav-clear):
 *
 *   PINNED     a fixed or sticky control under the header. Scrolling cannot
 *              rescue it.
 *   AT-TOP     an in-flow control already under the header at scroll 0.
 *   WORKSPACE  a control inside an embedded viewer (its own scrolling) that
 *              ever passes under the header. Scrolling back up does not rescue
 *              it either: the wheel scrolls the viewer, not the page.
 *
 * Ordinary page content scrolling under the header is how a sticky header
 * works, and is not reported.
 *
 * Usage, after a build (npm run build:deploy, or the manual chain in
 * FORK-LOG.md):
 *
 *   node scripts/pkc/audit-nav-overlap.mjs [--size 1440x900] [--base URL] [tool ...]
 *
 * Without --base it serves ./dist at /toolkits/pdf-tools/ and passes every other
 * path through to production, which is where the shared top pill lives. With
 * --base it audits a deployed copy instead. Sizes may repeat; the default is
 * the three desktop sizes 1440x900, 1366x768 and 1920x1080.
 *
 * Playwright is not a dependency of this repo. Point PLAYWRIGHT_MODULE at an
 * installed copy's index.mjs; on the maintainer's laptop that is
 * D:/Github/PKC_In/pkc_workout/sim/node_modules/playwright/index.mjs, which is
 * the default here.
 *
 * Tools whose workspace needs more than a file dropped on the first input are
 * driven by DRIVE below. A tool that takes a format this script has no sample
 * for is checked before upload only, and says so.
 */
import { createServer } from 'node:http';
import { readFile, stat, readdir } from 'node:fs/promises';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const PLAYWRIGHT =
  process.env.PLAYWRIGHT_MODULE ||
  'D:/Github/PKC_In/pkc_workout/sim/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(PLAYWRIGHT).href);

const ROOT = resolve(import.meta.dirname, '../..');
const PREFIX = '/toolkits/pdf-tools';
const ORIGIN = 'https://prashantkumarchandra.in';

const args = process.argv.slice(2);
const sizes = [];
let base = null;
const only = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--size') sizes.push(args[++i]);
  else if (args[i] === '--base') base = args[++i].replace(/\/$/, '');
  else only.push(args[i]);
}
if (!sizes.length) sizes.push('1440x900', '1366x768', '1920x1080');

// ── Sample files ────────────────────────────────────────────────────────────
const fixtures = mkdtempSync(join(tmpdir(), 'pkc-nav-audit-'));
const fx = (n) => join(fixtures, n);
async function samplePdf(name, pages) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText(`Sample page ${i + 1}`, { x: 60, y: 760, size: 24, font });
    for (let l = 0; l < 20; l++)
      p.drawText(
        `Line ${l + 1}: the quick brown fox jumps over the lazy dog.`,
        {
          x: 60,
          y: 700 - l * 28,
          size: 12,
          font,
        }
      );
  }
  writeFileSync(fx(name), await doc.save());
}
await samplePdf('a.pdf', 3);
await samplePdf('b.pdf', 2);
// 1x1 images; enough to open every image tool's workspace.
writeFileSync(
  fx('a.png'),
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
    'base64'
  )
);
writeFileSync(
  fx('a.jpg'),
  Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
    'base64'
  )
);
writeFileSync(
  fx('a.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="#f60"/></svg>'
);
writeFileSync(fx('a.txt'), 'Hello\nA sample text file.\n'.repeat(20));
writeFileSync(fx('a.md'), '# Title\n\nSome *markdown*.\n');
writeFileSync(fx('a.csv'), 'a,b,c\n1,2,3\n');
writeFileSync(fx('a.json'), '{"a":1,"b":[1,2,3]}');
writeFileSync(fx('a.xml'), '<?xml version="1.0"?><root><a>1</a></root>');

function pickFiles(accept, multiple) {
  const a = (accept || '').toLowerCase();
  if (!a || a.includes('pdf'))
    return multiple ? [fx('a.pdf'), fx('b.pdf')] : [fx('a.pdf')];
  if (a.includes('png') || a.includes('image/*')) return [fx('a.png')];
  if (a.includes('jpeg') || a.includes('jpg')) return [fx('a.jpg')];
  if (a.includes('svg')) return [fx('a.svg')];
  if (a.includes('text/plain') || a.includes('.txt')) return [fx('a.txt')];
  if (a.includes('json')) return [fx('a.json')];
  if (a.includes('.xml')) return [fx('a.xml')];
  if (a.includes('csv')) return [fx('a.csv')];
  if (a.includes('.md') || a.includes('markdown')) return [fx('a.md')];
  return null;
}

// Tools whose workspace needs more than one file on the first input.
const DRIVE = {
  'form-creator': async (page) => {
    await page.click('#blankPdfBtn');
    await page.waitForTimeout(500);
    await page.click('#confirmBlankBtn');
  },
  'compare-pdfs': async (page) => {
    await page.setInputFiles('#file-input-1', fx('a.pdf'));
    await page.waitForTimeout(1500);
    await page.setInputFiles('#file-input-2', fx('b.pdf'));
  },
};

// ── Local server: dist at PREFIX, everything else from production ───────────
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
let server = null;
if (!base) {
  const DIST = join(ROOT, 'dist');
  const fileFor = async (p) => {
    const tries = p.endsWith('/')
      ? [p + 'index.html']
      : [p, p + '.html', p + '/index.html'];
    for (const t of tries) {
      try {
        if ((await stat(join(DIST, t))).isFile()) return join(DIST, t);
      } catch {}
    }
    return null;
  };
  server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith(PREFIX + '/')) {
        const f = await fileFor(
          decodeURIComponent(url.pathname.slice(PREFIX.length))
        );
        if (!f) return res.writeHead(404).end();
        res.writeHead(200, {
          'content-type': TYPES[extname(f)] || 'application/octet-stream',
        });
        return res.end(await readFile(f));
      }
      const up = await fetch(ORIGIN + url.pathname + url.search);
      res.writeHead(up.status, {
        'content-type':
          up.headers.get('content-type') || 'application/octet-stream',
      });
      res.end(Buffer.from(await up.arrayBuffer()));
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  });
  await new Promise((ok) => server.listen(0, ok));
  base = `http://localhost:${server.address().port}${PREFIX}`;
}

// ── In-page scans ───────────────────────────────────────────────────────────
// Every visible control under the header right now.
function scan() {
  const pill = document.querySelector('.top-pills');
  if (!pill) return { noPill: true };
  const pr = pill.getBoundingClientRect();
  // The pills, plus the half-faded top of the band below them. The pill's rect
  // already carries any push (nav-yield.ts moves its sticky top), so this is
  // the header's live reach; pushed fully out, it is <= 0.
  const cut = pr.bottom + 20;
  const sel =
    'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [contenteditable=true], canvas, iframe, h1, h2, h3, label';
  const els = [];
  const walk = (root) => {
    root.querySelectorAll(sel).forEach((e) => els.push(e));
    root
      .querySelectorAll('*')
      .forEach((e) => e.shadowRoot && walk(e.shadowRoot));
  };
  walk(document);
  const parentOf = (a) =>
    a.parentElement ||
    (a.getRootNode() instanceof ShadowRoot ? a.getRootNode().host : null);
  const describe = (e) => {
    let s = e.tagName.toLowerCase();
    if (e.id) s += '#' + e.id;
    const c =
      typeof e.className === 'string'
        ? e.className.trim().split(/\s+/).slice(0, 2).join('.')
        : '';
    if (c) s += '.' + c;
    const t = (e.getAttribute('aria-label') || e.title || e.textContent || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 40);
    return t ? `${s} "${t}"` : s;
  };
  const out = [];
  if (cut <= 2) return { items: out, scrollY: Math.round(scrollY) };
  for (const el of els) {
    if (pill.contains(el) || el.closest('footer')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (r.bottom <= 2 || r.top >= cut || r.right <= 0 || r.left >= innerWidth)
      continue;
    if (
      !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    )
      continue;
    let pinned = null;
    for (let a = el; a && a !== document.documentElement; a = parentOf(a)) {
      const p = getComputedStyle(a).position;
      if (p === 'fixed' || p === 'sticky') {
        pinned = `${p} ${describe(a).split(' "')[0]}`;
        break;
      }
    }
    let workspace = null;
    for (let a = parentOf(el); a && a !== document.body; a = parentOf(a)) {
      if (a.getBoundingClientRect().height < innerHeight * 0.45) continue;
      const cs = getComputedStyle(a);
      if (
        a.shadowRoot ||
        (/(auto|scroll)/.test(cs.overflowY) &&
          a.scrollHeight > a.clientHeight + 20)
      ) {
        workspace = describe(a).split(' "')[0];
        break;
      }
    }
    // Is it painted under the header, or above it (a modal raised over the pill)?
    const y0 = Math.max(r.top, 0),
      y1 = Math.min(r.bottom, cut);
    const x0 = Math.max(r.left, 0),
      x1 = Math.min(r.right, innerWidth);
    // Where the pills are, hit-testing answers it. Outside them only the band lies
    // over the page, and it takes no pointer events, so there the z-index decides:
    // the pill is z-index 1000 at the root, and raised overlays sit at 4000.
    let under = 0,
      above = false,
      sawPill = false;
    for (const fy of [0.25, 0.5, 0.75])
      for (const fx of [0.1, 0.5, 0.9]) {
        const x = x0 + (x1 - x0) * fx,
          y = y0 + (y1 - y0) * fy;
        const stack = document.elementsFromPoint(x, y);
        const iPill = stack.findIndex((n) => n === pill || pill.contains(n));
        let iEl = stack.findIndex((n) => n === el || el.contains(n));
        for (let a = el; iEl < 0 && a; a = parentOf(a)) {
          const k = stack.indexOf(a);
          if (k >= 0 && a !== document.body && a !== document.documentElement)
            iEl = k;
        }
        if (iPill >= 0) {
          sawPill = true;
          if (iEl >= 0 && iEl < iPill) above = true;
          else under++;
        } else under++;
      }
    if (!sawPill) {
      let z = 0;
      for (let a = el; a && a !== document.documentElement; a = parentOf(a)) {
        const cs = getComputedStyle(a);
        if (cs.position !== 'static' && cs.zIndex !== 'auto')
          z = Math.max(z, Number(cs.zIndex));
      }
      above = z > 1000;
    }
    if (under && !above) out.push({ el: describe(el), pinned, workspace });
  }
  return { items: out, scrollY: Math.round(scrollY) };
}

// ── Run ─────────────────────────────────────────────────────────────────────
const tools = only.length
  ? only
  : (await readdir(join(ROOT, 'src/pages')))
      .filter((f) => f.endsWith('.html'))
      .map((f) => basename(f, '.html'));

const browser = await chromium.launch({ channel: 'chromium' });
let failures = 0;
const notes = [];

async function auditTool(tool, W, H) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  const found = new Map();
  try {
    await page.goto(`${base}/${tool}`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForSelector('.top-pills', { timeout: 15000 });
    await page.waitForTimeout(1000);
    for (const phase of ['before', 'after']) {
      if (phase === 'after') {
        if (DRIVE[tool]) await DRIVE[tool](page);
        else {
          const input =
            (await page.$('#file-input')) || (await page.$('input[type=file]'));
          if (!input) break;
          const [accept, multiple] = await input.evaluate((e) => [
            e.accept,
            e.multiple,
          ]);
          const files = pickFiles(accept, multiple);
          if (!files) {
            notes.push(
              `${tool} ${W}x${H}: checked before upload only (no sample for "${accept}")`
            );
            break;
          }
          await input.setInputFiles(files);
        }
        await page.waitForTimeout(7000);
      }
      const maxY = await page.evaluate(
        () => document.documentElement.scrollHeight - innerHeight
      );
      const ys = [0];
      for (let y = 200; y < maxY; y += 200) ys.push(y);
      if (maxY > 0) ys.push(maxY);
      for (const y of ys) {
        await page.evaluate((y) => scrollTo(0, y), y);
        await page.waitForTimeout(150);
        const s = await page.evaluate(scan);
        for (const it of s.items) {
          const kind = it.pinned
            ? 'PINNED'
            : it.workspace
              ? 'WORKSPACE'
              : s.scrollY === 0
                ? 'AT-TOP'
                : null;
          if (!kind) continue;
          const key = `${kind} ${it.el}`;
          if (!found.has(key))
            found.set(
              key,
              `${kind}${it.pinned ? ` (${it.pinned})` : ''}${it.workspace ? ` in ${it.workspace}` : ''}: ${it.el} — ${phase} upload, scrollY ${s.scrollY}`
            );
        }
      }
      await page.evaluate(() => scrollTo(0, 0));
    }
  } catch (e) {
    found.set('error', `ERROR: ${String(e).split('\n')[0]}`);
  }
  await ctx.close();
  if (found.size) {
    failures++;
    console.log(`\n✗ ${tool} at ${W}x${H}`);
    for (const line of found.values()) console.log('   ' + line);
  }
}

for (const size of sizes) {
  const [W, H] = size.split('x').map(Number);
  const queue = [...tools];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (queue.length) await auditTool(queue.shift(), W, H);
    })
  );
  console.log(`\n${size}: ${tools.length} tools checked`);
}
await browser.close();
server?.close();
for (const n of notes) console.log('note: ' + n);
console.log(
  failures
    ? `\n${failures} tool/size pair(s) put a control under the header.`
    : '\nNo tool puts a control under the header.'
);
process.exit(failures ? 1 : 0);
