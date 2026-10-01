# @ideaspaces/editor

The shared IdeaSpaces note editor — Obsidian-style **live-preview Markdown** over
CodeMirror 6 + [`@atomic-editor/editor`](https://www.npmjs.com/package/@atomic-editor/editor),
with a structured frontmatter Properties panel.

One editor, two surfaces: **is_web** (hosted, API-backed) and **is_desktop**
(local clones over the CLI sidecar) both consume this package so the editor
lives in one place instead of being copied.

## What's here (and what isn't)

This package is **pure and presentational** — no data fetching, no file IO, no
routing. The host injects everything app-specific through props:

- `onSave`, `onChange`, `onLinkClick` — the host decides where edits go (an API
  `PUT` on web, a clone write + `commit`/`sync` on desktop).
- `resolveWiki` / `onWikiOpen` — the host owns resolution for existing
  `[[wiki-links]]`.
- `suggestMarkdownLinks` — the host searches the current Space for Notes. The
  editor uses `[[` as the picker trigger but inserts a portable relative
  Markdown link (`[label](../path.md)`).
- `storeMarkdownImage` — the host validates and stores dropped or clipboard
  picture bytes, then returns the portable relative destination the editor
  inserts. The package never receives filesystem or upload authority.
- `resolveMarkdownImage` — the host maps an authored source to a renderable URL
  without rewriting the Markdown (for example, a bounded Local `_assets/`
  reader or a hosted asset URL).

`@atomic-editor/editor` supplies Markdown parsing and live-preview mechanics; it does not own the
IdeaSpaces visual grammar. This package applies one syntax palette and one block-typography sheet for
both reading and editing. In particular, heading family, size, weight, and rhythm live only in
`editor.css` rather than being restyled again by nested CodeMirror highlight spans.

In ordinary prose, **Enter creates one portable blank-line-delimited Markdown paragraph** and
**Shift+Enter creates a soft line break**. Structured blocks keep their native behavior: lists
continue or exit, quotes retain their marker, tables navigate, and code receives a literal newline.
The blank line is semantic source, not presentation: the live editor collapses the delimiter and
applies the same `1.2em` paragraph rhythm as the rendered Space reader. Repeated blank delimiters do
not multiply the gap, and headings continue to own their section spacing.

The editor also completes a typed list prefix such as `- [` to the valid task
marker `- [ ] `. Pasting a bare image URL creates a portable Markdown image and
pasting a YouTube URL creates a standard labeled link; the generated description
is selected for immediate editing. A host may provide `resolveYouTubeTitle` to replace the
fallback label with public video metadata without blocking offline paste. A standalone YouTube
link is enhanced into a responsive, fullscreen-capable `youtube-nocookie.com` player while
remaining a valid link in other Markdown consumers. The **Note index, link resolution, public
metadata lookup, asset storage, and IO adapters stay in each app**; only host-neutral authoring
behavior and presentation live here.

## Read mode

`readOnly` is **read mode**, the one reading surface both apps read every note through (one parser,
one set of blocks). It keeps the parse, the syntax palette and live preview's hidden markup, and
takes away everything that edits:

- **Syntax never reveals.** The content element cannot take focus, the editor's selection never
  moves, and a change filter refuses every document change, so no click, selection or key opens a
  block's Markdown. The browser's own selection still works for copying and quoting.
- **Frontmatter is hidden.** `hideTitle` also hides the first H1, so the host can draw it as the
  title with a byline beneath.
- **Figures.** `![caption](path)` is a figure captioned by its alt text; two images in one paragraph
  are a 2-up gallery; a standalone YouTube link is a poster that loads the player only on a click;
  a table is a plain, read-only table.
- **Anchors.** Every top-level block carries `data-block="b<n>"` (its index in the parsed body) and
  every heading a slug `id`. `noteBlocks(markdown)` returns the same list without a view.
- **The whole document is in the DOM**, not only the viewport, so `#b<n>` below the fold,
  find-in-page and print reach every line. This keeps CodeMirror's print-mode viewport on
  (`viewState.printing`), an internal flag; if an upgrade moves it, reading degrades to the
  viewport rather than failing.
- **Links follow on a plain click**, wiki-links included.

Type and spacing come from `--is-read-*` custom properties the host sets per scale (body, title,
H2, H3, quote, code, gap); without them the pane scale applies.

## Exports

```ts
import { NoteEditor, noteBlocks, parseFrontmatter, setFrontmatterName, bodyStartOffset } from "@ideaspaces/editor";
import { youtubeVideo } from "@ideaspaces/editor/media"; // parser-only consumer, no editor bundle
import "@ideaspaces/editor/styles.css"; // (NoteEditor also side-effect-imports it)
```

## Consuming it

Add the github dependency (same mechanism as `@ideaspaces/cli` / `sdk`):

```json
"@ideaspaces/editor": "github:IdeaSpaces-xyz/editor"
```

The CodeMirror / `@atomic-editor/editor` / `react` packages are **peer
dependencies** — the app already has them, so there's one copy. The only Tailwind
utility the editor uses is `h-full`, which every app generates already; styling
otherwise comes from `editor.css` (the `cm-*` classes) and the `--is-*` tokens
the host defines.

**Fonts are the host's job**, like the tokens: the editor's prose uses
`Sorts Mill Goudy` via `font-family`, but the package does not bundle it — the
host loads it (a `@fontsource` import or a web-font link) so there's no
double-load when the app already serves that serif.

## Build

`tsc` → `dist/` (+ `editor.css` copied), run via `prepare` so a `github:` install
builds on fetch. `npm test` runs the frontmatter and authoring-completion unit
tests.
