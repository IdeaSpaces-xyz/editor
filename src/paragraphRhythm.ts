import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

export interface ParagraphLayout {
  endLineFrom: number;
  separatorLineFrom: number[];
  beforeHeading: boolean;
}

/**
 * Project CommonMark paragraph structure into CodeMirror line coordinates.
 *
 * The blank source line remains the portable paragraph delimiter, but the UI
 * collapses that delimiter and applies the same 1.2em paragraph rhythm as the
 * rendered Space reader. A trailing empty input line is never collapsed.
 */
export function markdownParagraphLayout(state: EditorState): ParagraphLayout[] {
  const layout: ParagraphLayout[] = [];
  const doc = state.doc;

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "Paragraph" || node.node.parent?.name !== "Document") return;

      const endLine = doc.lineAt(node.to);
      const blankLines: number[] = [];
      let lineNumber = endLine.number + 1;
      while (lineNumber <= doc.lines) {
        const line = doc.line(lineNumber);
        if (line.text.trim()) break;
        blankLines.push(line.from);
        lineNumber += 1;
      }

      // At EOF, the last empty line is the next paragraph's insertion point,
      // not a delimiter. Keep it measurable and visible to the caret.
      const separators = lineNumber > doc.lines
        ? blankLines.slice(0, -1)
        : blankLines;
      if (separators.length === 0) return;

      const nextBlock = node.node.nextSibling?.name ?? "";
      layout.push({
        endLineFrom: endLine.from,
        separatorLineFrom: separators,
        beforeHeading: nextBlock.startsWith("ATXHeading") || nextBlock.startsWith("SetextHeading"),
      });
    },
  });

  return layout;
}

function paragraphDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const paragraph of markdownParagraphLayout(state)) {
    if (!paragraph.beforeHeading) {
      builder.add(
        paragraph.endLineFrom,
        paragraph.endLineFrom,
        Decoration.line({ class: "cm-ideaspaces-paragraph-end" }),
      );
    }
    for (const separator of paragraph.separatorLineFrom) {
      builder.add(
        separator,
        separator,
        Decoration.line({ class: "cm-ideaspaces-paragraph-separator" }),
      );
    }
  }
  return builder.finish();
}

const paragraphRhythmField = StateField.define<DecorationSet>({
  create: paragraphDecorations,
  update(value, transaction) {
    return transaction.docChanged || transaction.reconfigured
      ? paragraphDecorations(transaction.state)
      : value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const paragraphRhythm: Extension = paragraphRhythmField;
