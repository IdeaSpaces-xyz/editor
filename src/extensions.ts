// CodeMirror extension set for the note editor.
//
// Composes atomic-editor's live-preview mechanics (hide markup, reveal on the
// cursor's line) over CM's markdown language, then applies one IdeaSpaces-owned
// syntax palette and `--is-*` chrome. Block typography lives only in editor.css
// through the semantic `cm-atomic-*` line classes emitted by live preview.

import {
  autoCloseCodeFence,
  extendEmphasisPair,
  imageBlocks,
  inlinePreview,
  tables,
  wikiLinks,
  type WikiLinkResolvedTarget,
} from "@atomic-editor/editor";
import "@atomic-editor/editor/styles.css";
import { frontmatterPanel } from "./frontmatterPanel.js";
import {
  markdownLinkCompletion,
  taskMarkerCompletion,
  type SuggestMarkdownLinks,
} from "./completions.js";
import { visualUrlPaste } from "./media.js";
import { markdownImageFiles, type StoreMarkdownImage } from "./imageAssets.js";
import { markdownImageSources, type ResolveMarkdownImage } from "./imageSources.js";
import { youtubeEmbeds } from "./youtubeEmbeds.js";
import { ideaSpacesMarkdownSyntax } from "./markdownSyntax.js";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { indentOnInput } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  rectangularSelection,
} from "@codemirror/view";

// Editor chrome mapped to the desktop's semantic tokens. Colors are `var(--is-*)`
// so light/dark follows the app theme with no reconfigure. Typography of the
// rendered content lives in editor.css (the cm-atomic-* overrides).
const isChromeTheme = EditorView.theme({
  "&": {
    color: "var(--is-text)",
    backgroundColor: "transparent",
    height: "100%",
  },
  ".cm-content": {
    fontFamily: "var(--font-sans)",
    fontSize: "1.0625rem",
    // Long-form prose needs enough leading to track across a 60–70ch measure,
    // but 1.85 disconnects adjacent lines and weakens section rhythm.
    lineHeight: "1.7",
    caretColor: "var(--is-text)",
    padding: "0",
    maxWidth: "720px",
    margin: "0 auto",
  },
  ".cm-scroller": { overflow: "auto" },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--is-text)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--is-selection)",
  },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-gutters": { display: "none" },
});

// Let the editor grow to its content height (no internal scroll) — for the
// inline read-only README render, where the surrounding page scrolls instead.
const autoHeightTheme = EditorView.theme({
  "&": { height: "auto" },
  ".cm-scroller": { overflow: "visible" },
});

/** Build the note-editor extensions. `onSave` fires on Cmd/Ctrl+S. */
export function noteEditorExtensions(opts: {
  onChange: (doc: string) => void;
  onSave: () => void;
  onLinkClick: (url: string) => void;
  /** Render-only (README preview): no edits, no save. */
  readOnly?: boolean;
  /** Grow to content height instead of filling/scrolling the host. */
  autoHeight?: boolean;
  /** Open a `[[wiki-link]]` target (resolve + navigate, or offer to create). */
  onWikiOpen?: (target: string) => void;
  /** Resolve a target's status for styling (resolved vs. missing). */
  resolveWiki?: (target: string) => WikiLinkResolvedTarget | null;
  /** Suggest Notes after `[[`; selection inserts a portable Markdown link. */
  suggestMarkdownLinks?: SuggestMarkdownLinks;
  /** Store pasted/dropped picture bytes and return a portable destination. */
  storeMarkdownImage?: StoreMarkdownImage;
  onMarkdownImageError?: (error: unknown) => void;
  /** Resolve rendered image sources without changing Markdown. */
  resolveMarkdownImage?: ResolveMarkdownImage;
}): Extension[] {
  return [
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    rectangularSelection(),
    highlightActiveLine(),
    ...(opts.readOnly
      ? []
      : [
          taskMarkerCompletion(),
          visualUrlPaste(),
          ...(opts.storeMarkdownImage
            ? [markdownImageFiles(
                opts.storeMarkdownImage,
                opts.onMarkdownImageError ?? ((error) => console.error(error)),
              )]
            : []),
          ...(opts.suggestMarkdownLinks
            ? [markdownLinkCompletion(opts.suggestMarkdownLinks)]
            : []),
        ]),
    closeBrackets(),
    extendEmphasisPair,
    autoCloseCodeFence,
    EditorView.lineWrapping,
    // GFM base so the live-preview layer sees tasks/strikethrough/autolinks.
    markdown({ base: markdownLanguage }),
    markdownLanguage.data.of({
      closeBrackets: { brackets: ["(", "[", "{", "'", '"', "*", "_", "`"] },
    }),
    // IdeaSpaces owns visual syntax. Atomic Editor supplies live-preview
    // mechanics only, so nested syntax spans cannot restyle block typography.
    ideaSpacesMarkdownSyntax,
    // Render leading YAML frontmatter as a Properties panel (after the markdown
    // syntax layer, so it overrides how the `---` block would otherwise render).
    // No Edit affordance in read-only (README) renders.
    frontmatterPanel({ editable: !opts.readOnly }),
    isChromeTheme,
    ...(opts.autoHeight ? [autoHeightTheme] : []),
    ...(opts.readOnly
      ? [EditorState.readOnly.of(true), EditorView.editable.of(false)]
      : // Native browser spellcheck (red squiggles on misspellings) on the
        // editable surface only. autocorrect off — flag, don't silently rewrite.
        [EditorView.contentAttributes.of({ spellcheck: "true", autocorrect: "off" })]),
    // Save shortcut sits above the defaults so it wins.
    keymap.of([
      {
        key: "Mod-s",
        preventDefault: true,
        run: () => {
          opts.onSave();
          return true;
        },
      },
    ]),
    // No indentWithTab — this is a prose editor; Tab should stay available for
    // UI navigation/accessibility, and markdownKeymap handles list continuation.
    keymap.of([...closeBracketsKeymap, ...historyKeymap, ...markdownKeymap, ...defaultKeymap]),
    imageBlocks(),
    ...(opts.resolveMarkdownImage
      ? [markdownImageSources(
          opts.resolveMarkdownImage,
          opts.onMarkdownImageError ?? ((error) => console.error(error)),
        )]
      : []),
    youtubeEmbeds(),
    // Render GFM tables as real tables (without this they show as raw `| … |`
    // source). Cell links route through the same handler as body links.
    tables({ onLinkClick: opts.onLinkClick }),
    inlinePreview({ onLinkClick: opts.onLinkClick }),
    // `[[wiki-links]]` — render + resolve (resolved/missing styling) + open.
    // openOnClick:false → a plain click places the caret and reveals the raw
    // `[[…]]` to edit (Obsidian edit-mode); ⌘/Ctrl-click opens. Only wired when
    // the host supplies handlers (the clone's note index).
    ...(opts.onWikiOpen || opts.resolveWiki
      ? [
          wikiLinks({
            openOnClick: false,
            onOpen: opts.onWikiOpen,
            resolve: opts.resolveWiki
              ? async (target) => opts.resolveWiki!(target)
              : undefined,
          }),
        ]
      : []),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) opts.onChange(update.state.doc.toString());
    }),
  ];
}
