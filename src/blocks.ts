// The note's block list — the anchor contract the reading surface publishes.
//
// Every top-level block of the body gets `b<n>`, its index in the parsed file
// (SPEC: `data-block="b<n>"`, addressed as `{path, sha, block, quote}`). Every
// heading also gets a slug id, disambiguated `-1`, `-2` in source order the way
// GitHub (and the web's section chips) do. Leading frontmatter is not a block.
//
// Pure over an EditorState, so a host can compute the same list without a view
// (`noteBlocks(markdown)`) and the read mode decorates exactly what it reports.

import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { parseFrontmatter } from "./frontmatter.js";

type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];

export type NoteBlockKind =
  | "heading"
  | "paragraph"
  | "image"
  | "gallery"
  | "youtube"
  | "list"
  | "quote"
  | "code"
  | "rule"
  | "table"
  | "html"
  | "other";

export interface NoteImage {
  alt: string;
  src: string;
}

export interface NoteBlock {
  /** `b<n>` — index among the body's top-level blocks. */
  id: string;
  index: number;
  kind: NoteBlockKind;
  /** Document offsets of the block, end exclusive of the trailing newline. */
  from: number;
  to: number;
  /** 1–6 for headings. */
  level?: number;
  /** Plain heading text (inline syntax removed). */
  text?: string;
  /** Unique slug id for headings. */
  slug?: string;
  /** Images of an image or gallery block, in order. */
  images?: NoteImage[];
  /** The authored link of a standalone YouTube paragraph. */
  youtube?: { label: string; url: string };
}

const HEADING = /^(?:ATXHeading|SetextHeading)([1-6])$/u;
const IMAGE_SOURCE = /^!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?(?:\s+["'][^)]*["'])?\s*\)$/u;
const STANDALONE_LINK = /^\s*\[((?:\\.|[^\\\]])+)\]\((https?:\/\/[^\s)]+)\)\s*$/u;
const YOUTUBE_HOST = /^(?:www\.|m\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be)$/iu;

/**
 * Slug for a heading: lowercase, word characters, spaces to hyphens. The same
 * function the web's section chips used, so existing `#anchors` keep landing.
 */
export function headingSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/gu, "")
    .replace(/\s+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

/** Inline Markdown flattened to the words a reader sees. */
export function plainInline(source: string): string {
  return source
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/gu, (_m, target: string, alias?: string) => alias ?? target)
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/(\*\*|__)(.+?)\1/gu, "$2")
    .replace(/(\*|_)(.+?)\1/gu, "$2")
    .replace(/~~(.+?)~~/gu, "$1")
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/\\([\\`*_{}[\]()#+\-.!|~])/gu, "$1")
    .trim();
}

/** Offset of the first body character: past leading frontmatter, if any. */
export function frontmatterEnd(state: EditorState): number {
  const head = state.doc.sliceString(0, Math.min(state.doc.length, 4096));
  const fm = parseFrontmatter(head);
  if (!fm) return 0;
  return fm.endLine < state.doc.lines
    ? state.doc.line(fm.endLine + 1).from
    : state.doc.length;
}

function headingText(state: EditorState, node: SyntaxNode): string {
  let raw = state.doc.sliceString(node.from, node.to);
  if (node.name.startsWith("ATX")) {
    raw = raw.replace(/^\s{0,3}#{1,6}[ \t]*/u, "").replace(/[ \t]+#+[ \t]*$/u, "");
  } else {
    raw = raw.replace(/\n[ \t]*[=-]+[ \t]*$/u, "");
  }
  return plainInline(raw.replace(/\s+/gu, " "));
}

function imagesOnly(state: EditorState, node: SyntaxNode): NoteImage[] | null {
  const images: NoteImage[] = [];
  let cursor = node.from;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name !== "Image") return null;
    if (state.doc.sliceString(cursor, child.from).trim()) return null;
    const match = IMAGE_SOURCE.exec(state.doc.sliceString(child.from, child.to));
    if (!match) return null;
    images.push({ alt: match[1] ?? "", src: match[2] ?? "" });
    cursor = child.to;
  }
  if (state.doc.sliceString(cursor, node.to).trim()) return null;
  return images.length ? images : null;
}

function standaloneYouTube(text: string): { label: string; url: string } | null {
  const match = STANDALONE_LINK.exec(text);
  if (!match) return null;
  const label = (match[1] ?? "").replace(/\\([\\[\]])/gu, "$1").trim();
  const url = match[2] ?? "";
  try {
    if (!label || !YOUTUBE_HOST.test(new URL(url).hostname)) return null;
  } catch {
    return null;
  }
  return { label, url };
}

function kindOf(name: string): NoteBlockKind {
  if (HEADING.test(name)) return "heading";
  switch (name) {
    case "Paragraph":
      return "paragraph";
    case "BulletList":
    case "OrderedList":
      return "list";
    case "Blockquote":
      return "quote";
    case "FencedCode":
    case "CodeBlock":
      return "code";
    case "HorizontalRule":
      return "rule";
    case "Table":
      return "table";
    case "HTMLBlock":
    case "CommentBlock":
    case "ProcessingInstructionBlock":
      return "html";
    default:
      return "other";
  }
}

/** The body's top-level blocks, numbered, with heading slugs. */
export function blocksOf(state: EditorState): NoteBlock[] {
  const tree = ensureSyntaxTree(state, state.doc.length, 500) ?? syntaxTree(state);
  const start = frontmatterEnd(state);
  const slugCounts = new Map<string, number>();
  const blocks: NoteBlock[] = [];

  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.to <= start || node.from < start) continue;
    if (node.name === "LinkReference") continue;
    const block: NoteBlock = {
      id: `b${blocks.length}`,
      index: blocks.length,
      kind: kindOf(node.name),
      from: node.from,
      to: node.to,
    };
    const heading = HEADING.exec(node.name);
    if (heading) {
      block.level = Number(heading[1]);
      block.text = headingText(state, node);
      const base = headingSlug(block.text);
      if (base) {
        const seen = slugCounts.get(base) ?? 0;
        slugCounts.set(base, seen + 1);
        block.slug = seen > 0 ? `${base}-${seen}` : base;
      }
    } else if (node.name === "Paragraph") {
      const images = imagesOnly(state, node);
      const youtube = images ? null : standaloneYouTube(state.doc.sliceString(node.from, node.to));
      if (images) {
        block.kind = images.length === 2 ? "gallery" : "image";
        block.images = images;
      } else if (youtube) {
        block.kind = "youtube";
        block.youtube = youtube;
      }
    }
    blocks.push(block);
  }
  return blocks;
}

/** The first H1 of the body — the note's title in the reading surface. */
export function titleBlock(blocks: NoteBlock[]): NoteBlock | undefined {
  return blocks.find((block) => block.kind === "heading" && block.level === 1);
}

/** Parse Markdown into its block list without a view (hosts, tests, servers). */
export function noteBlocks(source: string): NoteBlock[] {
  const state = EditorState.create({
    doc: source,
    extensions: [markdown({ base: markdownLanguage })],
  });
  return blocksOf(state);
}
