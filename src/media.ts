import { syntaxTree } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export interface YouTubeVideo {
  id: string;
  canonicalUrl: string;
  embedUrl: string;
}

export interface VisualUrlInsertion {
  from: number;
  to: number;
  insert: string;
  anchor: number;
  head: number;
  kind: "image" | "youtube";
}

const IMAGE_EXTENSIONS = /\.(?:avif|gif|jpe?g|png|webp)$/iu;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/u;

function httpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** Parse the stable YouTube URL shapes IdeaSpaces upgrades into a player. */
export function youtubeVideo(value: string): YouTubeVideo | null {
  const url = httpUrl(value);
  if (!url) return null;

  const host = url.hostname.toLocaleLowerCase().replace(/^www\./u, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    if (url.pathname === "/watch") {
      id = url.searchParams.get("v");
    } else {
      const [kind, candidate] = url.pathname.split("/").filter(Boolean);
      if (kind === "shorts" || kind === "embed" || kind === "live") id = candidate ?? null;
    }
  }

  if (!id || !YOUTUBE_ID.test(id)) return null;
  return {
    id,
    canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
  };
}

export function isImageUrl(value: string): boolean {
  const url = httpUrl(value);
  return Boolean(url && IMAGE_EXTENSIONS.test(url.pathname));
}

function humanizeFilename(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const encoded = segments[segments.length - 1] ?? "";
  let filename = encoded;
  try {
    filename = decodeURIComponent(encoded);
  } catch {
    // Keep the authored path segment when percent decoding is malformed.
  }
  const words = filename
    .replace(IMAGE_EXTENSIONS, "")
    .replace(/[-_]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!words) return "Image";
  return words.charAt(0).toLocaleUpperCase() + words.slice(1);
}

export function imageDescription(value: string): string {
  const url = httpUrl(value);
  return url ? humanizeFilename(url.pathname) : "Image";
}

function inCode(state: EditorState, position: number): boolean {
  let node = syntaxTree(state).resolveInner(position, -1);
  while (true) {
    if (/code/iu.test(node.name)) return true;
    const parent = node.parent;
    if (!parent) return false;
    node = parent;
  }
}

function blockLinePadding(state: EditorState, position: number): { before: string; after: string } {
  const line = state.doc.lineAt(position);
  return {
    before: state.sliceDoc(line.from, position).trim() ? "\n\n" : "",
    after: state.sliceDoc(position, line.to).trim() ? "\n\n" : "",
  };
}

/**
 * Turn one unambiguous bare visual URL paste into portable Markdown. The returned
 * selection covers the generated description so the user's next keystroke edits it.
 */
export function visualUrlInsertion(
  state: EditorState,
  from: number,
  to: number,
  clipboardText: string,
): VisualUrlInsertion | null {
  if (from !== to || inCode(state, from)) return null;
  const value = clipboardText.trim();
  if (!value || value !== clipboardText || /[\r\n]/u.test(value)) return null;

  if (isImageUrl(value)) {
    const label = imageDescription(value);
    const padding = blockLinePadding(state, from);
    const markdown = `![${label}](${value})`;
    const insert = `${padding.before}${markdown}${padding.after}`;
    const labelFrom = from + padding.before.length + 2;
    return {
      from,
      to,
      insert,
      anchor: labelFrom,
      head: labelFrom + label.length,
      kind: "image",
    };
  }

  const video = youtubeVideo(value);
  if (!video) return null;
  const label = "YouTube video";
  const padding = blockLinePadding(state, from);
  const markdown = `[${label}](${video.canonicalUrl})`;
  const insert = `${padding.before}${markdown}${padding.after}`;
  const labelFrom = from + padding.before.length + 1;
  return {
    from,
    to,
    insert,
    anchor: labelFrom,
    head: labelFrom + label.length,
    kind: "youtube",
  };
}

/** Editor paste behavior for bare image and YouTube URLs. */
export function visualUrlPaste(): Extension {
  return EditorView.domEventHandlers({
    paste(event, view) {
      if (event.clipboardData?.files.length) return false;
      if (view.state.selection.ranges.length !== 1) return false;
      const text = event.clipboardData?.getData("text/plain");
      if (!text) return false;
      const range = view.state.selection.main;
      const insertion = visualUrlInsertion(view.state, range.from, range.to, text);
      if (!insertion) return false;

      event.preventDefault();
      view.dispatch({
        changes: {
          from: insertion.from,
          to: insertion.to,
          insert: insertion.insert,
        },
        selection: { anchor: insertion.anchor, head: insertion.head },
        userEvent: "input.paste",
      });
      return true;
    },
  });
}
