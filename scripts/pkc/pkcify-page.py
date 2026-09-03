"""Convert an upstream BentoPDF src/pages/*.html into this fork's PKC form.

Used when porting a tool page across from `upstream/main`. It applies exactly
the transformations the fork already made by hand to every other tool page:

  1. theme bootstrap script (data-theme / data-glass) as the first thing in head
  2. BentoPDF -> PKC PDF Tools in every user-visible string and meta value
  3. www.bentopdf.com -> prashantkumarchandra.in/toolkits/pdf-tools
  4. drop og:image / twitter:image / twitter:site (we ship no BentoPDF artwork)
  5. drop the BentoPDF favicon + webmanifest block, use the PKC favicon
  6. wrap the body between {{> navbar }} and {{> footer }} in <main class="pkc-shell">
  7. phosphor upload icon -> lucide, matching the rest of the fork

Run `npx prettier --write` on the output afterwards; indentation is left to it.

Usage: python scripts/pkc/pkcify-page.py <file.html> [...]
"""

import io
import re
import sys

SITE = 'https://prashantkumarchandra.in/toolkits/pdf-tools'

THEME_BOOTSTRAP = """    <script>
      // PKC: honor the theme chosen on the main site (shared localStorage key)
      // before paint, so the shared top-pill nav renders in the right theme.
      (function () {
        var t = localStorage.getItem('theme');
        document.documentElement.setAttribute(
          'data-theme',
          t === 'light' ? 'light' : 'dark'
        );
        if (localStorage.getItem('glass') !== 'off') {
          document.documentElement.setAttribute('data-glass', 'on');
        }
      })();
    </script>
"""

PKC_FAVICON = """    <!-- PKC favicon (served same-origin by the pkc-in worker at /assets) -->
    <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
"""


def drop_meta(html, attr, value):
    """Remove a whole <meta ...> tag identified by one attribute value."""
    pat = re.compile(
        r'[ \t]*<meta\b[^>]*?' + re.escape(attr) + r'="' + re.escape(value) + r'"[^>]*?/?>[ \t]*\r?\n',
        re.S,
    )
    return pat.sub('', html)


def pkcify(html):
    nl = '\r\n' if '\r\n' in html else '\n'

    # 1. theme bootstrap, immediately after the charset meta
    if 'data-glass' not in html:
        charset = re.search(r'[ \t]*<meta charset="[^"]*" ?/>[ \t]*\r?\n', html)
        if charset:
            boot = THEME_BOOTSTRAP.replace('\n', nl)
            html = html[: charset.end()] + boot + html[charset.end():]

    # 4. artwork and handles we do not have
    for value in ('og:image', 'og:image:width', 'og:image:height',
                  'twitter:image', 'twitter:image:alt'):
        html = drop_meta(html, 'property', value)
        html = drop_meta(html, 'name', value)
    html = drop_meta(html, 'name', 'twitter:site')
    html = drop_meta(html, 'name', 'twitter:creator')

    # 5. favicon / manifest block -> PKC favicon
    block = re.compile(
        r'[ \t]*<!-- Web App Manifest -->.*?<link rel="icon" href="/favicon\.ico"[^>]*/>[ \t]*\r?\n',
        re.S,
    )
    if block.search(html):
        html = block.sub(PKC_FAVICON.replace('\n', nl), html, count=1)
    else:
        # Fall back to removing the individual tags we know about.
        html = re.sub(r'[ \t]*<link rel="manifest"[^>]*/>[ \t]*\r?\n', '', html)
        html = re.sub(r'[ \t]*<link[^>]*href="/(images/(favicon|apple-touch-icon)[^"]*|favicon\.ico)"[^>]*/?>[ \t]*\r?\n',
                      '', html, flags=re.S)
        if '/assets/favicon.svg' not in html:
            html = html.replace('</head>', PKC_FAVICON.replace('\n', nl) + '  </head>', 1)

    # 3. then 2 — order matters, the URL contains the brand name
    html = html.replace('https://www.bentopdf.com', SITE)
    html = html.replace('https://bentopdf.com', SITE)
    html = re.sub(r'\bBentoPDF\b', 'PKC PDF Tools', html)

    # 6. pkc-shell wrapper
    if 'pkc-shell' not in html:
        # Most tool pages are flat: navbar, content, footer, all siblings of
        # <body>. A few (edit-pdf-text.html) nest {{> footer }} inside the
        # #uploader div and put a full-screen overlay after it, so a blind
        # wrapper would close <main> in the wrong place and produce invalid
        # HTML. Detect that and refuse rather than emit something broken.
        nav_at = html.find('{{> navbar }}')
        foot_at = html.find('{{> footer }}')
        if nav_at == -1 or foot_at == -1:
            raise SystemExit(
                'pkcify: no navbar/footer partial to wrap; place '
                '<main class="pkc-shell"> by hand'
            )
        depth = (html.count('<div', nav_at, foot_at)
                 - html.count('</div>', nav_at, foot_at))
        if depth != 0:
            raise SystemExit(
                'pkcify: {{> footer }} is nested %d <div> level(s) deep inside '
                'the content; wrap this page by hand so </main> closes in the '
                'right place' % depth
            )
        html = html.replace('{{> navbar }}' + nl,
                            '{{> navbar }}' + nl + '    <main class="pkc-shell">' + nl, 1)
        html = html.replace('{{> footer }}' + nl,
                            '    </main>' + nl + '    {{> footer }}' + nl, 1)

    # 8. Upstream's redesigned FAQ block (f404ff0) uses .faq-* classes whose
    #    colours are hardcoded dark. This fork keeps the older inline-Tailwind
    #    markup so the FAQ tracks the theme/glass tokens like everything else.
    html = html.replace('<div class="faq-list">', '<div class="space-y-4">')
    html = html.replace(
        '<details class="faq-d">',
        '<details class="bg-gray-800 p-5 rounded-lg border border-gray-700">',
    )
    html = html.replace(
        '<summary class="faq-d-q">',
        '<summary class="cursor-pointer font-semibold text-white flex items-center justify-between">',
    )
    html = html.replace('<p class="faq-d-a">', '<p class="mt-3 text-gray-400">')
    html = html.replace(
        '<i data-lucide="plus" class="faq-d-icon"></i>',
        '<i data-lucide="chevron-down" class="w-5 h-5"></i>',
    )

    # 9. back-to-tools link uses the fork's indigo pairing
    html = html.replace(
        'text-indigo-300 hover:text-indigo-400 mb-6 font-semibold',
        'text-indigo-400 hover:text-indigo-300 mb-6 font-semibold',
    )

    # 7. phosphor upload icon -> lucide, as everywhere else in the fork
    html = html.replace(
        '<i class="ph ph-upload-simple text-4xl mb-3 text-gray-400"></i>',
        '<i data-lucide="upload-cloud" class="w-10 h-10 mb-3 text-gray-400"></i>',
    )

    return html


def main(paths):
    for path in paths:
        src = io.open(path, encoding='utf-8', newline='').read()
        out = pkcify(src)
        io.open(path, 'w', encoding='utf-8', newline='').write(out)
        print('pkcified %s' % path)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    main(sys.argv[1:])
