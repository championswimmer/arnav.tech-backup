#!/usr/bin/env node
/**
 * scrape-pending.js
 *
 * Downloads the 3 pending articles that aren't in hashnode-backups yet,
 * using Hashnode's native /<slug>.md endpoint (returns clean markdown).
 * Then downloads all embedded images locally and rewrites paths.
 *
 * Usage:  node scripts/scrape-pending.js
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');
const { URL } = require('url');

const REPO_ROOT    = path.join(__dirname, '..');
const ARTICLES_DIR = path.join(REPO_ROOT, 'articles');
const INDEX_FILE   = path.join(ARTICLES_DIR, 'index.json');

// ── HTTP helpers (shared with import-backups) ────────────────────────────────

const CONTENT_TYPE_EXT = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/jpg': '.jpg',
  'image/gif': '.gif', 'image/svg+xml': '.svg', 'image/webp': '.webp',
};

function httpGet(rawUrl, opts = {}, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const protocol = rawUrl.startsWith('https') ? https : http;
    const req = protocol.get(rawUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ArnavTechBackup/1.0)', ...opts.headers },
    }, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode)) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
        return httpGet(res.headers.location, opts, redirectsLeft - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} for ${rawUrl}`)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ body: Buffer.concat(chunks), headers: res.headers }));
    });
    req.setTimeout(30_000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

function downloadImage(rawUrl, destBase, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const protocol = rawUrl.startsWith('https') ? https : http;
    const req = protocol.get(rawUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ArnavTechBackup/1.0)', Accept: 'image/*,*/*' },
    }, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode)) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
        return downloadImage(res.headers.location, destBase, redirectsLeft - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const ct  = (res.headers['content-type'] || '').split(';')[0].trim();
      const ext = !path.extname(destBase) ? (CONTENT_TYPE_EXT[ct] || '.bin') : '';
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

function guessFilename(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.hostname === 'pbs.twimg.com') {
      return `${path.basename(u.pathname)}.${u.searchParams.get('format') || 'jpg'}`;
    }
    const base = path.basename(u.pathname);
    return base || `img-${Date.now()}`;
  } catch { return `img-${Date.now()}`; }
}

// ── Image extraction ─────────────────────────────────────────────────────────

function extractImageUrls(content) {
  const seen = new Set();
  const results = [];
  const re = /!\[([^\]]*)\]\(([^)\s"]+)(?:\s+[^)]+)?\)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const url = m[2];
    if (!seen.has(url) && /^https?:\/\//.test(url)) { seen.add(url); results.push(url); }
  }
  return results;
}

// ── Per-article processing ───────────────────────────────────────────────────

async function processArticle(article) {
  const mdUrl  = article.url + '.md';
  console.log(`\n📄 ${article.slug}`);
  console.log(`   Fetching ${mdUrl}`);

  let raw;
  try {
    const { body } = await httpGet(mdUrl);
    raw = body.toString('utf8');
  } catch (err) {
    console.error(`   ✗ Could not fetch markdown: ${err.message}`);
    return false;
  }

  // Prepare dirs
  const articleDir = path.join(ARTICLES_DIR, article.slug);
  const imagesDir  = path.join(articleDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });

  // Collect images (body + cover in frontmatter)
  const bodyImages = extractImageUrls(raw);
  const coverMatch = raw.match(/^cover:\s*(https?:\/\/[^\n]+)/m);
  const allUrls    = coverMatch
    ? [...new Set([coverMatch[1].trim(), ...bodyImages])]
    : bodyImages;

  console.log(`   ${allUrls.length} image(s) to download`);

  const urlMap = new Map();
  for (const imgUrl of allUrls) {
    const filename = guessFilename(imgUrl);
    const destBase = path.join(imagesDir, filename);

    // Idempotent: skip already downloaded
    const existing = [destBase, ...Object.values(CONTENT_TYPE_EXT).map(e => destBase + e)]
      .find(p => fs.existsSync(p));
    if (existing) {
      urlMap.set(imgUrl, `./images/${path.basename(existing)}`);
      console.log(`   (cached) ${path.basename(existing)}`);
      continue;
    }

    try {
      const saved = await downloadImage(imgUrl, destBase);
      urlMap.set(imgUrl, `./images/${path.basename(saved)}`);
      console.log(`   ✓ ${path.basename(saved)}`);
    } catch (err) {
      console.error(`   ✗ ${imgUrl.slice(0,80)} → ${err.message}`);
      urlMap.set(imgUrl, imgUrl);
    }
  }

  // Rewrite markdown
  let out = raw;
  // Inline images — strip any trailing align="..." or title attributes inside parens
  out = out.replace(
    /!\[([^\]]*)\]\(([^)\s"]+)(?:\s+[^)]+)?\)/g,
    (_, alt, url) => `![${alt}](${urlMap.get(url) ?? url})`
  );
  // Cover in frontmatter
  if (coverMatch) {
    const local = urlMap.get(coverMatch[1].trim());
    if (local) out = out.replace(/^(cover:\s*)https?:\/\/[^\n]+/m, `$1${local}`);
  }

  fs.writeFileSync(path.join(articleDir, 'index.md'), out);

  article.backup_status = 'done';
  article.backed_up_at  = new Date().toISOString();
  article.backup_file   = `articles/${article.slug}/index.md`;
  console.log(`   ✅ Written → ${article.backup_file}`);
  return true;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const indexData = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  const pending   = indexData.articles.filter(a => a.backup_status === 'pending');

  if (pending.length === 0) {
    console.log('✅ No pending articles — everything already backed up!');
    return;
  }

  console.log(`Found ${pending.length} pending article(s):\n`);
  pending.forEach(a => console.log(`  • ${a.slug}`));

  let successCount = 0;
  for (const article of pending) {
    const ok = await processArticle(article);
    if (ok) successCount++;
    // Small delay between requests to be polite
    await new Promise(r => setTimeout(r, 1500));
  }

  indexData.generated_at = new Date().toISOString();
  fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2));

  const totalDone    = indexData.articles.filter(a => a.backup_status === 'done').length;
  const totalPending = indexData.articles.filter(a => a.backup_status === 'pending').length;

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`✅  Backed up : ${totalDone}/${indexData.total}`);
  if (totalPending > 0) {
    console.log(`⚠   Still pending: ${totalPending}`);
    indexData.articles.filter(a => a.backup_status === 'pending')
      .forEach(a => console.log(`     • ${a.slug}`));
  } else {
    console.log(`🎉  All ${indexData.total} articles fully backed up!`);
  }
  console.log(`📋  index.json updated`);
}

main().catch(err => { console.error(err); process.exit(1); });
