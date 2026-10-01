// Read mode — the editor as the one reading surface (SPEC: one parser).
//
// The same Lezer parse and live-preview layer the editor uses, with everything
// that makes it an editor taken away and the reader's blocks put in:
//
// - Syntax never reveals. Live preview reveals markup on the focused line and
//   wiki-links reveal where the editor's selection sits; a non-editable content
//   element cannot take focus, the editor's selection never moves, and a change
//   filter refuses every document change (a task checkbox, a table cell), so
//   nothing a click, a selection or the keyboard does can open a block.
// - Frontmatter is hidden, not shown as a panel. The title H1 can be hidden so
//   the host draws it as chrome with the byline beneath.
// - `![caption](path)` is a figure, two images in one paragraph a 2-up gallery,
//   a standalone YouTube link a poster that loads the player only on intent,
//   and a table a plain table — none of them editable.
// - Every block carries `data-block="b<n>"`, every heading its slug `id`.
// - Every link is a link to the keyboard and to assistive technology, and a
//   plain click or Enter follows it.
// - The whole document is rendered, not the viewport: anchors below the fold,
//   find-in-page and print all need the text in the DOM.

import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
  EditorState,
  Facet,
  StateField,
  type Extension,
  type Range,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";
import { blocksOf, frontmatterEnd, titleBlock, type NoteBlock, type NoteImage } from "./blocks.js";
import { youtubeVideo } from "./media.js";
import type { WikiLinkResolvedTarget } from "@atomic-editor/editor";

type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];

export interface ReadLinks {
  onLinkClick: (url: string) => void;
  onWikiOpen?: (target: string) => void;
  /** Whether a `[[target]]` exists, for its styling, and the label to show. */
  resolveWiki?: (target: string) => WikiLinkResolvedTarget | null;
  /** The URL a link points at, when the host has one: the link becomes a real
   *  `<a href>`, so it can open in a new tab and shows where it goes. */
  linkHref?: (url: string, wiki: boolean) => string | null | undefined;
}

const readLinksFacet = Facet.define<ReadLinks, ReadLinks>({
  combine: (values) => values[0] ?? { onLinkClick: () => undefined },
});

const hideTitleFacet = Facet.define<boolean, boolean>({
  combine: (values) => values.some(Boolean),
});

// ---- inline rendering for widgets ------------------------------------------

const SKIPPED_INLINE = new Set([
  "EmphasisMark",
  "CodeMark",
  "LinkMark",
  "LinkTitle",
  "LinkLabel",
  "StrikethroughMark",
  "TableDelimiter",
]);
const WIKI = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/gu;

// Every link the reader can follow is a real link to assistive technology and
// the keyboard. With a URL from the host it is an `<a href>`; without one (a
// local note, a missing target) it is a link by role and tab stop. One listener
// follows either; a modified click on an `<a href>` is left to the browser.
function linkAttributes(state: EditorState, to: { href?: string; wiki?: string }): Record<string, string> {
  const url = state.facet(readLinksFacet).linkHref?.(to.wiki ?? to.href ?? "", Boolean(to.wiki));
  const attributes: Record<string, string> = url ? { href: url } : { role: "link", tabindex: "0" };
  if (to.href) attributes["data-read-href"] = to.href;
  if (to.wiki) attributes["data-read-wiki"] = to.wiki;
  return attributes;
}

