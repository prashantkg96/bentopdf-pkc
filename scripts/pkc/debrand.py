"""Rewrite BentoPDF branding to PKC PDF Tools across the repo.

Run after porting anything from upstream:

    python scripts/pkc/debrand.py            # report only
    python scripts/pkc/debrand.py --write    # apply

What it does NOT touch, deliberately:

  * LICENSE and the AGPL-3.0 copyright notices. Upstream holds copyright on
    this code; stripping those notices would breach the licence. Attribution
    stays in LICENSE, README.md and NOTICE-style prose.
  * package-lock.json, node_modules, vendor tarballs, graphify-out, and the
    vendored pdf.js viewers — generated or third-party.
  * npm package names (@bentopdf/pymupdf-wasm, bentopdf-viewer, ...) and the
    fork's own repo/worker names (bentopdf-pkc, bentopdf-wasm-proxy), which
    are identifiers, not branding.
"""

import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

SITE = 'https://prashantkumarchandra.in/toolkits/pdf-tools'
FORK_REPO = 'https://github.com/prashantkg96/bentopdf-pkc'

# The fork's own repo name CONTAINS "bentopdf". protect() runs once, BEFORE
# the rules, so a FORK_REPO that a URL rule *inserts* afterwards is not
# protected -- and the prose rule that rewrites the brand word then chewed the
# freshly inserted repo name into a URL for a repository that does not exist.
# That bug shipped to production in 69 places, including the homepage credit to
# upstream, which became a dead link thanking this project's own team.
#
# So the rules emit this token instead, and convert() swaps in the real URL at
# the very end, after every prose rule has already run.
FORK_REPO_TOKEN = chr(0) + 'FORKREPO' + chr(0)
BRAND = 'PKC PDF Tools'

SKIP_DIRS = {
    '.git', 'node_modules', 'dist', 'coverage', 'graphify-out', 'vendor',
    'bentopdf-airgap-bundle',
}
SKIP_PATHS = {
    'package-lock.json',
    'public/coherentpdf.browser.min.js',
    'signatures/cla.json',
    # Attribution and provenance. AGPL-3.0 requires upstream's copyright and
    # licence notices to survive, and these documents exist precisely to say
    # what this fork is a fork OF — rewriting "BentoPDF" here turns the credit
    # into nonsense ("a modified fork of PKC PDF Tools"). None of it ships in
    # the built site.
    'LICENSE',
    'README.md',
    'FORK-LOG.md',
    'CLAUDE.md',
    # The shipped homepage carries the ONE user-visible credit to upstream —
    # "Built on the open-source BentoPDF project — special thanks to the
    # BentoPDF team", linking github.com/alam00000/bentopdf. A previous run of
    # this script rewrote it into "special thanks to the PKC PDF Tools team"
    # pointing at a repo that does not exist: self-congratulation where a credit
    # used to be. It is deliberate, it stays, and it is why this file is listed.
    'simple-index.html',
}
SKIP_DOC_PREFIXES = ('scripts/pkc/',)
SKIP_PREFIXES = ('public/pdfjs-viewer/', 'public/pdfjs-annotation-viewer/')

TEXT_EXT = {
    '.html', '.md', '.ts', '.js', '.mjs', '.cjs', '.json', '.css', '.yml',
    '.yaml', '.toml', '.sh', '.conf', '.txt', '.xml', '.htaccess', '.mts',
}

# Identifiers that must survive verbatim: npm packages, the fork's own repo and
# Workers, and the storage/cache keys whose values are load-bearing at runtime.
PROTECTED = [
    '@bentopdf/pymupdf-wasm',
    '@bentopdf/gs-wasm',
    'bentopdf-viewer',
    'bentopdf-pdfium',
    'bentopdf-pkc',
    'bentopdf-wasm-proxy',
    'bentopdf-cors-proxy',
    # Upstream's namespace. Everything under alam00000/ names something that
    # actually exists and belongs to someone else -- their repo, their ghcr
    # images. Renaming any of it invented artifacts that do not exist
    # (ghcr.io/alam00000/pkc-pdf-tools and friends). Factual references to
    # upstream stay factual; the shipped site's own branding is handled by
    # the prose rules, and the one deliberate credit lives in a SKIP_PATHS
    # file.
    'alam00000/bentopdf',
    'bentopdf-gs-wasm',
    'bentopdf-pymupdf-wasm',
    # Load-bearing runtime keys. Renaming these is a silent data migration:
    # the service worker purges old caches by this exact prefix, and the two
    # storage keys hold user state (downloaded fonts, WASM provider choice)
    # that would be orphaned rather than migrated.
    "startsWith('bentopdf-')",
    "'bentopdf-pkc-v",
    "'bentopdf-' prefix",
    'bentopdf-v*',
    'bentopdf-fonts',
    'bentopdf:wasm-providers',
]

