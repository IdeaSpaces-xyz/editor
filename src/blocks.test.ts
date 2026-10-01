import { describe, expect, it } from "vitest";
import { headingSlug, noteBlocks, plainInline, titleBlock } from "./blocks.js";

const fixture = [
  "---",
  "name: Reading fixture",
  "summary: Every block the reading surface renders.",
  "---",
  "",
  "# Reading through the editor",
  "",
  "A paragraph with **bold** and a [link](../x.md).",
  "",
  "![The caption](../_assets/x.png)",
  "",
  "![Left](../_assets/a.png)",
  "![](../_assets/b.png)",
  "",
  "[Why depth matters](https://www.youtube.com/watch?v=dQw4w9WgXcQ)",
  "",
  "| A | B |",
  "|---|---|",
  "| 1 | 2 |",
  "",
  "## Same",
  "",
  "> A quote",
  "",
  "## Same",
  "",
  "Text with ![an inline image](y.png) in it.",
].join("\n");

describe("noteBlocks", () => {
  const blocks = noteBlocks(fixture);

  it("numbers the body's top-level blocks and leaves frontmatter out", () => {
    expect(blocks.map((block) => `${block.id}:${block.kind}`)).toEqual([
      "b0:heading",
      "b1:paragraph",
      "b2:image",
      "b3:gallery",
      "b4:youtube",
      "b5:table",
      "b6:heading",
      "b7:quote",
      "b8:heading",
      "b9:paragraph",
    ]);
  });

  it("gives every heading a slug, disambiguated in source order", () => {
    expect(blocks.filter((block) => block.slug).map((block) => block.slug)).toEqual([
      "reading-through-the-editor",
      "same",
      "same-1",
    ]);
  });

  it("reads figures and the 2-up gallery from image-only paragraphs", () => {
    expect(blocks[2]?.images).toEqual([{ alt: "The caption", src: "../_assets/x.png" }]);
    expect(blocks[3]?.images).toEqual([
      { alt: "Left", src: "../_assets/a.png" },
      { alt: "", src: "../_assets/b.png" },
    ]);
    expect(blocks[9]?.kind).toBe("paragraph");
  });

  it("recognises a standalone YouTube link and nothing else as a video", () => {
    expect(blocks[4]?.youtube).toEqual({
      label: "Why depth matters",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    expect(noteBlocks("[a page](https://example.com/watch?v=x)")[0]?.kind).toBe("paragraph");
  });

  it("finds the title as the first H1", () => {
    expect(titleBlock(blocks)?.text).toBe("Reading through the editor");
    expect(titleBlock(noteBlocks("Intro\n\n## Not a title"))).toBeUndefined();
  });

  it("numbers from zero when there is no frontmatter", () => {
    expect(noteBlocks("One\n\nTwo").map((block) => block.id)).toEqual(["b0", "b1"]);
  });
});

describe("headingSlug and plainInline", () => {
  it("slugs the way the web's section chips did", () => {
    expect(headingSlug("Why **depth** matters?")).toBe("why-depth-matters");
    expect(headingSlug(plainInline("Why **depth** [matters](x.md)"))).toBe("why-depth-matters");
  });

  it("flattens inline Markdown to the words a reader sees", () => {
    expect(plainInline("A [[Target|alias]], `code`, *em* and ![alt](x.png)")).toBe("A alias, code, em and alt");
  });
});
