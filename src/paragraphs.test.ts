import { describe, expect, it } from "vitest";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState } from "@codemirror/state";
import { markdownParagraphBreak } from "./paragraphs.js";

function state(doc: string, anchor = doc.length, extensions: Parameters<typeof EditorState.create>[0]["extensions"] = []) {
  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(anchor),
    extensions: [markdown({ base: markdownLanguage }), extensions],
  });
}

function apply(doc: string, anchor = doc.length): { doc: string; anchor: number } {
  const before = state(doc, anchor);
  const spec = markdownParagraphBreak(before);
  expect(spec).not.toBeNull();
  const after = before.update(spec!).state;
  return {
    doc: after.doc.toString(),
    anchor: after.selection.main.head,
  };
}

describe("Markdown paragraph breaks", () => {
  it("makes Enter one consistent blank-line-delimited paragraph break", () => {
    expect(apply("First paragraph")).toEqual({
      doc: "First paragraph\n\n",
      anchor: 17,
    });
    expect(apply("First second", 5)).toEqual({
      doc: "First\n\n second",
      anchor: 7,
    });
    expect(apply("## Heading")).toEqual({
      doc: "## Heading\n\n",
      anchor: 12,
    });
  });

  it("leaves structured Markdown to its native Enter behavior", () => {
    const fixtures: Array<[string, number?]> = [
      ["- list item"],
      ["1. ordered item"],
      ["- [ ] task"],
      ["> quotation"],
      ["```js\ncode\n```", 10],
      ["    indented code"],
      ["| a | b |\n| --- | --- |\n| c | d |", 32],
    ];

    for (const [doc, anchor = doc.length] of fixtures) {
      expect(markdownParagraphBreak(state(doc, anchor)), doc).toBeNull();
    }
  });

  it("uses native replacement behavior for blanks, selections, and read-only views", () => {
    expect(markdownParagraphBreak(state("Paragraph\n\n"))).toBeNull();

    const selected = EditorState.create({
      doc: "selected prose",
      selection: { anchor: 0, head: 8 },
      extensions: markdown({ base: markdownLanguage }),
    });
    expect(markdownParagraphBreak(selected)).toBeNull();

    const readOnly = state("Paragraph", 9, EditorState.readOnly.of(true));
    expect(markdownParagraphBreak(readOnly)).toBeNull();
  });
});
