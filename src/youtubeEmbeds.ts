import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { youtubeVideo } from "./media.js";

const STANDALONE_YOUTUBE_LINK = /^\s*\[((?:\\.|[^\\\]])+)\]\((https?:\/\/[^\s)]+)\)\s*$/u;

function markdownLabelText(value: string): string {
  return value.replace(/\\([\\[\]])/gu, "$1");
}

export interface YouTubeMarkdownLink {
  label: string;
  url: string;
  id: string;
  embedUrl: string;
}

/** A standard Markdown link is enhanced only when it occupies the whole line. */
export function youtubeMarkdownLink(line: string): YouTubeMarkdownLink | null {
  const match = STANDALONE_YOUTUBE_LINK.exec(line);
  if (!match) return null;
  const label = match[1] ? markdownLabelText(match[1]).trim() : "";
  const url = match[2];
  if (!label || !url) return null;
  const video = youtubeVideo(url);
  if (!video) return null;
  return { label, url: video.canonicalUrl, id: video.id, embedUrl: video.embedUrl };
}

class YouTubeWidget extends WidgetType {
  constructor(
    readonly id: string,
    readonly label: string,
    readonly embedUrl: string,
  ) {
    super();
  }

  eq(other: YouTubeWidget): boolean {
    return other.id === this.id && other.label === this.label;
  }

  toDOM(): HTMLElement {
    const figure = document.createElement("figure");
    figure.className = "cm-ideaspaces-youtube";

    const frame = document.createElement("div");
    frame.className = "cm-ideaspaces-youtube-frame";
    const iframe = document.createElement("iframe");
    iframe.src = this.embedUrl;
    iframe.title = this.label;
    iframe.loading = "lazy";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    frame.appendChild(iframe);

    const caption = document.createElement("figcaption");
    caption.textContent = this.label;
    figure.append(frame, caption);
    return figure;
  }

  ignoreEvent(): boolean {
    // The player must receive pointer and keyboard events rather than moving the editor caret.
    return true;
  }
}

function positionIsCode(tree: ReturnType<typeof syntaxTree>, position: number): boolean {
  let node = tree.resolveInner(position, 1);
  while (true) {
    if (/code/iu.test(node.name)) return true;
    const parent = node.parent;
    if (!parent) return false;
    node = parent;
  }
}

function buildYouTubeEmbeds(state: EditorState): DecorationSet {
  const ranges = [];
  const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state);
  for (let number = 1; number <= state.doc.lines; number += 1) {
    const line = state.doc.line(number);
    const video = youtubeMarkdownLink(line.text);
    if (!video || positionIsCode(tree, line.from)) continue;
    ranges.push(
      Decoration.widget({
        widget: new YouTubeWidget(video.id, video.label, video.embedUrl),
        block: true,
        side: 1,
      }).range(line.to),
    );
  }
  return Decoration.set(ranges, true);
}

const youtubeEmbedsField = StateField.define<DecorationSet>({
  create: buildYouTubeEmbeds,
  update(value, transaction) {
    return transaction.docChanged ? buildYouTubeEmbeds(transaction.state) : value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** Upgrade standalone portable YouTube links into privacy-enhanced players. */
export function youtubeEmbeds(): Extension {
  return youtubeEmbedsField;
}
