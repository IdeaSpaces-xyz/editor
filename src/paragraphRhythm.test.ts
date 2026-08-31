import { describe, expect, it } from "vitest";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { markdownParagraphLayout } from "./paragraphRhythm.js";

function layout(doc: string) {
  const state = EditorState.create({
    doc,
    extensions: markdown({ base: markdownLanguage }),
  });
  return markdownParagraphLayout(state);
}

describe("Markdown paragraph rhythm", () => {
  it("projects one CommonMark paragraph delimiter into one visual gap", () => {
    expect(layout("First paragraph\n\nSecond paragraph")).toEqual([
      {
        endLineFrom: 0,
        separatorLineFrom: [16],
        beforeHeading: false,
      },
    ]);
  });

  it("does not mistake a soft newline for a paragraph boundary", () => {
    expect(layout("First line\nsoft continuation")).toEqual([]);
  });

  it("keeps the trailing empty input line out of the collapsed delimiter", () => {
    expect(layout("Paragraph\n\n")).toEqual([
      {
        endLineFrom: 0,
        separatorLineFrom: [10],
        beforeHeading: false,
      },
    ]);
  });

  it("collapses repeated source separators into the same single rhythm", () => {
    expect(layout("One\n\n\nTwo")).toEqual([
      {
        endLineFrom: 0,
        separatorLineFrom: [4, 5],
        beforeHeading: false,
      },
    ]);
  });

  it("lets a following heading own the section spacing", () => {
    expect(layout("Paragraph\n\n## Heading")).toEqual([
      {
        endLineFrom: 0,
        separatorLineFrom: [10],
        beforeHeading: true,
      },
    ]);
    expect(layout("Paragraph\n\nHeading\n-------")).toEqual([
      {
        endLineFrom: 0,
        separatorLineFrom: [10],
        beforeHeading: true,
      },
    ]);
  });

  it("does not impose prose margins inside list structure", () => {
    expect(layout("- First item\n\n- Second item")).toEqual([]);
  });
});
