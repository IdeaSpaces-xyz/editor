import { Component, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { WikiLinkResolvedTarget } from "@atomic-editor/editor";
import { noteEditorExtensions } from "./extensions.js";
import { bodyStartOffset } from "./frontmatter.js";
import "./editor.css";

const noop = () => {};

export interface NoteEditorProps {
  initialContent: string;
  onChange: (doc: string) => void;
  onSave: () => void;
  onLinkClick: (url: string) => void;
  readOnly?: boolean;
  autoHeight?: boolean;
  autoFocus?: boolean;
  onWikiOpen?: (target: string) => void;
  resolveWiki?: (target: string) => WikiLinkResolvedTarget | null;
}

// Live-preview markdown editor over a single note's raw content.
//
// Mount-per-note: the parent keys this by file path, so opening a different
// note remounts with fresh content — no doc-diffing, and the dirty/draft state
// resets cleanly. Callbacks are held in refs so the CM view is built once.
//
// Also serves the inline README preview via `readOnly` (no edits/save) +
// `autoHeight` (grow to content, page scrolls) + `autoFocus={false}` (don't
// steal focus when it's just a rendered guide).
function EditorImpl({
  initialContent,
  onChange,
  onSave,
  onLinkClick,
  readOnly = false,
  autoHeight = false,
  autoFocus = true,
  onWikiOpen,
  resolveWiki,
}: NoteEditorProps) {
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

// Last-resort plain-text view when the rich editor throws while mounting (a
// malformed-for-the-live-preview note must never blank the whole app). The note
// stays readable, and editable surfaces stay editable — a textarea wired to the
// same onChange/onSave — so work isn't lost, just plainer. Inline-styled so it
// needs nothing from the host's CSS beyond the `--is-*` tokens.
function PlainFallback({
  content,
  readOnly,
  autoHeight,
  onChange,
  onSave,
}: {
  content: string;
  readOnly: boolean;
  autoHeight: boolean;
  onChange: (doc: string) => void;
  onSave: () => void;
}) {
  const box: CSSProperties = {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: "var(--font-sans)",
    fontSize: "1.0625rem",
    lineHeight: "1.85",
    color: "var(--is-text)",
    background: "transparent",
    border: "none",
    outline: "none",
    width: "100%",
    maxWidth: "720px",
    margin: "0 auto",
    display: "block",
    resize: "none",
    ...(autoHeight ? {} : { height: "100%" }),
  };
  const notice: CSSProperties = {
    margin: "0 auto 0.75rem",
    maxWidth: "720px",
    fontSize: "0.8125rem",
    color: "var(--is-text-tertiary)",
  };
  return (
    <div className={autoHeight ? "cm-note-host" : "cm-note-host h-full"} style={{ overflow: "auto" }}>
      <p style={notice}>Showing plain text — the rich editor couldn’t render this note.</p>
      {readOnly ? (
        <pre style={box}>{content}</pre>
      ) : (
        <textarea
          defaultValue={content}
          spellCheck
          autoCorrect="off"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
              e.preventDefault();
              onSave();
            }
          }}
          style={box}
        />
      )}
    </div>
  );
}

// Catches a synchronous throw from the live-preview editor (build/mount) and
// degrades to PlainFallback instead of letting the error unmount the app. The
// parent keys NoteEditor per note, so switching notes remounts this and clears
// a prior error; a note that always throws degrades every time, by design.
class EditorBoundary extends Component<
  { fallback: (error: Error) => ReactNode; children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Surface the real cause — the live-preview failure is otherwise invisible
    // once we've swallowed it into the fallback.
    console.error("NoteEditor failed to render; falling back to plain text.", error);
  }

  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}

/**
 * Live-preview markdown editor over a single note's raw content, wrapped in an
 * error boundary that degrades to plain text if the rich editor throws — so one
 * note the live-preview layer can't handle never blanks the whole window.
 *
 * Mount-per-note: the parent keys this by file path, so opening a different note
 * remounts with fresh content (and resets the boundary).
 *
 * Also serves the inline README preview via `readOnly` + `autoHeight` +
 * `autoFocus={false}`.
 */
export function NoteEditor(props: NoteEditorProps) {
  return (
    <EditorBoundary
      fallback={() => (
        <PlainFallback
          content={props.initialContent}
          readOnly={props.readOnly ?? false}
          autoHeight={props.autoHeight ?? false}
          onChange={props.onChange}
          onSave={props.onSave}
        />
      )}
    >
      <EditorImpl {...props} />
    </EditorBoundary>
  );
}
