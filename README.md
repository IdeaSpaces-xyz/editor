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

The editor also completes a typed list prefix such as `- [` to the valid task
marker `- [ ] `. Pasting a bare image URL creates a portable Markdown image and
pasting a YouTube URL creates a standard labeled link; the generated description
is selected for immediate editing. A standalone YouTube link is enhanced into a
responsive `youtube-nocookie.com` player while remaining a valid link in other
Markdown consumers. The **Note index, link resolution, asset storage, and IO
adapters stay in each app**; only host-neutral authoring behavior and presentation
live here.

## Exports

```ts
import { NoteEditor, parseFrontmatter, setFrontmatterName, bodyStartOffset } from "@ideaspaces/editor";
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
