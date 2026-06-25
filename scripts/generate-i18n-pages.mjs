import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.resolve(__dirname, '../dist');
const LOCALES_DIR = path.resolve(__dirname, '../public/locales');
const SITE_URL = (process.env.SITE_URL || 'https://www.bentopdf.com').replace(
  /\/+$/,
  ''
);
const BASE_PATH = (process.env.BASE_URL || '/').replace(/\/$/, '');

const languages = fs.readdirSync(LOCALES_DIR).filter((file) => {
  return fs.statSync(path.join(LOCALES_DIR, file)).isDirectory();
});

const toCamelCase = (str) => {
  return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
};

const KEY_MAPPING = {
  index: 'home',
  404: 'notFound',
};

function loadAllTranslations() {
  const translations = {};
  for (const lang of languages) {
    if (lang === 'en') continue;
    const commonPath = path.join(LOCALES_DIR, `${lang}/common.json`);
    const toolsPath = path.join(LOCALES_DIR, `${lang}/tools.json`);
    translations[lang] = {
      common: fs.existsSync(commonPath)
        ? JSON.parse(fs.readFileSync(commonPath, 'utf-8'))
        : {},
      tools: fs.existsSync(toolsPath)
        ? JSON.parse(fs.readFileSync(toolsPath, 'utf-8'))
        : {},
    };
  }
  return translations;
}

function loadEnglishTools() {
  const toolsPath = path.join(LOCALES_DIR, 'en/tools.json');
  if (!fs.existsSync(toolsPath)) return {};
  return JSON.parse(fs.readFileSync(toolsPath, 'utf-8'));
}

const ENGLISH_TOOLS = loadEnglishTools();

