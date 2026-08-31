import { syntaxTree } from "@codemirror/language";
import {
  EditorState,
  StateEffect,
  StateField,
  type Extension,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export interface YouTubeVideo {
  id: string;
  canonicalUrl: string;
  embedUrl: string;
}

/** Host-owned public-metadata lookup used to caption a pasted YouTube link. */
export type ResolveYouTubeTitle = (video: YouTubeVideo) => Promise<string | null>;

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
const DEFAULT_YOUTUBE_LABEL = "YouTube video";
const MAX_YOUTUBE_TITLE_LENGTH = 300;

interface YouTubeLabelMarker {
  id: number;
  from: number;
  to: number;
}

const addYouTubeLabelMarker = StateEffect.define<YouTubeLabelMarker>();
const removeYouTubeLabelMarker = StateEffect.define<number>();
let nextYouTubeLabelMarkerId = 1;

const youtubeLabelMarkers = StateField.define<ReadonlyMap<number, YouTubeLabelMarker>>({
  create: () => new Map(),
  update(value, transaction) {
    const next = new Map<number, YouTubeLabelMarker>();
    for (const marker of value.values()) {
      next.set(marker.id, {
        ...marker,
        from: transaction.changes.mapPos(marker.from, 1),
        to: transaction.changes.mapPos(marker.to, -1),
      });
    }
    for (const effect of transaction.effects) {
      if (effect.is(addYouTubeLabelMarker)) next.set(effect.value.id, effect.value);
      if (effect.is(removeYouTubeLabelMarker)) next.delete(effect.value);
    }
    return next;
  },
});

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

/** Collapse public metadata into one safe, portable Markdown-link label. */
export function youtubeTitleLabel(value: string): string | null {
  const title = value.replace(/\s+/gu, " ").trim();
  if (!title) return null;
  return title
    .slice(0, MAX_YOUTUBE_TITLE_LENGTH)
    .replace(/([\\[\]])/gu, "\\$1");
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
  const label = DEFAULT_YOUTUBE_LABEL;
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

export function resolvedYouTubeTitleChange(
  state: EditorState,
  marker: Pick<YouTubeLabelMarker, "from" | "to">,
  video: YouTubeVideo,
  resolvedTitle: string,
): { from: number; to: number; insert: string } | null {
  const title = youtubeTitleLabel(resolvedTitle);
  if (!title || title === DEFAULT_YOUTUBE_LABEL) return null;
  if (state.sliceDoc(marker.from, marker.to) !== DEFAULT_YOUTUBE_LABEL) return null;

  const line = state.doc.lineAt(marker.from);
  const expected = `[${DEFAULT_YOUTUBE_LABEL}](${video.canonicalUrl})`;
  return line.text.trim() === expected
    ? { from: marker.from, to: marker.to, insert: title }
    : null;
}

async function applyResolvedYouTubeTitle(
  view: EditorView,
  markerId: number,
  video: YouTubeVideo,
  resolveTitle: ResolveYouTubeTitle,
): Promise<void> {
  try {
    const resolved = await resolveTitle(video);
    if (!resolved || !view.dom.isConnected) return;

    const marker = view.state.field(youtubeLabelMarkers).get(markerId);
    if (!marker) return;
    const change = resolvedYouTubeTitleChange(view.state, marker, video, resolved);
    if (!change) return;

    const selection = view.state.selection.main;
    const labelIsSelected = selection.from === marker.from && selection.to === marker.to;
    view.dispatch({
      changes: change,
      selection: labelIsSelected
        ? { anchor: marker.from, head: marker.from + change.insert.length }
        : undefined,
      effects: removeYouTubeLabelMarker.of(markerId),
    });
  } catch {
    // Metadata is optional enrichment. Offline, blocked, or removed videos keep
    // the already-authored portable fallback instead of turning paste into an error.
  } finally {
    if (view.dom.isConnected && view.state.field(youtubeLabelMarkers).has(markerId)) {
      view.dispatch({ effects: removeYouTubeLabelMarker.of(markerId) });
    }
  }
}

/** Editor paste behavior for bare image and YouTube URLs. */
export function visualUrlPaste(resolveYouTubeTitle?: ResolveYouTubeTitle): Extension {
  const pasteHandler = EditorView.domEventHandlers({
    paste(event, view) {
      if (event.clipboardData?.files.length) return false;
      if (view.state.selection.ranges.length !== 1) return false;
      const text = event.clipboardData?.getData("text/plain");
      if (!text) return false;
      const range = view.state.selection.main;
      const insertion = visualUrlInsertion(view.state, range.from, range.to, text);
      if (!insertion) return false;

      const video = insertion.kind === "youtube" ? youtubeVideo(text.trim()) : null;
      const markerId = video && resolveYouTubeTitle ? nextYouTubeLabelMarkerId++ : null;
      event.preventDefault();
      view.dispatch({
        changes: {
          from: insertion.from,
          to: insertion.to,
          insert: insertion.insert,
        },
        selection: { anchor: insertion.anchor, head: insertion.head },
        effects: markerId === null
          ? undefined
          : addYouTubeLabelMarker.of({
              id: markerId,
              from: insertion.anchor,
              to: insertion.head,
            }),
        userEvent: "input.paste",
      });
      if (markerId !== null && video && resolveYouTubeTitle) {
        void applyResolvedYouTubeTitle(view, markerId, video, resolveYouTubeTitle);
      }
      return true;
    },
  });

  return resolveYouTubeTitle ? [youtubeLabelMarkers, pasteHandler] : pasteHandler;
}
