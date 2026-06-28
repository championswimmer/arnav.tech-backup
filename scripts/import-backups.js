#!/usr/bin/env node
/**
 * import-backups.js
 *
 * Imports markdown articles from championswimmer/hashnode-backups,
 * downloads all embedded images locally, rewrites image paths,
 * and updates articles/index.json.
 *
 * Usage:
 *   node scripts/import-backups.js [--backups-dir <path>]
 *
 * Default backups dir: /tmp/pi-github-repos/championswimmer/hashnode-backups
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// ── Config ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flagIdx = args.indexOf('--backups-dir');
const BACKUPS_DIR = flagIdx !== -1
  ? args[flagIdx + 1]
  : '/tmp/pi-github-repos/championswimmer/hashnode-backups';

const REPO_ROOT    = path.join(__dirname, '..');
const ARTICLES_DIR = path.join(REPO_ROOT, 'articles');
const INDEX_FILE   = path.join(ARTICLES_DIR, 'index.json');

// ── Slug resolution for old files that have no frontmatter ──────────────────
//    Keys = lowercased + punctuation-stripped title
const OLD_TITLE_SLUG_MAP = {
  'managing libraries and dependencies in android projects with gradle version catalog':
    'managing-libraries-and-dependencies-in-android-projects-with-gradle-version-catalog',
  'creating and publishing visual studio code color themes':
    'creating-and-publishing-visual-studio-code-color-themes',
  'validating github actions workflow files in jetbrains ides':
    'validating-github-actions-workflow-files-in-jetbrains-ides',
  'publishing a kotlin multiplatform project in all platforms win mac linux jvm js with github actions':
    'publishing-a-kotlin-multiplatform-project-in-all-platforms-win-mac-linux-jvm-js-with-github-actions',
};

// ── Slug extraction ──────────────────────────────────────────────────────────

function extractSlugFromFrontmatter(content) {
  const m = content.match(/^---\s*\n[\s\S]*?^slug:\s*(\S+)/m);
  return m ? m[1].trim() : null;
}

function extractSlugFromHeading(content) {
  const m = content.match(/^#{1,2}\s+(.+)$/m);
  if (!m) return null;
  const normalized = m[1]
    .toLowerCase()
    .replace(/[()]/g, '')          // strip parens
    .replace(/[^a-z0-9 ]/g, ' ')  // non-alphanumeric → space
    .replace(/\s+/g, ' ')
    .trim();
  return OLD_TITLE_SLUG_MAP[normalized] || null;
}

function getSlug(content) {
  return extractSlugFromFrontmatter(content) || extractSlugFromHeading(content);
}

// ── Image extraction ─────────────────────────────────────────────────────────

// Matches: ![alt](url) and ![alt](url align="xxx")
// Also handles linked images: [![alt](imgUrl align="x")](linkUrl)
const IMG_REGEX = /!\[([^\]]*)\]\(([^)\s"]+)(?:\s+align="[^"]*")?\)/g;

function extractImageUrls(content) {
  const seen = new Set();
  const results = [];
  let m;
  const re = new RegExp(IMG_REGEX.source, 'g');
  while ((m = re.exec(content)) !== null) {
    const url = m[2];
    if (!seen.has(url) && /^https?:\/\//.test(url)) {
      seen.add(url);
      results.push(url);
    }
  }
  return results;
}

// ── Local filename derivation ────────────────────────────────────────────────

const CONTENT_TYPE_EXT = {
  'image/png':  '.png',
  'image/jpeg': '.jpg',
  'image/jpg':  '.jpg',
  'image/gif':  '.gif',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
};

function guessFilename(rawUrl) {
  try {
    const u = new URL(rawUrl);

    // Twitter images: /media/<id>?format=jpg
    if (u.hostname === 'pbs.twimg.com') {
      const id  = path.basename(u.pathname);
      const fmt = u.searchParams.get('format') || 'jpg';
      return `${id}.${fmt}`;
    }

    const base = path.basename(u.pathname);
    // If it already has an extension, use it
    if (path.extname(base)) return base;
    // Otherwise return base with no extension (will be fixed after download)
    return base;
  } catch {
    return `img-${Date.now()}`;
  }
}

// ── HTTP download (follows up to 5 redirects) ────────────────────────────────

function downloadUrl(rawUrl, destPath, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const protocol = rawUrl.startsWith('https') ? https : http;
    const req = protocol.get(rawUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ArnavTechBackup/1.0)',
        'Accept': 'image/*,*/*',
      },
    }, (res) => {
      // Follow redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
        const location = res.headers.location;
        res.resume();
        return downloadUrl(location, destPath, redirectsLeft - 1)
          .then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      // Detect extension from Content-Type if dest has none
      const ct       = (res.headers['content-type'] || '').split(';')[0].trim();
      const needsExt = !path.extname(destPath);
      const ext      = needsExt ? (CONTENT_TYPE_EXT[ct] || '.bin') : '';
      const finalDest = destPath + ext;

      const tmp = destPath + '.tmp';
      const out = fs.createWriteStream(tmp);
      res.pipe(out);
      out.on('finish', () => {
        out.close(() => {
          try { fs.renameSync(tmp, finalDest); } catch {}
          resolve(finalDest);
        });
      });
      out.on('error', (e) => {
        try { fs.unlinkSync(tmp); } catch {}
        reject(e);
      });
    });

    req.setTimeout(30_000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

// ── Per-article processing ───────────────────────────────────────────────────

async function processArticle(mdFile, indexData) {
  const raw  = fs.readFileSync(mdFile, 'utf8');
  const slug = getSlug(raw);

  if (!slug) {
    console.error(`  ⚠  Could not determine slug for ${path.basename(mdFile)} — skipping`);
    return;
  }

  const article = indexData.articles.find(a => a.slug === slug);
  if (!article) {
    console.error(`  ⚠  Slug "${slug}" not in index.json — skipping`);
    return;
  }

  console.log(`\n📄 ${slug}`);

  // Prepare directories
  const articleDir = path.join(ARTICLES_DIR, slug);
  const imagesDir  = path.join(articleDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });

  // Collect all image URLs (body images + cover from frontmatter)
  const bodyImages = extractImageUrls(raw);
  const coverMatch = raw.match(/^cover:\s*(https?:\/\/[^\n]+)/m);
  const allUrls    = coverMatch
    ? [...new Set([coverMatch[1].trim(), ...bodyImages])]
    : bodyImages;

  // Download every image and build url → local-path map
  const urlMap = new Map(); // url → relative local path (./images/filename)

  for (const imgUrl of allUrls) {
    const filename = guessFilename(imgUrl);
    const destBase = path.join(imagesDir, filename);

    // Skip if already downloaded (re-runs are idempotent)
    const existing = [destBase, ...Object.values(CONTENT_TYPE_EXT).map(e => destBase + e)]
      .find(p => fs.existsSync(p));
    if (existing) {
      urlMap.set(imgUrl, `./images/${path.basename(existing)}`);
      console.log(`     (cached) ${path.basename(existing)}`);
      continue;
    }

    try {
      const saved = await downloadUrl(imgUrl, destBase);
      const local = `./images/${path.basename(saved)}`;
      urlMap.set(imgUrl, local);
      console.log(`  ✓  ${path.basename(saved)}`);
    } catch (err) {
      console.error(`  ✗  ${imgUrl.slice(0, 80)} → ${err.message}`);
      urlMap.set(imgUrl, imgUrl); // keep original URL on failure
    }
  }

  // Rewrite markdown ───────────────────────────────────────────────────────
  let out = raw;

  // 1. Rewrite inline images, stripping align="..." attribute
  out = out.replace(
    /!\[([^\]]*)\]\(([^)\s"]+)(?:\s+align="[^"]*")?\)/g,
    (_, alt, url) => `![${alt}](${urlMap.get(url) ?? url})`
  );

  // 2. Rewrite cover: in frontmatter
  if (coverMatch) {
    const local = urlMap.get(coverMatch[1].trim());
    if (local) {
      out = out.replace(
        /^(cover:\s*)https?:\/\/[^\n]+/m,
        `$1${local}`
      );
    }
  }

  // Write the processed markdown
  const outputPath = path.join(articleDir, 'index.md');
  fs.writeFileSync(outputPath, out);

  // Update index entry
  article.backup_status = 'done';
  article.backed_up_at  = new Date().toISOString();
  article.backup_file   = `articles/${slug}/index.md`;

  console.log(`  ✅  → ${article.backup_file}  (${allUrls.length} images)`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    console.error(`Backups dir not found: ${BACKUPS_DIR}`);
    process.exit(1);
  }

  const indexData = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));

  const mdFiles = fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.endsWith('.md'))
    .sort()
    .map(f => path.join(BACKUPS_DIR, f));

  console.log(`Found ${mdFiles.length} backup markdown files in ${BACKUPS_DIR}\n`);

  for (const mdFile of mdFiles) {
    await processArticle(mdFile, indexData);
  }

  // Save updated index
  indexData.generated_at = new Date().toISOString();
  fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2));

  const done    = indexData.articles.filter(a => a.backup_status === 'done').length;
  const pending = indexData.articles.filter(a => a.backup_status === 'pending').length;

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`✅  Backed up : ${done}/${indexData.total}`);
  if (pending > 0) {
    console.log(`⏳  Still pending (not in hashnode-backups repo):`);
    indexData.articles
      .filter(a => a.backup_status === 'pending')
      .forEach(a => console.log(`     • ${a.slug}`));
  }
  console.log(`📋  index.json updated`);
}

main().catch(err => { console.error(err); process.exit(1); });
