#!/usr/bin/env node
/**
 * fix-covers.js
 *
 * For articles that have no YAML frontmatter (old hashnode exports + .md-scraped articles):
 *   1. Downloads the cover image from index.json's cover_image URL
 *   2. Prepends proper YAML frontmatter (title, slug, datePublished, cover, tags)
 *
 * For articles that already have frontmatter with a local cover:
 *   1. Verifies the cover file actually exists on disk (sanity check)
 *
 * Usage:  node scripts/fix-covers.js
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');
const { URL } = require('url');

const REPO_ROOT    = path.join(__dirname, '..');
const ARTICLES_DIR = path.join(REPO_ROOT, 'articles');
const INDEX_FILE   = path.join(ARTICLES_DIR, 'index.json');

// ── Download helper ──────────────────────────────────────────────────────────

const CONTENT_TYPE_EXT = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/jpg': '.jpg',
  'image/gif': '.gif', 'image/svg+xml': '.svg', 'image/webp': '.webp',
};

function downloadImage(rawUrl, destBase, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const protocol = rawUrl.startsWith('https') ? https : http;
    const req = protocol.get(rawUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ArnavTechBackup/1.0)', Accept: 'image/*,*/*' },
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
        return downloadImage(res.headers.location, destBase, redirectsLeft - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${rawUrl}`));
      }
      const ct  = (res.headers['content-type'] || '').split(';')[0].trim();
      const ext = !path.extname(destBase) ? (CONTENT_TYPE_EXT[ct] || '.jpg') : '';
      const finalDest = destBase + ext;
      const tmp = destBase + '.tmp';
      const out = fs.createWriteStream(tmp);
      res.pipe(out);
      out.on('finish', () => out.close(() => { fs.renameSync(tmp, finalDest); resolve(finalDest); }));
      out.on('error', e => { try { fs.unlinkSync(tmp); } catch {} reject(e); });
    });
    req.setTimeout(30_000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

// Derive a nice local filename for the cover image
function coverFilename(remoteUrl) {
  try {
    const u    = new URL(remoteUrl);
    const base = path.basename(u.pathname);
    const ext  = path.extname(base);
    // Use the original CDN filename if it has an extension; otherwise just 'cover'
    return ext ? base : 'cover';
  } catch {
    return 'cover';
  }
}

// ── Frontmatter builder ──────────────────────────────────────────────────────

function buildFrontmatter(article, localCoverPath) {
  // Convert tags array to comma-separated (Hashnode style)
  const tags = (article.categories || [])
    .map(t => t.replace(/^#/, '').toLowerCase())   // strip leading # if any
    .join(', ');

  const lines = [
    '---',
    `title: "${article.title.replace(/"/g, '\\"')}"`,
    `slug: ${article.slug}`,
    `datePublished: ${new Date(article.published_at).toUTCString()}`,
  ];
  if (localCoverPath) lines.push(`cover: ${localCoverPath}`);
  if (tags)           lines.push(`tags: ${tags}`);
  lines.push('---', '');
  return lines.join('\n');
}

// ── Per-article processing ───────────────────────────────────────────────────

async function processArticle(article) {
  const mdPath    = path.join(ARTICLES_DIR, article.slug, 'index.md');
  const imagesDir = path.join(ARTICLES_DIR, article.slug, 'images');

  if (!fs.existsSync(mdPath)) {
    console.log(`  ⚠  index.md not found for ${article.slug} — skipping`);
    return;
  }

  const raw = fs.readFileSync(mdPath, 'utf8');
  const hasFrontmatter = raw.startsWith('---');

  // ── Case 1: already has frontmatter ─────────────────────────────────────
  if (hasFrontmatter) {
    const coverMatch = raw.match(/^cover:\s*(\S+)/m);
    if (coverMatch) {
      const localRef  = coverMatch[1];           // e.g. ./images/abc.png
      const fullPath  = path.join(ARTICLES_DIR, article.slug, localRef.replace(/^\.\//, ''));
      if (fs.existsSync(fullPath)) {
        console.log(`  ✓  (already done) ${article.slug}`);
      } else {
        console.log(`  ⚠  cover ref exists in frontmatter but FILE MISSING: ${fullPath}`);
      }
    } else {
      console.log(`  ⚠  has frontmatter but no cover: field — ${article.slug}`);
    }
    return;
  }

  // ── Case 2: no frontmatter — need to download cover + prepend ───────────
  console.log(`\n📄 ${article.slug}`);

  const coverUrl = article.cover_image;
  let localCoverRef = null;

  if (!coverUrl) {
    console.log(`   ⚠  No cover_image in index.json — will add frontmatter without cover`);
  } else {
    const filename = coverFilename(coverUrl);
    const destBase = path.join(imagesDir, filename);
    fs.mkdirSync(imagesDir, { recursive: true });

    // Idempotent: skip if already downloaded
    const existing = [destBase, ...Object.values(CONTENT_TYPE_EXT).map(e => destBase + e)]
      .find(p => fs.existsSync(p));

    if (existing) {
      localCoverRef = `./images/${path.basename(existing)}`;
      console.log(`   (cached) ${path.basename(existing)}`);
    } else {
      try {
        const saved   = await downloadImage(coverUrl, destBase);
        localCoverRef = `./images/${path.basename(saved)}`;
        console.log(`   ✓  ${path.basename(saved)}`);
      } catch (err) {
        console.error(`   ✗  download failed: ${err.message}`);
        localCoverRef = null;
      }
    }
  }

  // Prepend frontmatter to the markdown
  const frontmatter = buildFrontmatter(article, localCoverRef);
  fs.writeFileSync(mdPath, frontmatter + raw);
  console.log(`   ✅  frontmatter prepended (cover: ${localCoverRef ?? 'none'})`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const indexData = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));

  console.log(`Processing ${indexData.articles.length} articles...\n`);

  for (const article of indexData.articles) {
    await processArticle(article);
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log('✅  Done. All articles checked/updated.');
}

main().catch(err => { console.error(err); process.exit(1); });
