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
- `resolveWiki` / `onWikiOpen` — the host owns its wiki index.

So the **wiki index, link resolution, and IO adapters stay in each app**; only
the editor and the frontmatter parsing live here.

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
builds on fetch. `npm test` runs the frontmatter unit tests.
