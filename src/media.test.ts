import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  imageDescription,
  isImageUrl,
  visualUrlInsertion,
  youtubeVideo,
} from "./media";

function state(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown()] });
}

describe("visual URL authoring", () => {
  it("turns an image URL into portable Markdown and selects the derived description", () => {
    const editor = state("");

    expect(visualUrlInsertion(
      editor,
      0,
      0,
      "https://cdn.example.test/Architecture%20diagram.png?width=1600",
    )).toEqual({
      from: 0,
      to: 0,
      insert: "![Architecture diagram](https://cdn.example.test/Architecture%20diagram.png?width=1600)",
      anchor: 2,
      head: 22,
      kind: "image",
    });
  });

  it("keeps a pasted image on its own line and makes description replacement safe", () => {
    const editor = state("# Existing heading");
    const insertion = visualUrlInsertion(
      editor,
      0,
      0,
      "https://example.test/diagram.png",
    )!;
    const pasted = editor.update({
      changes: { from: insertion.from, to: insertion.to, insert: insertion.insert },
      selection: { anchor: insertion.anchor, head: insertion.head },
    }).state;
    const replaced = pasted.update({
      changes: {
        from: pasted.selection.main.from,
        to: pasted.selection.main.to,
        insert: "System boundary",
      },
    }).state;

    expect(pasted.doc.toString()).toBe(
      "![Diagram](https://example.test/diagram.png)\n\n# Existing heading",
    );
    expect(replaced.doc.toString()).toBe(
      "![System boundary](https://example.test/diagram.png)\n\n# Existing heading",
    );
  });

  it("recognizes browser-renderable image paths without guessing from arbitrary URLs", () => {
    expect(isImageUrl("https://example.test/photo.JPEG?size=large")).toBe(true);
    expect(isImageUrl("https://example.test/download?id=photo.png")).toBe(false);
    expect(imageDescription("https://example.test/team_offsite.webp")).toBe("Team offsite");
  });

  it("canonicalizes watch, share, Shorts, live, and embed YouTube URLs", () => {
    for (const value of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5",
      "https://youtu.be/dQw4w9WgXcQ?si=abc",
      "https://youtube.com/shorts/dQw4w9WgXcQ",
      "https://youtube.com/live/dQw4w9WgXcQ",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    ]) {
      expect(youtubeVideo(value)).toEqual({
        id: "dQw4w9WgXcQ",
        canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      });
    }
    expect(youtubeVideo("https://notyoutube.example/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  it("puts a YouTube link on its own line and selects its portable label", () => {
    const editor = state("Before");
    const insertion = visualUrlInsertion(
      editor,
      editor.doc.length,
      editor.doc.length,
      "https://youtu.be/dQw4w9WgXcQ",
    );

    expect(insertion).toEqual({
      from: 6,
      to: 6,
      insert: "\n\n[YouTube video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)",
      anchor: 9,
      head: 22,
      kind: "youtube",
    });
  });

  it("leaves selections, code, surrounding whitespace, and ordinary URLs untouched", () => {
    expect(visualUrlInsertion(state("selected"), 0, 8, "https://example.test/a.png")).toBeNull();

    const inlineCode = state("`paste here`");
    expect(visualUrlInsertion(inlineCode, 6, 6, "https://example.test/a.png")).toBeNull();

    const fenced = state("```\npaste here\n```");
    expect(visualUrlInsertion(fenced, 8, 8, "https://youtu.be/dQw4w9WgXcQ")).toBeNull();

    expect(visualUrlInsertion(state(""), 0, 0, " https://example.test/a.png ")).toBeNull();
    expect(visualUrlInsertion(state(""), 0, 0, "https://example.test/article")).toBeNull();
  });
});