function linkElement(state: EditorState, to: { href?: string; wiki?: string }): HTMLElement {
  const attributes = linkAttributes(state, to);
  const element = document.createElement(attributes.href ? "a" : "span");
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

function wikiElement(state: EditorState, target: string, alias: string | undefined): HTMLElement {
  const resolved = state.facet(readLinksFacet).resolveWiki?.(target);
  const status = resolved === null ? "missing" : resolved?.status ?? "resolved";
  const link = linkElement(state, { wiki: target });
  link.className = `cm-atomic-wiki-link cm-atomic-wiki-link-${status}`;
  link.textContent = (alias ?? resolved?.label ?? target).trim();
  return link;
}

function appendText(state: EditorState, parent: HTMLElement, text: string): void {
  let last = 0;
  for (const match of text.matchAll(WIKI)) {
    const at = match.index ?? 0;
    if (at > last) parent.append(text.slice(last, at));
    parent.append(wikiElement(state, (match[1] ?? "").trim(), match[2]));
    last = at + match[0].length;
  }
  if (last < text.length) parent.append(text.slice(last));
}

/** Inline Lezer nodes as DOM — the same parse the editor decorates, read-only. */
function renderInline(state: EditorState, node: SyntaxNode, parent: HTMLElement): void {
  let cursor = node.from;
  const gap = (to: number) => {
    if (to > cursor) appendText(state, parent, state.doc.sliceString(cursor, to));
  };
  for (let child = node.firstChild; child; child = child.nextSibling) {
    gap(child.from);
    cursor = child.to;
    if (SKIPPED_INLINE.has(child.name)) continue;
    switch (child.name) {
      case "Escape":
        parent.append(state.doc.sliceString(child.from + 1, child.to));
        break;
      case "Emphasis":
      case "StrongEmphasis":
      case "Strikethrough": {
        const tag = child.name === "Emphasis" ? "em" : child.name === "StrongEmphasis" ? "strong" : "s";
        const element = document.createElement(tag);
        renderInline(state, child, element);
        parent.append(element);
        break;
      }
      case "InlineCode": {
        const code = document.createElement("code");
        code.className = "cm-atomic-inline-code";
        code.textContent = state.doc
          .sliceString(child.from, child.to)
          .replace(/^`+/u, "")
          .replace(/`+$/u, "")
          .trim();
        parent.append(code);
        break;
      }
      case "Link": {
        const url = child.getChild("URL");
        const link = linkElement(state, { href: url ? state.doc.sliceString(url.from, url.to) : undefined });
        link.className = "cm-atomic-link";
        const text = document.createElement("span");
        const labelEnd = child.getChildren("LinkMark")[1]?.from ?? child.to;
        const label = state.doc.sliceString(child.from + 1, labelEnd);
        text.textContent = label;
        link.append(text);
        parent.append(link);
        break;
      }
      case "Autolink":
      case "URL": {
        const raw = state.doc.sliceString(child.from, child.to).replace(/^<|>$/gu, "");
        const link = linkElement(state, { href: raw });
        link.className = "cm-atomic-link";
        link.textContent = raw;
        parent.append(link);
        break;
      }
      case "Image": {
        const match = /^!\[([^\]]*)\]\(\s*<?([^\s)>]+)/u.exec(state.doc.sliceString(child.from, child.to));
        if (match) parent.append(imageElement({ alt: match[1] ?? "", src: match[2] ?? "" }));
        break;
      }
      default:
        renderInline(state, child, parent);
    }
  }
  gap(node.to);
}

function imageElement(image: NoteImage): HTMLImageElement {
  const element = document.createElement("img");
  element.src = image.src;
  element.alt = image.alt;
  element.loading = "lazy";
  element.decoding = "async";
  return element;
}

// ---- block widgets ----------------------------------------------------------

abstract class ReadBlockWidget extends WidgetType {
  /** The first block the reader sees, which takes no gap above it. */
  lead = false;

  constructor(readonly block: NoteBlock) {
    super();
  }

