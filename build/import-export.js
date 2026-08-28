#!/usr/bin/env node
/* Imports a Medium account export into content/*.md.
   Run: node build/import-export.js <path-to-unzipped-export> [--drafts] [--force] [--dry]

   Unlike the RSS importer this reaches every post, not just the latest ten.
   Posts are matched to existing files by their canonical Medium URL, so a file
   that already has frontmatter keeps it and only gains a body. */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HOLD = String.fromCharCode(0);

const args = process.argv.slice(2);
const dir = args.find(a => !a.startsWith('--'));
const withDrafts = args.includes('--drafts');
const force = args.includes('--force');
const dry = args.includes('--dry');

if (!dir) {
  console.error('usage: node build/import-export.js <unzipped-export-dir> [--drafts] [--force] [--dry]');
  process.exit(1);
}
const postsDir = fs.existsSync(path.join(dir, 'posts')) ? path.join(dir, 'posts') : dir;

/* Posts deliberately kept off the thoughts index. Without this a re-run would
   resurrect them, since the export has no notion of what the site chose to omit. */
const EXCLUDE = new Set([
  'https://medium.com/@nikhils1nha/reducing-dental-emergencies-with-identify-8349220b3a9c',
]);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = s => s
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENTITIES ? ENTITIES[n.toLowerCase()] : m));

const mdEsc = s => s.replace(/([*_`[\]])/g, '\\$1');

/* inline markup -> markdown, with <br> preserved as real newlines */
function inlineToMd(html) {
  let s = html.replace(/<br\s*\/?>/gi, '\n');

  const links = [];
  s = s.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_, href, text) => HOLD + (links.push({ href, text: decode(text.replace(/<[^>]+>/g, '')) }) - 1) + HOLD);

  s = s.replace(/<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>/gi, (_, t) => '**' + decode(t.replace(/<[^>]+>/g, '')) + '**')
       .replace(/<(?:em|i)>([\s\S]*?)<\/(?:em|i)>/gi, (_, t) => '*' + decode(t.replace(/<[^>]+>/g, '')) + '*')
       .replace(/<code>([\s\S]*?)<\/code>/gi, (_, t) => '`' + decode(t.replace(/<[^>]+>/g, '')) + '`');

  s = mdEsc(decode(s.replace(/<[^>]+>/g, '')));
  s = s.replace(/\\\*\\\*/g, '**').replace(/\\\*/g, '*').replace(/\\`/g, '`');

  return s.replace(new RegExp(HOLD + '(\\d+)' + HOLD, 'g'), (_, i) =>
    '[' + links[i].text + '](' + links[i].href + ')')
    .split('\n').map(l => l.trim()).join('\n').trim();
}

/* the export nests <section>s, so slice from the body marker to the footer */
function bodyHtml(src) {
  const start = src.indexOf('data-field="body"');
  if (start < 0) return '';
  const end = src.indexOf('<footer>', start);
  return src.slice(start, end < 0 ? src.length : end);
}

function toMarkdown(body, verse) {
  const out = [];
  // Medium wraps every block in a .graf element
  const re = /<(h1|h2|h3|h4|p|blockquote|pre|figure|li)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m, first = true;
  while ((m = re.exec(body))) {
    const tag = m[1].toLowerCase(), attrs = m[2], inner = m[3];

    // the first block repeats the title as a heading - drop it
    if (first && /graf--title/.test(attrs)) { first = false; continue; }
    first = false;
    if (/graf--subtitle/.test(attrs)) continue;

    const text = inlineToMd(inner);
    if (!text) continue;

    if (tag === 'figure') {
      const img = inner.match(/<img[^>]*src="([^"]*)"/i);
      if (img) out.push('![](' + img[1] + ')');
    } else if (tag === 'blockquote') {
      out.push(text.split('\n').map(l => '> ' + l).join('\n'));
    } else if (tag === 'pre') {
      out.push('```\n' + text + '\n```');
    } else if (tag === 'li') {
      out.push('- ' + text.replace(/\n/g, ' '));
    } else if (/^h[1-4]$/.test(tag)) {
      out.push('## ' + text.replace(/\n/g, ' '));
    } else {
      // in verse the newlines from <br> are the form and must survive
      out.push(verse ? text : text.replace(/\n/g, ' '));
    }
  }
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* Medium stores UTC; the site's existing dates are Pacific-local, which is what
   Medium displayed at publish time. Match that so dates stay consistent. */
function pacificDate(iso) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = t => parts.find(p => p.type === t).value;
  return get('year') + '-' + get('month') + '-' + get('day');
}

