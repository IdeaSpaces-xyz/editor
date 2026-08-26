import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it, vi } from "vitest";
import {
  markdownLinkCompletionSource,
  markdownLinkQuery,
  markdownLinkReplacement,
  markdownLinkText,
  taskMarkerInsertion,
} from "./completions";

function state(doc: string): EditorState {
  return EditorState.create({ doc });
}

describe("Markdown link completion", () => {
  it("recognizes a [[ trigger and keeps only the typed Note query filterable", () => {
    const editor = state("See [[client arc");

    expect(markdownLinkQuery(editor, editor.doc.length)).toEqual({
      from: 6,
      to: 16,
      query: "client arc",
    });
    expect(markdownLinkQuery(state("See [client"), 11)).toBeNull();
  });

  it("asks the host for suggestions and exposes names with path context", async () => {
    const suggest = vi.fn(async () => [
      { label: "Client architecture", detail: "architecture/desktop", target: "../desktop.md" },
    ]);
    const editor = state("[[client");
    const result = await markdownLinkCompletionSource(suggest)(
      new CompletionContext(editor, editor.doc.length, false),
    );

    expect(suggest).toHaveBeenCalledWith("client");
    expect(result?.from).toBe(2);
    expect(result?.options).toMatchObject([
      { label: "Client architecture", detail: "architecture/desktop", type: "text" },
    ]);
  });

  it("dismisses suggestions when the host search is unavailable", async () => {
    const editor = state("[[client");
    const result = await markdownLinkCompletionSource(async () => {
      throw new Error("index unavailable");
    })(new CompletionContext(editor, editor.doc.length, false));

    expect(result).toBeNull();
  });

  it("replaces the trigger and auto-closing brackets with portable Markdown", () => {
    const editor = state("See [[client]] next");
    const replacement = markdownLinkReplacement(editor, 6, 12, {
      label: "Client architecture",
      target: "../architecture/client.md",
    });

    expect(replacement).toEqual({
      from: 4,
      to: 14,
      insert: "[Client architecture](../architecture/client.md)",
    });
  });

  it("escapes link labels and encodes spaces, Unicode, parentheses, and fragments", () => {
    expect(markdownLinkText({
      label: "Plan [draft]",
      target: "../Product notes/測試 (draft).md#Today",
    })).toBe(
      "[Plan \\[draft\\]](../Product%20notes/%E6%B8%AC%E8%A9%A6%20%28draft%29.md%23Today)",
    );
  });
});

describe("task marker completion", () => {
  it("completes a bullet followed by [ into a valid unchecked task", () => {
    const editor = state("  - ");
    expect(taskMarkerInsertion(editor, 4, 4, "[")).toEqual({
      from: 4,
      to: 4,
      insert: "[ ] ",
      anchor: 8,
    });
  });

  it("does not rewrite brackets in prose, selections, or read-only input events", () => {
    expect(taskMarkerInsertion(state("See "), 4, 4, "[")).toBeNull();
    expect(taskMarkerInsertion(state("- selected"), 2, 8, "[")).toBeNull();
    expect(taskMarkerInsertion(state("- "), 2, 2, "]")).toBeNull();
  });
});
