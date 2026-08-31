import { describe, expect, it } from "vitest";
import { tags } from "@lezer/highlight";
import { ideaSpacesMarkdownHighlight } from "./markdownSyntax.js";

describe("IdeaSpaces Markdown syntax ownership", () => {
  it("leaves every heading level to the shared block typography", () => {
    for (const heading of [
      tags.heading1,
      tags.heading2,
      tags.heading3,
      tags.heading4,
      tags.heading5,
      tags.heading6,
    ]) {
      expect(ideaSpacesMarkdownHighlight.style([heading])).toBeNull();
    }
  });

  it("still gives inline strong emphasis one deliberate weight", () => {
    const strong = ideaSpacesMarkdownHighlight.style([tags.strong]);

    expect(strong).not.toBeNull();
    expect(ideaSpacesMarkdownHighlight.style([tags.heading1, tags.strong])).toBe(strong);
    expect(
      ideaSpacesMarkdownHighlight.specs.some((spec) => spec.fontWeight === "700"),
    ).toBe(false);
  });
});