/* index every existing content file by its canonical Medium URL */
function existingByMedium() {
  const map = new Map();
  for (const kind of ['thoughts', 'poetry']) {
    const d = path.join(ROOT, 'content', kind);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter(x => x.endsWith('.md'))) {
      const p = path.join(d, f);
      const src = fs.readFileSync(p, 'utf8');
      const m = src.match(/^medium:\s*(\S+)\s*$/m);
      if (m) map.set(m[1].replace(/\/$/, ''), { path: p, kind, src });
    }
  }
  return map;
}

const existing = existingByMedium();
const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.html')).sort();

let filled = 0, created = 0, skippedResponse = 0, skippedDraft = 0, skippedHasText = 0, skippedExcluded = 0;
const newPosts = [], responses = [];

for (const file of files) {
  const isDraft = file.startsWith('draft_');
  if (isDraft && !withDrafts) { skippedDraft++; continue; }

  const src = fs.readFileSync(path.join(postsDir, file), 'utf8');
  const title = decode((src.match(/<h1 class="p-name">([\s\S]*?)<\/h1>/) || [, ''])[1].replace(/<[^>]+>/g, '').trim());
  const canonical = (src.match(/href="([^"]*)" class="p-canonical"/) || [])[1];
  const when = (src.match(/datetime="([^"]+)"/) || [])[1];
  const body = bodyHtml(src);

  const brs = (body.match(/<br\s*\/?>/gi) || []).length;
  const verse = brs >= 3;
  const md = toMarkdown(body, verse);

  // a Medium "response" is a comment on someone else's piece: title, no body
  if (md.length < 40) { skippedResponse++; responses.push(title); continue; }

  const key = canonical ? canonical.replace(/\/$/, '') : null;
  if (key && EXCLUDE.has(key)) { skippedExcluded++; continue; }
  const hit = key && existing.get(key);

  if (hit) {
    const parts = hit.src.split(/^---\s*$/m);
    const hasText = parts[2] && parts[2].replace(/<!--[\s\S]*?-->/g, '').trim();
    if (hasText && !force) { skippedHasText++; continue; }
    if (!dry) fs.writeFileSync(hit.path, '---' + parts[1] + '---\n\n' + md + '\n');
    console.log('  filled   ' + path.relative(ROOT, hit.path) + (verse ? '   [verse]' : ''));
    filled++;
    continue;
  }

  // new to the site
  const slug = canonical
    ? canonical.split('/').pop().replace(/-[0-9a-f]{8,}$/, '')
    : title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const kind = verse ? 'poetry' : 'thoughts';
  const out = path.join(ROOT, 'content', kind, slug + '.md');
  if (fs.existsSync(out) && !force) { skippedHasText++; continue; }

  const date = when ? pacificDate(when) : file.slice(0, 10);
  const fm = ['---',
    'title: ' + (/[:#]/.test(title) ? JSON.stringify(title) : title),
    'date: ' + date,
    ...(canonical ? ['medium: ' + canonical] : []),
    ...(isDraft ? ['draft: true'] : []),
    ...(verse ? ['# audio: /audio/poetry/' + slug + '.m4a'] : []),
    '---', '', md, ''].join('\n');
  if (!dry) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, fm);
  }
  console.log('  NEW      content/' + kind + '/' + slug + '.md   ' + date + '   ' + title + (verse ? '   [verse]' : ''));
  newPosts.push({ kind, slug, title, date, verse });
  created++;
}

console.log('');
console.log((dry ? '[dry run] ' : '') + 'filled ' + filled + ', created ' + created);
console.log('  skipped ' + skippedHasText + ' that already had text, ' +
            skippedResponse + ' comment responses, ' + skippedDraft + ' drafts' +
            (skippedExcluded ? ', ' + skippedExcluded + ' excluded' : ''));
if (responses.length) console.log('  responses ignored: ' + responses.join(', '));
if (!withDrafts && skippedDraft) console.log('  (pass --drafts to bring drafts in as draft: true)');