# Ordered: URLs first (they contain the brand name), then prose.
RULES = [
    # Outbound links to upstream's site and socials become our own site.
    (re.compile(r'https://www\.bentopdf\.com/sitemap\.xml'), SITE + '/sitemap.xml'),
    (re.compile(r'https://www\.bentopdf\.com/funding\.json'), SITE + '/funding.json'),
    (re.compile(r'https://(?:www\.)?bentopdf\.com/docs/?'), SITE + '/docs/'),
    (re.compile(r'https://(?:www\.)?bentopdf\.com/licensing\.html'), SITE + '/licensing'),
    (re.compile(r'https://(?:www\.)?bentopdf\.com/images/[a-zA-Z0-9._-]+'), SITE + '/assets/favicon.svg'),
    (re.compile(r'https://(?:www\.)?bentopdf\.com'), SITE),
    (re.compile(r'https://wasm\.bentopdf\.com/'), 'https://wasm.example.com/'),
    (re.compile(r'https://x\.com/BentoPDF'), FORK_REPO_TOKEN),
    (re.compile(r'https://www\.linkedin\.com/company/bentopdf/?'), FORK_REPO_TOKEN),
    (re.compile(r'https://www\.instagram\.com/thebentopdf/?'), FORK_REPO_TOKEN),
    (re.compile(r'https://hub\.docker\.com/r/bentopdfteam/bentopdf/?'), FORK_REPO_TOKEN),
    (re.compile(r'@BentoPDF\b'), '@pkcpdftools'),
    # Prose / identifiers.
    (re.compile(r'\bBento PDF\b'), BRAND),
    (re.compile(r'\bBentoPDF\b'), BRAND),
    (re.compile(r'\bBentoPdf\b'), BRAND),
    (re.compile(r'\bBentopdf\b'), BRAND),
    (re.compile(r'\bbentoPdf\b'), 'pkcPdfTools'),
    (re.compile(r'data-bentopdf-'), 'data-pkc-'),
    (re.compile(r'\bbentopdf\b'), 'pkc-pdf-tools'),
]


def protect(text):
    holes = {}
    for i, token in enumerate(PROTECTED):
        key = '\x00P%d\x00' % i
        if token in text:
            text = text.replace(token, key)
            holes[key] = token
    return text, holes


def restore(text, holes):
    for key, token in holes.items():
        text = text.replace(key, token)
    return text


def convert(text):
    text, holes = protect(text)
    for pattern, repl in RULES:
        text = pattern.sub(repl, text)
    text = restore(text, holes)
    # Last, so no prose rule can touch the repo name it contains.
    return text.replace(FORK_REPO_TOKEN, FORK_REPO)


def walk():
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            full = os.path.join(base, name)
            rel = os.path.relpath(full, ROOT).replace(os.sep, '/')
            if (rel in SKIP_PATHS or rel.startswith(SKIP_PREFIXES)
                    or rel.startswith(SKIP_DOC_PREFIXES)):
                continue
            ext = os.path.splitext(name)[1].lower()
            if ext not in TEXT_EXT and name not in ('.htaccess', '.env.example'):
                continue
            yield full, rel


def main(write):
    changed = 0
    for full, rel in walk():
        try:
            src = io.open(full, encoding='utf-8', newline='').read()
        except (UnicodeDecodeError, OSError):
            continue
        if 'bentopdf' not in src.lower():
            continue
        out = convert(src)
        if out == src:
            continue
        changed += 1
        if write:
            io.open(full, 'w', encoding='utf-8', newline='').write(out)
        left = len(re.findall(r'bentopdf', out, re.I))
        print('%-52s %s%s' % (rel, 'rewritten' if write else 'would rewrite',
                              (' (%d protected refs left)' % left) if left else ''))
    print('\n%d file(s) %s' % (changed, 'rewritten' if write else 'would change'))


if __name__ == '__main__':
    main('--write' in sys.argv)
