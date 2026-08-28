#!/usr/bin/env node
/* Pulls posts from the Medium RSS feed into content/thoughts/*.md.
   Run: node build/import-medium.js [--force] [--poetry <slug,slug>]

   Medium's feed only exposes the 10 most recent posts and individual article pages
   return 403, so older work has to be pasted in by hand. Existing files are never
   overwritten unless --force is passed. */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const FEED = 'https://medium.com/feed/@nikhils1nha';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const HOLD = String.fromCharCode(0);

const force = process.argv.includes('--force');
const poetryArg = process.argv.indexOf('--poetry');
const forcePoetry = new Set(
  poetryArg > -1 && process.argv[poetryArg + 1] ? process.argv[poetryArg + 1].split(',') : []);

const get = url => new Promise((resolve, reject) => {
  https.get(url, { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } }, res => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume(); return resolve(get(res.headers.location));
    }
    if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode + ' for ' + url)); }
    let b = ''; res.setEncoding('utf8');
    res.on('data', c => b += c);
    res.on('end', () => resolve(b));
  }).on('error', reject);
});

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '...', mdash: '-', ndash: '-' };
const decode = s => s
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENTITIES ? ENTITIES[n.toLowerCase()] : m));

/* escape markdown control characters that appear literally in prose */
const mdEsc = s => s.replace(/([*_`[\]])/g, '\\$1');

function inlineToMd(html) {
  let s = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:span|small|section|div)[^>]*>/gi, '');

  // links are stashed first so their text is not markdown-escaped
  const links = [];
  s = s.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_, href, text) => HOLD + (links.push({ href, text: decode(text.replace(/<[^>]+>/g, '')) }) - 1) + HOLD);

  s = s.replace(/<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>/gi, (_, t) => '**' + decode(t.replace(/<[^>]+>/g, '')) + '**')
       .replace(/<(?:em|i)>([\s\S]*?)<\/(?:em|i)>/gi, (_, t) => '*' + decode(t.replace(/<[^>]+>/g, '')) + '*')
       .replace(/<code>([\s\S]*?)<\/code>/gi, (_, t) => '`' + decode(t.replace(/<[^>]+>/g, '')) + '`');

  s = mdEsc(decode(s.replace(/<[^>]+>/g, '')));
  s = s.replace(/\\\*\\\*/g, '**').replace(/\\\*/g, '*').replace(/\\`/g, '`');

  const re = new RegExp(HOLD + '(\\d+)' + HOLD, 'g');
  return s.replace(re, (_, i) => '[' + links[i].text + '](' + links[i].href + ')').trim();
}

function htmlToMd(html) {
  const out = [];
  const blockRe = /<(h[1-6]|p|blockquote|figure|pre|ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = blockRe.exec(html))) {
    const tag = m[1].toLowerCase(), inner = m[2];

    if (/^h[1-6]$/.test(tag)) {
      const level = Math.min(3, Math.max(2, +tag[1] - 1));   // Medium h3/h4 -> ## / ###
      const t = inlineToMd(inner);
      if (t) out.push('#'.repeat(level) + ' ' + t);
    } else if (tag === 'p') {
      const t = inlineToMd(inner);
      if (t) out.push(t);
    } else if (tag === 'blockquote') {
      const t = inlineToMd(inner.replace(/<\/?p[^>]*>/gi, '\n'));
      if (t) out.push(t.split('\n').filter(Boolean).map(l => '> ' + l).join('\n'));
    } else if (tag === 'figure') {
      const img = inner.match(/<img[^>]*src="([^"]*)"/i);
      const cap = inner.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i);
      if (img) out.push('![' + (cap ? inlineToMd(cap[1]) : '') + '](' + img[1] + ')');
    } else if (tag === 'pre') {
      out.push('```\n' + decode(inner.replace(/<[^>]+>/g, '')) + '\n```');
    } else if (tag === 'ul' || tag === 'ol') {
      const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
        .map((li, i) => (tag === 'ol' ? (i + 1) + '. ' : '- ') + inlineToMd(li[1]));
      if (items.length) out.push(items.join('\n'));
    }
  }
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

const slugOf = link => link.split('?')[0].split('/').pop().replace(/-[0-9a-f]{8,}$/, '');

function isoDate(pubDate) {
  const m = pubDate.match(/(\d{1,2}) (\w{3}) (\d{4})/);
  if (!m) return null;
  return m[3] + '-' + String(MONTHS.indexOf(m[2]) + 1).padStart(2, '0') + '-' + m[1].padStart(2, '0');
}

/* verse has many short lines; prose has few long ones */
function looksLikeVerse(html) {
  const paras = [...html.matchAll(/<p>([\s\S]*?)<\/p>/gi)].map(p => p[1].replace(/<[^>]+>/g, ''));
  if (!paras.length) return false;
  const avg = paras.reduce((a, p) => a + p.length, 0) / paras.length;
  return avg < 90 || (html.match(/<br/gi) || []).length > 5;
}

(async () => {
  const xml = await get(FEED);
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(i => i[1]);
  console.log('feed returned ' + items.length + ' item(s)');

  let added = 0, skipped = 0;
  for (const it of items) {
    const title = (it.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || [])[1];
    const link = (it.match(/<link>([\s\S]*?)<\/link>/) || [])[1];
    const content = (it.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/) || [])[1];
    const pub = (it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1];
    if (!title || !link || !content) continue;

    const slug = slugOf(link);
    const verse = forcePoetry.has(slug) || looksLikeVerse(content);
    const dir = verse ? 'content/poetry' : 'content/thoughts';
    const file = path.join(ROOT, dir, slug + '.md');
    const body = htmlToMd(content);

    if (fs.existsSync(file) && !force) {
      const existing = fs.readFileSync(file, 'utf8');
      const parts = existing.split(/^---\s*$/m);
      const hasBody = parts[2] && parts[2].replace(/<!--[\s\S]*?-->/g, '').trim();
      if (hasBody) { skipped++; continue; }
      fs.writeFileSync(file, '---' + parts[1] + '---\n\n' + body + '\n');   // keep hand-set frontmatter
      console.log('  filled ' + dir + '/' + slug + '.md');
      added++;
      continue;
    }

    const fm = ['---',
      'title: ' + (/[:#]/.test(title) ? JSON.stringify(title) : title),
      'date: ' + isoDate(pub),
      'medium: ' + link.split('?')[0],
      ...(verse ? ['# audio: /audio/poetry/' + slug + '.m4a'] : []),
      '---', '', body, ''].join('\n');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, fm);
    console.log('  + ' + dir + '/' + slug + '.md   ' + isoDate(pub) + '  ' + title + (verse ? '  [verse]' : ''));
    added++;
  }
  console.log('imported ' + added + ', skipped ' + skipped + ' already written');
  console.log('note: Medium exposes only the latest 10 posts; older ones must be pasted in.');
})().catch(e => { console.error(e.message); process.exit(1); });
