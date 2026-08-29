// Public surface of @ideaspaces/editor — the shared note editor and the
// frontmatter helpers both apps use. The wiki index, link resolution, and the
// host's IO (read/write, API vs clone) stay in each app and are injected via
// props/callbacks — this package is pure, presentational, and IO-free.
export { NoteEditor } from "./NoteEditor.js";
export { noteEditorExtensions } from "./extensions.js";
export type {
  MarkdownLinkSuggestion,
  SuggestMarkdownLinks,
} from "./completions.js";
export {
  storedImageMarkdown,
  type MarkdownImageAsset,
  type StoredMarkdownImage,
  type StoreMarkdownImage,
} from "./imageAssets.js";
export {
  imageDescription,
  isImageUrl,
  visualUrlInsertion,
  youtubeVideo,
  type VisualUrlInsertion,
  type YouTubeVideo,
} from "./media.js";
export {
  youtubeMarkdownLink,
  type YouTubeMarkdownLink,
} from "./youtubeEmbeds.js";
export {
  parseFrontmatter,
  setFrontmatterName,
  bodyStartOffset,
  type FrontmatterField,
  type ParsedFrontmatter,
} from "./frontmatter.js";
