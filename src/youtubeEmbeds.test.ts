import { describe, expect, it } from "vitest";
import { youtubeMarkdownLink } from "./youtubeEmbeds";

describe("YouTube Markdown enhancement", () => {
  it("upgrades only a standalone standard Markdown link", () => {
    expect(youtubeMarkdownLink(
      "[Product walkthrough](https://youtu.be/dQw4w9WgXcQ)",
    )).toEqual({
      label: "Product walkthrough",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      id: "dQw4w9WgXcQ",
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    });

    expect(youtubeMarkdownLink(
      "Watch [Product walkthrough](https://youtu.be/dQw4w9WgXcQ) later.",
    )).toBeNull();
    expect(youtubeMarkdownLink("[Article](https://example.test/video)")).toBeNull();
    expect(youtubeMarkdownLink("https://youtu.be/dQw4w9WgXcQ")).toBeNull();
  });
});
