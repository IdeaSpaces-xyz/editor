import { describe, expect, it } from "vitest";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { readBlocks, readMode } from "./readMode.js";

function readState(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage }), readMode({ onLinkClick: () => undefined, hideTitle: true })],
  });
}

describe("read mode", () => {
  it("refuses every document change, a task checkbox included", () => {
    const state = readState("- [ ] open task\n");
    const next = state.update({ changes: { from: 2, to: 5, insert: "[x]" } }).state;
    expect(next.doc.toString()).toBe("- [ ] open task\n");
  });

  it("keeps the editor's selection where it is, so no wiki-link reveals", () => {
    const state = readState("See [[Target]] here.");
    const next = state.update({ selection: { anchor: 6 } }).state;
    expect(next.selection.main.head).toBe(0);
  });

  it("publishes the blocks it decorates", () => {
    expect(readBlocks(readState("# Title\n\nBody")).map((block) => block.id)).toEqual(["b0", "b1"]);
  });
});