// TODO@ALAM: Let users build only a single language
function buildUrl(langPrefix, pagePath) {
  const parts = [SITE_URL];
  if (BASE_PATH && BASE_PATH !== '') parts.push(BASE_PATH.replace(/^\//, ''));
  if (langPrefix) parts.push(langPrefix);
  if (pagePath) parts.push(pagePath.replace(/^\//, ''));
  return parts.filter(Boolean).join('/').replace(/\/+$/, '') || SITE_URL;
}

const ORGANIZATION_LD_MARKER = 'data-bentopdf-organization';

function injectOrganizationLd() {
  // PKC: intentionally a no-op. Upstream BentoPDF injected an Organization
  // schema with BentoPDF social links here; we don't want that branding.
}

const BREADCRUMB_MARKER = 'data-bentopdf-breadcrumb';

function injectToolBreadcrumb(document, lang, toolName, toolUrl) {
  if (document.querySelector(`[${BREADCRUMB_MARKER}]`)) return;

  const homeUrl = buildUrl(lang === 'en' ? '' : lang, '');

  // PKC: a consistent page-level tool header — "← Back to Tools" plus the
  // "pdf-tools › <Tool>" breadcrumb — inserted right after the privacy banner
  // on EVERY tool page (including the full-screen builders that have no card),
  // left-aligned to the content shell. Replaces the old in-card breadcrumb;
  // the old in-card #back-to-tools button is hidden via CSS.
  const header = document.createElement('div');
  header.className = 'pkc-tool-header';
  header.setAttribute(BREADCRUMB_MARKER, '');

  const back = document.createElement('a');
  back.href = homeUrl;
  back.className = 'pkc-back-link';
  const backArrow = document.createElement('span');
  backArrow.setAttribute('aria-hidden', 'true');
  backArrow.textContent = '←';
  back.appendChild(backArrow);
  back.appendChild(document.createTextNode(' Back to Tools'));

  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Breadcrumb');
  nav.className = 'pkc-crumb';

  const homeLink = document.createElement('a');
  homeLink.href = homeUrl;
  homeLink.textContent = 'pdf-tools';

  const sep = document.createElement('span');
  sep.setAttribute('aria-hidden', 'true');
  sep.className = 'pkc-crumb-sep';
  sep.textContent = '›';

  const current = document.createElement('span');
  current.setAttribute('aria-current', 'page');
  current.textContent = toolName;

  nav.appendChild(homeLink);
  nav.appendChild(sep);
  nav.appendChild(current);

  header.appendChild(back);
  header.appendChild(nav);

  // Lay the header out to the LEFT of the privacy banner on the same row
  // (banner stays centered in the shell, header fills the left gap, both
  // vertically centered). Falls back to a bare header if the banner is absent.
  const banner = document.querySelector('.pkc-love-note');
  if (banner && banner.parentNode) {
    const intro = document.createElement('div');
    intro.className = 'pkc-tool-intro pkc-shell';
    banner.parentNode.insertBefore(intro, banner);
    intro.appendChild(header); // left column
    intro.appendChild(banner); // centered column
  } else {
    header.classList.add('pkc-shell');
    document.body.insertBefore(header, document.body.firstChild);
  }

  // AGPL-3.0 source offer lives in the page FOOTER. Standard tool pages render
  // it from the footer-simple partial; the full-screen builders have no
  // {{> footer}}, so inject the footer here when one isn't already present.
  if (!document.querySelector('.pkc-tool-footer')) {
    const footer = document.createElement('footer');
    footer.className = 'pkc-tool-footer';
    const p = document.createElement('p');
    p.appendChild(
      document.createTextNode('Free, private, in-browser PDF tools · ')
    );
    const src = document.createElement('a');
    src.href = 'https://github.com/prashantkg96/bentopdf-pkc';
    src.target = '_blank';
    src.rel = 'noopener';
    src.textContent = 'Source (AGPL-3.0)';
    p.appendChild(src);
    footer.appendChild(p);
    document.body.appendChild(footer);
  }

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'pdf-tools',
        item: homeUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: toolName,
        item: toolUrl,
      },
    ],
  };

  const script = document.createElement('script');
  script.setAttribute('type', 'application/ld+json');
  script.setAttribute(BREADCRUMB_MARKER, '');
  script.textContent = JSON.stringify(ld, null, 2);
  document.body.appendChild(script);
}

function resolveToolName(translationKey, langTools) {
  const langEntry = langTools && langTools[translationKey];
  if (langEntry && langEntry.name) return langEntry.name;
  const enEntry = ENGLISH_TOOLS[translationKey];
  return enEntry && enEntry.name ? enEntry.name : null;
}

function processFileForLanguage(
  originalContent,
  file,
  lang,
  translations,
  langDir
) {
  const filenameNoExt = file.replace('.html', '');
  let translationKey = toCamelCase(filenameNoExt);
  if (KEY_MAPPING[filenameNoExt]) {
    translationKey = KEY_MAPPING[filenameNoExt];
  }

  const { tools } = translations[lang];
  const dom = new JSDOM(originalContent);
  const document = dom.window.document;

  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

  let title = null;
  let description = null;

  if (tools[translationKey]) {
    title =
      tools[translationKey].pageTitle ||
      (tools[translationKey].name
        ? `${tools[translationKey].name} - PKC PDF Tools`
        : null);
    description = tools[translationKey].subtitle;
  }

  if (title) {
    document.title = title;
    const metaTitle = document.querySelector('meta[property="og:title"]');
    if (metaTitle) metaTitle.content = title;
    const metaTwitterTitle = document.querySelector(
      'meta[name="twitter:title"]'
    );
    if (metaTwitterTitle) metaTwitterTitle.content = title;
  }

  if (description) {
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.content = description;
    const metaOgDesc = document.querySelector(
      'meta[property="og:description"]'
    );
    if (metaOgDesc) metaOgDesc.content = description;
    const metaTwitterDesc = document.querySelector(
      'meta[name="twitter:description"]'
    );
    if (metaTwitterDesc) metaTwitterDesc.content = description;
  }

  document
    .querySelectorAll('link[rel="alternate"][hreflang]')
    .forEach((el) => el.remove());

  const pagePath = filenameNoExt === 'index' ? '' : filenameNoExt;

  languages.forEach((l) => {
    const link = document.createElement('link');
    link.rel = 'alternate';
    link.hreflang = l;
    link.href = buildUrl(l === 'en' ? '' : l, pagePath);
    document.head.appendChild(link);
  });

  const defaultLink = document.createElement('link');
  defaultLink.rel = 'alternate';
  defaultLink.hreflang = 'x-default';
  defaultLink.href = buildUrl('', pagePath);
  document.head.appendChild(defaultLink);

  const localizedUrl = buildUrl(lang, pagePath);
  const canonicalUrl = buildUrl('', pagePath);
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = canonicalUrl;

  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.content = localizedUrl;
  const twitterUrl = document.querySelector('meta[name="twitter:url"]');
  if (twitterUrl) twitterUrl.content = localizedUrl;

  injectOrganizationLd(document);

  const localizedToolName = resolveToolName(translationKey, tools);
  if (localizedToolName) {
    injectToolBreadcrumb(document, lang, localizedToolName, localizedUrl);
  }

  const links = document.querySelectorAll('a[href]');
  links.forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) return;

    if (
      href.startsWith('http') ||
      href.startsWith('//') ||
      href.startsWith('#') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('javascript:') ||
      href.startsWith('data:') ||
      href.startsWith('vbscript:')
    ) {
      return;
    }

    if (href.startsWith('/assets/') || href.includes('/assets/')) return;

    const langPrefixRegex = new RegExp(
      `^(${BASE_PATH})?/(${languages.join('|')})(/|$)`
    );
    if (langPrefixRegex.test(href)) return;

    let newHref;
    if (href.startsWith('/')) {
      const pathWithoutBase = href.startsWith(BASE_PATH)
        ? href.slice(BASE_PATH.length)
        : href;
      newHref = `${BASE_PATH}/${lang}${pathWithoutBase}`;
    } else {
      newHref = `${BASE_PATH}/${lang}/${href}`;
    }

    link.setAttribute('href', newHref);
  });

  const result = dom.serialize();

  dom.window.close();

  fs.writeFileSync(path.join(langDir, file), result);
}