  protected frame(_view: EditorView, tag: string, className: string): HTMLElement {
    const element = document.createElement(tag);
    element.className = `cm-is-block ${className}${this.lead ? " cm-is-lead" : ""}`;
    element.dataset.block = this.block.id;
    element.setAttribute("contenteditable", "false");
    return element;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class FigureWidget extends ReadBlockWidget {
  eq(other: FigureWidget): boolean {
    return other.block.id === this.block.id &&
      JSON.stringify(other.block.images) === JSON.stringify(this.block.images);
  }

  toDOM(view: EditorView): HTMLElement {
    const images = this.block.images ?? [];
    const gallery = this.block.kind === "gallery";
    const figure = this.frame(view, "figure", gallery ? "cm-is-figure cm-is-gallery" : "cm-is-figure");
    if (gallery) {
      const grid = document.createElement("div");
      grid.className = "cm-is-gallery-grid";
      for (const image of images) grid.append(imageElement(image));
      figure.append(grid);
    } else {
      for (const image of images) figure.append(imageElement(image));
    }
    const caption = images.map((image) => image.alt.trim()).find(Boolean);
    if (caption) {
      const element = document.createElement("figcaption");
      element.textContent = caption;
      figure.append(element);
    }
    return figure;
  }
}

class YouTubeReadWidget extends ReadBlockWidget {
  eq(other: YouTubeReadWidget): boolean {
    return other.block.id === this.block.id && other.block.youtube?.url === this.block.youtube?.url;
  }

  toDOM(view: EditorView): HTMLElement {
    const figure = this.frame(view, "figure", "cm-is-figure cm-is-youtube");
    const source = this.block.youtube;
    const video = source ? youtubeVideo(source.url) : null;
    if (!source || !video) return figure;

    // No third-party player before intent: a poster and a play button, swapped
    // for the privacy-enhanced iframe on click.
    const play = document.createElement("button");
    play.type = "button";
    play.className = "cm-is-youtube-poster";
    play.setAttribute("aria-label", `Play ${source.label}`);
    const poster = document.createElement("img");
    poster.src = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
    // Not a note asset: keep the host's image resolver away from it.
    poster.setAttribute("data-ideaspaces-image-source", poster.src);
    poster.alt = "";
    poster.loading = "lazy";
    const mark = document.createElement("span");
    mark.className = "cm-is-youtube-play";
    mark.setAttribute("aria-hidden", "true");
    play.append(poster, mark);
    play.addEventListener("click", () => {
      const frame = document.createElement("div");
      frame.className = "cm-ideaspaces-youtube-frame";
      const iframe = document.createElement("iframe");
      const embed = new URL(video.embedUrl);
      embed.searchParams.set("autoplay", "1");
      iframe.src = embed.toString();
      iframe.title = source.label;
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share";
      iframe.allowFullscreen = true;
      frame.append(iframe);
      play.replaceWith(frame);
    });

    const caption = document.createElement("figcaption");
    caption.append(source.label, " ");
    const external = linkElement(view.state, { href: video.canonicalUrl });
    external.className = "cm-is-youtube-source";
    external.textContent = "YouTube ↗";
    caption.append(external);
    figure.append(play, caption);
    return figure;
  }
}

function tableAlignments(state: EditorState, table: SyntaxNode): Array<string | null> {
  const delimiter = table.getChildren("TableDelimiter").find((node) =>
    state.doc.sliceString(node.from, node.to).includes("-"));
  if (!delimiter) return [];
  return state.doc
    .sliceString(delimiter.from, delimiter.to)
    .replace(/^\s*\|/u, "")
    .replace(/\|\s*$/u, "")
    .split("|")
    .map((cell) => {
      const value = cell.trim();
      if (value.startsWith(":") && value.endsWith(":")) return "center";
      if (value.endsWith(":")) return "right";
      if (value.startsWith(":")) return "left";
      return null;
    });
}

class TableReadWidget extends ReadBlockWidget {
  constructor(block: NoteBlock, readonly source: string) {
    super(block);
  }

  eq(other: TableReadWidget): boolean {
    return other.block.id === this.block.id && other.source === this.source;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = this.frame(view, "div", "cm-is-table");
    const state = view.state;
    const tree = ensureSyntaxTree(state, this.block.to, 200) ?? syntaxTree(state);
    let table: SyntaxNode | null = tree.resolveInner(this.block.from, 1);
    while (table && table.name !== "Table") table = table.parent;
    if (!table) {
      wrap.textContent = this.source;
      return wrap;
    }
    const aligns = tableAlignments(state, table);
    const element = document.createElement("table");
    const body = document.createElement("tbody");
    for (let row = table.firstChild; row; row = row.nextSibling) {
      if (row.name !== "TableHeader" && row.name !== "TableRow") continue;
      const header = row.name === "TableHeader";
      const tr = document.createElement("tr");
      row.getChildren("TableCell").forEach((cell, index) => {
        const td = document.createElement(header ? "th" : "td");
        const align = aligns[index];
        if (align) td.style.textAlign = align;
        renderInline(state, cell, td);
        tr.append(td);
      });
      if (header) {
        const head = document.createElement("thead");
        head.append(tr);
        element.append(head);
      } else {
        body.append(tr);
      }
    }
    element.append(body);
    wrap.append(element);
    return wrap;
  }
}

class InlineImagesWidget extends ReadBlockWidget {
  constructor(block: NoteBlock, readonly images: NoteImage[]) {
    super(block);
  }

  eq(other: InlineImagesWidget): boolean {
    return other.block.id === this.block.id && JSON.stringify(other.images) === JSON.stringify(this.images);
  }

  toDOM(view: EditorView): HTMLElement {
    const figure = this.frame(view, "div", "cm-is-figure cm-is-inline-images");
    figure.removeAttribute("data-block");
    for (const image of this.images) figure.append(imageElement(image));
    return figure;
  }
}

// ---- decorations ------------------------------------------------------------

function inlineImages(state: EditorState, block: NoteBlock): NoteImage[] {
  const images: NoteImage[] = [];
  const tree = syntaxTree(state);
  tree.iterate({
    from: block.from,
    to: block.to,
    enter(node) {
      if (node.name === "Table") return false;
      if (node.name !== "Image") return;
      const match = /^!\[([^\]]*)\]\(\s*<?([^\s)>]+)/u.exec(state.doc.sliceString(node.from, node.to));
      if (match) images.push({ alt: match[1] ?? "", src: match[2] ?? "" });
      return false;
    },
  });
  return images;
}

class WikiReadWidget extends WidgetType {
  constructor(readonly target: string, readonly alias: string | undefined) {
    super();
  }

