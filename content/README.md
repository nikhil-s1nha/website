# Writing

Every essay and poem is a markdown file in here. `node build/build.js` turns them into
pages at the repo root. There is no bundler and nothing to install.

```
content/thoughts/<slug>.md   ->   /thoughts/<slug>
content/poetry/<slug>.md     ->   /poetry/<slug>
```

The filename is the URL. `content/thoughts/losing.md` becomes `/thoughts/losing`.

## Frontmatter

```markdown
---
title: Losing
date: 2026-08-26
medium: https://medium.com/@nikhils1nha/losing-69885cbe59be
---

Body text starts here.
```

| key      | required | what it does                                                        |
|----------|----------|---------------------------------------------------------------------|
| `title`  | yes      | Heading on the page and the label in the index                       |
| `date`   | yes      | `YYYY-MM-DD`. Sorts the index, newest first                          |
| `medium` | no       | Adds an "Also on Medium" link in the footer                          |
| `audio`  | poems    | Path to a recording, e.g. `/audio/poetry/fate.m4a`                   |

## The migration rule

**A post with an empty body does not get a page.** Its index entry keeps linking out to
Medium exactly like it always has. The moment you paste the text into the `.md` file and
rebuild, the native page appears and the index link turns inward.

That means the site is never broken mid-migration. Move posts over one at a time, in any
order, at whatever pace you like. `node build/build.js` prints which ones are still waiting.

## Poems

Line breaks are the form, so poems are not run through the prose renderer. Every newline
is a real line break, a blank line starts a new stanza, and leading spaces are preserved
as indentation. Write the poem exactly as it should appear.

## Recordings

Drop the file in `audio/poetry/` and point `audio:` at it:

```markdown
audio: /audio/poetry/fate.m4a
```

A poem with a recording gets a player above the text and a small note mark next to its
title in the index. A poem without one just has no player. If the file is missing at build
time the build warns and omits the player rather than shipping a dead control.

To convert a voice memo (ffmpeg is already installed):

```sh
ffmpeg -i memo.m4a -ac 1 -b:a 96k -c:a aac audio/poetry/fate.m4a
```

Mono at 96 kbps is plenty for spoken word and keeps a two-minute poem near 1.5 MB.

## Pulling from Medium

```sh
node build/import-medium.js
```

Medium's feed only exposes the **10 most recent** posts and individual article pages return
403, so this cannot reach the older work. Anything it can't fetch has to be pasted in by
hand. Existing files are never overwritten; a stub with no body yet gets filled in while
its frontmatter is left alone.

## Publishing

```sh
node build/build.js
git add -A && git commit -m "..." && git push
```

Generated HTML is committed so Vercel keeps serving the repo directly with no build step.
Never edit the generated files - `build/build.js` overwrites them, and it prunes pages
whose markdown was deleted.

## Restyling

- `assets/base.css` - fonts, palette, page shell (shared by every page on the site)
- `assets/index.css` - the two-tab index and its mirrored axes
- `assets/post.css` - reading pages, verse layout, and the audio player
- `build/templates/` - the page markup itself, plain HTML with `{{TOKENS}}`

None of it requires touching JavaScript.
