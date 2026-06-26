import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { WikiLinkResolvedTarget } from "@atomic-editor/editor";
import { noteEditorExtensions } from "./extensions.js";
import { bodyStartOffset } from "./frontmatter.js";
import "./editor.css";

const noop = () => {};

// Live-preview markdown editor over a single note's raw content.
//
// Mount-per-note: the parent keys this by file path, so opening a different
// note remounts with fresh content — no doc-diffing, and the dirty/draft state
// resets cleanly. Callbacks are held in refs so the CM view is built once.
//
// Also serves the inline README preview via `readOnly` (no edits/save) +
// `autoHeight` (grow to content, page scrolls) + `autoFocus={false}` (don't
// steal focus when it's just a rendered guide).
export function NoteEditor({
  initialContent,
  onChange,
  onSave,
  onLinkClick,
  readOnly = false,
  autoHeight = false,
  autoFocus = true,
  onWikiOpen,
  resolveWiki,
}: {
  initialContent: string;
  onChange: (doc: string) => void;
  onSave: () => void;
  onLinkClick: (url: string) => void;
  readOnly?: boolean;
  autoHeight?: boolean;
  autoFocus?: boolean;
  onWikiOpen?: (target: string) => void;
  resolveWiki?: (target: string) => WikiLinkResolvedTarget | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onLinkClickRef = useRef(onLinkClick);
  const onWikiOpenRef = useRef(onWikiOpen);
  const resolveWikiRef = useRef(resolveWiki);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  onLinkClickRef.current = onLinkClick;
  onWikiOpenRef.current = onWikiOpen;
  resolveWikiRef.current = resolveWiki;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initialContent,
        extensions: noteEditorExtensions({
          onChange: (doc) => onChangeRef.current(doc),
          onSave: () => onSaveRef.current(),
          // Links open in the OS browser; the host (NotePane) owns the opener
          // so it can surface failures via toast.
          onLinkClick: (url) => onLinkClickRef.current(url),
          readOnly,
          autoHeight,
          // Wired only when the host provides them, so wiki-links light up only
          // where there's a note index. Ref indirection keeps the view built once.
          onWikiOpen: onWikiOpen ? (target) => (onWikiOpenRef.current ?? noop)(target) : undefined,
          resolveWiki: resolveWiki ? (target) => resolveWikiRef.current?.(target) ?? null : undefined,
        }),
      }),
    });
    if (autoFocus) {
      // Land the caret in the body, past the frontmatter — never at offset 0.
      const at = bodyStartOffset(initialContent);
      if (at > 0) view.dispatch({ selection: { anchor: at } });
      view.focus();
    }

    return () => view.destroy();
    // initialContent is the mount-time seed only; the parent remounts per note.
    // The mode flags are likewise fixed per mount (parent keys by path/role).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} className={autoHeight ? "cm-note-host" : "cm-note-host h-full"} />;
}