  eq(other: WikiReadWidget): boolean {
    return other.target === this.target && other.alias === this.alias;
  }

  toDOM(view: EditorView): HTMLElement {
    return wikiElement(view.state, this.target, this.alias);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function insideCode(state: EditorState, pos: number): boolean {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    if (/Code/u.test(node.name)) return true;
  }
  return false;
}

// Links in running text: a Markdown link keeps its rendered label and becomes
// a link to the keyboard and assistive technology; a `[[wiki-link]]` becomes
// one element in place of its source, so nothing of the source is left to read.
function textLinks(state: EditorState, block: NoteBlock, ranges: Range<Decoration>[]): void {
  syntaxTree(state).iterate({
    from: block.from,
    to: block.to,
    enter(node) {
      if (node.name === "Image" || /Code/u.test(node.name)) return false;
      if (node.name !== "Link" && node.name !== "Autolink" && !(node.name === "URL" && node.node.parent?.name !== "Link")) return;
      const url = node.name === "URL" ? node.node : node.node.getChild("URL");
      if (!url || node.from >= node.to) return false;
      const href = state.doc.sliceString(url.from, url.to).replace(/^<|>$/gu, "");
      const attributes = linkAttributes(state, { href });
      ranges.push(Decoration.mark({
        tagName: attributes.href ? "a" : "span",
        attributes,
      }).range(node.from, node.to));
      return false;
    },
  });
  const text = state.doc.sliceString(block.from, block.to);
  for (const match of text.matchAll(WIKI)) {
    const from = block.from + (match.index ?? 0);
    const to = from + match[0].length;
    if (insideCode(state, from)) continue;
    const widget = new WikiReadWidget((match[1] ?? "").trim(), match[2]);
    ranges.push(Decoration.replace({ widget }).range(from, to));
  }
}

interface ReadLayout {
  blocks: NoteBlock[];
  decorations: DecorationSet;
}

function buildLayout(state: EditorState): ReadLayout {
  const blocks = blocksOf(state);
  const ranges: Range<Decoration>[] = [];
  const doc = state.doc;

  const fmEnd = frontmatterEnd(state);
  if (fmEnd > 0) {
    // Through the closing fence's line end; the newline after it stays a line.
    const end = fmEnd === doc.length ? doc.length : fmEnd - 1;
    ranges.push(Decoration.replace({ block: true }).range(0, end));
  }

  const title = state.facet(hideTitleFacet) ? titleBlock(blocks) : undefined;
  let lead = true;
  const widget = (block: NoteBlock, made: ReadBlockWidget) => {
    made.lead = lead;
    lead = false;
    ranges.push(Decoration.replace({ widget: made, block: true }).range(block.from, block.to));
  };
  for (const block of blocks) {
    if (block === title) {
      ranges.push(Decoration.replace({ block: true }).range(block.from, block.to));
      continue;
    }
    if (block.kind === "image" || block.kind === "gallery") {
      widget(block, new FigureWidget(block));
      continue;
    }
    if (block.kind === "youtube") {
      widget(block, new YouTubeReadWidget(block));
      continue;
    }
    if (block.kind === "table") {
      widget(block, new TableReadWidget(block, doc.sliceString(block.from, block.to)));
      continue;
    }

    const first = doc.lineAt(block.from);
    const last = doc.lineAt(block.to);
    const fenced = block.kind === "code" && /^\s{0,3}(?:```|~~~)/u.test(first.text);
    for (let number = first.number; number <= last.number; number += 1) {
      const line = doc.line(number);
      const attributes: Record<string, string> = { "data-block": block.id };
      if (number === first.number && block.slug) attributes.id = block.slug;
      // A heading line is a heading to assistive technology, not a div of text.
      if (number === first.number && block.kind === "heading") {
        attributes.role = "heading";
        attributes["aria-level"] = String(block.level ?? 2);
      }
      const classes = ["cm-is-block"];
      if (number === first.number) classes.push(lead ? "cm-is-block-start cm-is-lead" : "cm-is-block-start");
      // The fences are hidden markup; their lines only round the box.
      if (fenced && (number === first.number || (number === last.number && /^\s{0,3}(?:```|~~~)/u.test(line.text)))) {
        classes.push("cm-is-fence");
      }
      ranges.push(Decoration.line({ class: classes.join(" "), attributes }).range(line.from));
    }
    lead = false;
    if (block.kind !== "code" && block.kind !== "html") textLinks(state, block, ranges);

    if (block.kind === "paragraph") {
      const images = inlineImages(state, block);
      if (images.length) {
        ranges.push(Decoration.widget({ widget: new InlineImagesWidget(block, images), block: true, side: 1 }).range(block.to));
      }
    }
  }

  return { blocks, decorations: Decoration.set(ranges, true) };
}