function updateEnglishFile(filePath, originalContent) {
  const filenameNoExt = path.basename(filePath, '.html');
  const dom = new JSDOM(originalContent);
  const document = dom.window.document;

  document
    .querySelectorAll('link[rel="alternate"][hreflang]')
    .forEach((el) => el.remove());

  const pagePath = filenameNoExt === 'index' ? '' : filenameNoExt;
  const canonicalUrl = buildUrl('', pagePath);

  languages.forEach((l) => {
    const link = document.createElement('link');
    link.rel = 'alternate';
    link.hreflang = l;
    link.href = buildUrl(l === 'en' ? '' : l, pagePath);
    document.head.appendChild(link);
  });

  const defaultLink = document.createElement('link');
  defaultLink.rel = 'alternate';
  defaultLink.hreflang = 'x-default';
  defaultLink.href = canonicalUrl;
  document.head.appendChild(defaultLink);

  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = canonicalUrl;

  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.content = canonicalUrl;
  const twitterUrl = document.querySelector('meta[name="twitter:url"]');
  if (twitterUrl) twitterUrl.content = canonicalUrl;

  injectOrganizationLd(document);

  const enTranslationKey =
    KEY_MAPPING[filenameNoExt] || toCamelCase(filenameNoExt);
  const enToolName = resolveToolName(enTranslationKey, ENGLISH_TOOLS);
  if (enToolName) {
    injectToolBreadcrumb(document, 'en', enToolName, canonicalUrl);
  }

  const result = dom.serialize();

  dom.window.close();

  fs.writeFileSync(filePath, result);
}

async function generateI18nPages() {
  console.log('🌍 Generating i18n pages...');
  console.log(`   SITE_URL: ${SITE_URL}`);
  console.log(`   BASE_PATH: ${BASE_PATH || '/'}`);
  console.log(`   Languages: ${languages.length} (${languages.join(', ')})`);

  if (!fs.existsSync(DIST_DIR)) {
    console.error('❌ dist directory not found. Please run build first.');
    process.exit(1);
  }

  console.log('   Loading translations...');
  const translations = loadAllTranslations();

  const htmlFiles = fs
    .readdirSync(DIST_DIR)
    .filter((file) => file.endsWith('.html'));

  console.log(`   Processing ${htmlFiles.length} HTML files...`);

  for (const lang of languages) {
    if (lang === 'en') continue;
    const langDir = path.join(DIST_DIR, lang);
    if (!fs.existsSync(langDir)) {
      fs.mkdirSync(langDir, { recursive: true });
    }
  }

  let processed = 0;
  const total = htmlFiles.length * (languages.length - 1);

  for (const file of htmlFiles) {
    const filePath = path.join(DIST_DIR, file);
    const originalContent = fs.readFileSync(filePath, 'utf-8');

    for (const lang of languages) {
      if (lang === 'en') continue;

      const langDir = path.join(DIST_DIR, lang);

      processFileForLanguage(
        originalContent,
        file,
        lang,
        translations,
        langDir
      );

      processed++;
      if (processed % 10 === 0 || processed === total) {
        console.log(`   Progress: ${processed}/${total} pages`);
      }

      // Clean up JSDOM instances
      await new Promise((resolve) => setImmediate(resolve));
    }

    updateEnglishFile(filePath, originalContent);
  }

  console.log('✅ i18n pages generated successfully!');
}

generateI18nPages().catch((err) => {
  console.error('❌ i18n page generation failed:', err);
  process.exit(1);
});
