// Public surface of @ideaspaces/editor — the shared note editor and the
// frontmatter helpers both apps use. The wiki index, link resolution, and the
// host's IO (read/write, API vs clone) stay in each app and are injected via
// props/callbacks — this package is pure, presentational, and IO-free.
export { NoteEditor } from "./NoteEditor.js";
export { noteEditorExtensions } from "./extensions.js";
export {
  parseFrontmatter,
  setFrontmatterName,
  bodyStartOffset,
  type FrontmatterField,
  type ParsedFrontmatter,
} from "./frontmatter.js";