const readLayoutField = StateField.define<ReadLayout>({
  create: buildLayout,
  update(layout, transaction) {
    return transaction.docChanged ? buildLayout(transaction.state) : layout;
  },
  provide: (field) => EditorView.decorations.from(field, (layout) => layout.decorations),
});

/** The blocks the read mode published for this state (empty outside read mode). */
export function readBlocks(state: EditorState): NoteBlock[] {
  return state.field(readLayoutField, false)?.blocks ?? [];
}

// ---- behaviour --------------------------------------------------------------

// Render every line, not only those near the viewport. CodeMirror does exactly
// this while printing (`viewState.printing`); read mode keeps that state on.
// If a CodeMirror upgrade moves the flag, the reader degrades to the viewport
// rather than failing — the read-mode proof checks the last block is in the DOM.
interface PrintableViewState {
  printing?: boolean;
}

const renderWholeDocument = ViewPlugin.fromClass(class {
  constructor(readonly view: EditorView) {
    this.hold();
  }

  update(): void {
    this.hold();
  }

  private hold(): void {
    const state = (this.view as unknown as { viewState?: PrintableViewState }).viewState;
    if (!state || typeof state.printing !== "boolean" || state.printing) return;
    state.printing = true;
    this.view.requestMeasure();
  }
});

// Follow a link on a plain click or on Enter — any link, anywhere in the note,
// widgets included (their events bubble here; CodeMirror ignores them).
const followLinks = ViewPlugin.fromClass(class {
  constructor(readonly view: EditorView) {
    view.contentDOM.addEventListener("click", this.onClick);
    view.contentDOM.addEventListener("keydown", this.onKey);
  }

  destroy(): void {
    this.view.contentDOM.removeEventListener("click", this.onClick);
    this.view.contentDOM.removeEventListener("keydown", this.onKey);
  }

  readonly onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (this.follow(event.target)) event.preventDefault();
  };

  readonly onKey = (event: KeyboardEvent) => {
    if (event.key !== "Enter" || event.defaultPrevented) return;
    // Enter on an `<a href>` already arrives as a click.
    if (event.target instanceof Element && event.target.closest("a[href]")) return;
    if (this.follow(event.target)) event.preventDefault();
  };

  private follow(target: EventTarget | null): boolean {
    const element = target instanceof Element ? target.closest<HTMLElement>("[data-read-wiki], [data-read-href]") : null;
    if (!element || !this.view.contentDOM.contains(element)) return false;
    const links = this.view.state.facet(readLinksFacet);
    const wiki = element.getAttribute("data-read-wiki");
    const href = element.getAttribute("data-read-href");
    if (wiki) {
      links.onWikiOpen?.(wiki);
      return true;
    }
    if (href) {
      links.onLinkClick(href);
      return true;
    }
    return false;
  }
});

export interface ReadModeOptions extends ReadLinks {
  /** Hide the first H1: the host draws it as the title, with the byline beneath. */
  hideTitle?: boolean;
}

/** Everything read mode adds on top of the shared parse and live preview. */
export function readMode(options: ReadModeOptions): Extension[] {
  return [
    readLinksFacet.of({
      onLinkClick: options.onLinkClick,
      onWikiOpen: options.onWikiOpen,
      resolveWiki: options.resolveWiki,
      linkHref: options.linkHref,
    }),
    hideTitleFacet.of(options.hideTitle ?? false),
    readLayoutField,
    renderWholeDocument,
    followLinks,
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    // Nothing changes the document while reading — not a task checkbox, not a
    // stray widget dispatch.
    EditorState.changeFilter.of(() => false),
    // Nor the selection: wiki-links reveal their `[[…]]` when the editor's
    // selection enters them, focused or not. The reader's own selection is the
    // browser's, which copying and quoting use; the editor's stays put.
    EditorState.transactionFilter.of((transaction) =>
      transaction.selection ? { effects: transaction.effects } : transaction),
    EditorView.contentAttributes.of({ role: "article", "aria-readonly": "true" }),
  ];
}
