import { describe, expect, it } from "vitest";
import { storedImageMarkdown } from "./imageAssets";

describe("portable stored image Markdown", () => {
  it("uses the host destination, encodes path segments, and selects the description", () => {
    expect(storedImageMarkdown(
      { name: "Architecture diagram.png" },
      { target: "_assets/Architecture diagram (final).png" },
    )).toEqual({
      markdown: "![Architecture diagram](_assets/Architecture%20diagram%20%28final%29.png)",
      descriptionFrom: 2,
      descriptionTo: 22,
    });
  });

  it("uses and escapes an explicit host description", () => {
    expect(storedImageMarkdown(
      { name: "photo.jpg" },
      { target: "../_assets/photo.jpg", description: "Team [2026]" },
    )).toEqual({
      markdown: "![Team \\[2026\\]](../_assets/photo.jpg)",
      descriptionFrom: 2,
      descriptionTo: 15,
    });
  });
});
