import { type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

export type ResolveMarkdownImage = (
  source: string,
) => string | Promise<string>;

const SOURCE_ATTRIBUTE = "data-ideaspaces-image-source";

class ImageSourceResolver {
  private readonly observer: MutationObserver;
  private readonly generations = new WeakMap<HTMLImageElement, number>();

  constructor(
    private readonly view: EditorView,
    private readonly resolve: ResolveMarkdownImage,
    private readonly onError: (error: unknown) => void,
  ) {
    this.observer = new MutationObserver(() => this.resolveImages());
    this.observer.observe(view.dom, { childList: true, subtree: true });
    this.resolveImages();
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged || update.geometryChanged) {
      this.resolveImages();
    }
  }

  destroy(): void {
    this.observer.disconnect();
  }

  private resolveImages(): void {
    for (const image of this.view.dom.querySelectorAll<HTMLImageElement>("img")) {
      if (image.hasAttribute(SOURCE_ATTRIBUTE)) continue;
      const source = image.getAttribute("src");
      if (!source) continue;
      image.setAttribute(SOURCE_ATTRIBUTE, source);
      const generation = (this.generations.get(image) ?? 0) + 1;
      this.generations.set(image, generation);
      Promise.resolve(this.resolve(source)).then(
        (resolved) => {
          if (
            resolved &&
            image.isConnected &&
            this.generations.get(image) === generation
          ) {
            image.setAttribute("src", resolved);
          }
        },
        (error) => {
          if (this.generations.get(image) === generation) this.onError(error);
        },
      );
    }
  }
}

/** Resolve rendered image sources without rewriting the authored Markdown. */
export function markdownImageSources(
  resolve: ResolveMarkdownImage,
  onError: (error: unknown) => void,
): Extension {
  return ViewPlugin.define(
    (view) => new ImageSourceResolver(view, resolve, onError),
  );
}
