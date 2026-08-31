import { syntaxTree } from "@codemirror/language";
import { EditorSelection, type EditorState, type TransactionSpec } from "@codemirror/state";
import type { Command } from "@codemirror/view";

const STRUCTURED_BLOCKS = new Set([
  "Blockquote",
  "BulletList",
  "CodeBlock",
  "FencedCode",
  "ListItem",
  "OrderedList",
  "Table",
]);

/**
 * Return one portable Markdown paragraph break for ordinary prose.
 *
 * Structured blocks retain CodeMirror's Markdown-specific Enter behavior:
 * lists continue or exit, quotes retain their marker, tables navigate, and
 * code receives a literal newline. Shift+Enter remains the explicit soft line
 * break. A selection also falls back to the native replacement behavior.
 */
export function markdownParagraphBreak(state: EditorState): TransactionSpec | null {
  if (state.readOnly || state.selection.ranges.some((range) => !range.empty)) return null;

  for (const range of state.selection.ranges) {
    const line = state.doc.lineAt(range.head);
    if (!line.text.trim() || isStructuredBlock(state, range.head, line.text)) return null;
  }

  return state.changeByRange((range) => ({
    changes: { from: range.head, insert: "\n\n" },
    range: EditorSelection.cursor(range.head + 2),
  }));
}

export const insertMarkdownParagraph: Command = ({ state, dispatch }) => {
  const paragraph = markdownParagraphBreak(state);
  if (!paragraph) return false;
  dispatch(state.update({
    ...paragraph,
    scrollIntoView: true,
    userEvent: "input",
  }));
  return true;
};

function isStructuredBlock(state: EditorState, position: number, line: string): boolean {
  if (/^\s*(?:[-+*]|\d+[.)])\s/u.test(line) || /^\s*>/u.test(line)) return true;

  let node = syntaxTree(state).resolveInner(position, -1);
  while (true) {
    if (STRUCTURED_BLOCKS.has(node.name)) return true;
    const parent = node.parent;
    if (!parent) break;
    node = parent;
  }
  return false;
}
