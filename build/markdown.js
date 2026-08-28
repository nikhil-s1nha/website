/* Minimal zero-dependency Markdown renderer.
   Two modes:
     render(md)      - prose: paragraphs, headings, lists, quotes, code, images
     renderPoem(md)  - verse: blank line = stanza, every newline is a real line break
   Only the subset actually used for writing. No dependencies, no build tooling. */

const HOLD  = String.fromCharCode(0);  // protects finished inline HTML from later regexes
const BREAK = String.fromCharCode(1);  // marks an explicit hard line break in a paragraph

const esc = s => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/* -- inline: code, images, links, bold, italic -- */
function inline(src) {
  let s = esc(src);
  const stash = [];
  const hold = html => HOLD + (stash.push(html) - 1) + HOLD;

  s = s.replace(/`([^`]+)`/g, (_, c) => hold('<code>' + c + '</code>'));

  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (_, alt, url, title) =>
      hold('<img src="' + url + '" alt="' + alt + '"' +
           (title ? ' title="' + title + '"' : '') + ' loading="lazy">'));

  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, text, url, title) => {
    const external = /^https?:/i.test(url);
    return hold('<a href="' + url + '"' +
      (title ? ' title="' + title + '"' : '') +
      (external ? ' target="_blank" rel="noopener"' : '') + '>' + text + '</a>');
  });

  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
       .replace(/__([^_]+)__/g, '<strong>$1</strong>')
       .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>')
       .replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>');

  return s.replace(new RegExp(HOLD + '(\\d+)' + HOLD, 'g'), (_, i) => stash[i]);
}

/* -- block level -- */
function render(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const isBlank = l => !l.trim();
  const bullet = /^\s*[-*+]\s+/, numbered = /^\s*\d+[.)]\s+/;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }

    if (/^```/.test(line)) {                                  // fenced code
      const lang = line.slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push('<pre><code' + (lang ? ' class="language-' + lang + '"' : '') + '>' +
               esc(buf.join('\n')) + '</code></pre>');
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);                // heading
    if (h) {
      const n = h[1].length;
      out.push('<h' + n + '>' + inline(h[2].trim()) + '</h' + n + '>');
      i++; continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {            // horizontal rule
      out.push('<hr>'); i++; continue;
    }

    if (/^\s*>/.test(line)) {                                 // blockquote
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push('<blockquote>' + render(buf.join('\n')) + '</blockquote>');
      continue;
    }

    if (bullet.test(line) || numbered.test(line)) {            // lists
      const ordered = numbered.test(line);
      const marker = ordered ? numbered : bullet;
      const items = [];
      while (i < lines.length && marker.test(lines[i])) {
        let text = lines[i++].replace(marker, '');
        while (i < lines.length && !isBlank(lines[i]) &&
               !bullet.test(lines[i]) && !numbered.test(lines[i])) {
          text += ' ' + lines[i++].trim();
        }
        items.push('<li>' + inline(text) + '</li>');
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push('<' + tag + '>' + items.join('') + '</' + tag + '>');
      continue;
    }

    if (/^\s*</.test(line)) {                                  // raw html, passed through
      const buf = [];
      while (i < lines.length && !isBlank(lines[i])) buf.push(lines[i++]);
      out.push(buf.join('\n'));
      continue;
    }

    const buf = [];                                            // paragraph
    while (i < lines.length && !isBlank(lines[i]) &&
           !/^(```|#{1,6}\s|\s*>)/.test(lines[i]) &&
           !bullet.test(lines[i]) && !numbered.test(lines[i])) {
      buf.push(lines[i++]);
    }
    const text = buf
      .map((l, n) => l.trim() + (n < buf.length - 1 && /\s{2,}$/.test(l) ? BREAK : ''))
      .join(' ');
    const html = inline(text).split(BREAK + ' ').join('<br>\n').split(BREAK).join('<br>\n');
    out.push(/^<img [^>]+>$/.test(html) ? '<figure>' + html + '</figure>' : '<p>' + html + '</p>');
  }

  return out.join('\n');
}

/* -- verse: line breaks are the form, so they survive verbatim -- */
function renderPoem(md) {
  return md.replace(/\r\n?/g, '\n').trim().split(/\n{2,}/)
    .map(stanza => {
      const lines = stanza.split('\n').map(l => {
        const indent = l.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length;
        const body = inline(l.trim());
        return indent > 0
          ? '<span class="indent" style="--indent:' + indent + '">' + body + '</span>'
          : body;
      });
      return '<p class="stanza">' + lines.join('<br>\n') + '</p>';
    })
    .join('\n');
}

module.exports = { render, renderPoem, inline, esc };
