import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export interface MarkdownImageAsset {
  name: string;
  mimeType: string;
  size: number;
  bytes: Uint8Array;
}

export interface StoredMarkdownImage {
  /** Portable path or URL to author into the Markdown destination. */
  target: string;
  /** Host-supplied default description; falls back to the source filename. */
  description?: string;
}

export type StoreMarkdownImage = (
  image: MarkdownImageAsset,
) => Promise<StoredMarkdownImage>;

interface AssetMarker {
  id: number;
  position: number;
}

const addAssetMarker = StateEffect.define<AssetMarker>();
const removeAssetMarker = StateEffect.define<number>();
let nextMarkerId = 1;

const assetMarkers = StateField.define<ReadonlyMap<number, number>>({
  create: () => new Map(),
  update(value, transaction) {
    const next = new Map<number, number>();
    for (const [id, position] of value) {
      next.set(id, transaction.changes.mapPos(position, 1));
    }
    for (const effect of transaction.effects) {
      if (effect.is(addAssetMarker)) next.set(effect.value.id, effect.value.position);
      if (effect.is(removeAssetMarker)) next.delete(effect.value);
    }
    return next;
  },
});

function escapeDescription(value: string): string {
  return value.replace(/([\\[\]])/gu, "\\$1");
}

function defaultDescription(name: string): string {
  const value = name
    .replace(/\.[^.]+$/u, "")
    .replace(/[-_]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!value) return "Image";
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}

function encodeTarget(target: string): string {
  return target
    .split("/")
    .map((segment) => segment === "." || segment === ".."
      ? segment
      : encodeURIComponent(segment).replace(/\(/gu, "%28").replace(/\)/gu, "%29"))
    .join("/");
}

export function storedImageMarkdown(
  image: Pick<MarkdownImageAsset, "name">,
  stored: StoredMarkdownImage,
): { markdown: string; descriptionFrom: number; descriptionTo: number } {
  const description = escapeDescription(stored.description?.trim() || defaultDescription(image.name));
  return {
    markdown: `![${description}](${encodeTarget(stored.target)})`,
    descriptionFrom: 2,
    descriptionTo: 2 + description.length,
  };
}

async function insertImages(
  view: EditorView,
  files: readonly File[],
  position: number,
  replaceTo: number,
  store: StoreMarkdownImage,
  onError: (error: unknown) => void,
): Promise<void> {
  const id = nextMarkerId++;
  view.dispatch({
    changes: position === replaceTo ? undefined : { from: position, to: replaceTo, insert: "" },
    effects: addAssetMarker.of({ id, position }),
  });

  try {
    for (const file of files) {
      const stored = await store({
        name: file.name || "image",
        mimeType: file.type,
        size: file.size,
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
      const at = view.state.field(assetMarkers).get(id);
      if (at === undefined) return;
      const authored = storedImageMarkdown({ name: file.name }, stored);
      const line = view.state.doc.lineAt(at);
      const prefix = view.state.sliceDoc(line.from, at).trim() ? "\n\n" : "";
      const suffix = view.state.sliceDoc(at, line.to).trim() ? "\n\n" : "";
      const insert = `${prefix}${authored.markdown}${suffix}`;
      const descriptionFrom = at + prefix.length + authored.descriptionFrom;
      view.dispatch({
        changes: { from: at, insert },
        selection: {
          anchor: descriptionFrom,
          head: at + prefix.length + authored.descriptionTo,
        },
        userEvent: "input.paste",
      });
    }
  } catch (error) {
    onError(error);
  } finally {
    if (view.state.field(assetMarkers).has(id)) {
      view.dispatch({ effects: removeAssetMarker.of(id) });
    }
  }
}

function imageFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  return Array.from(data.files).filter((file) => file.type.startsWith("image/"));
}

/**
 * Host-neutral picture paste/drop. The host stores bytes and returns a portable
 * destination; the editor keeps the insertion point mapped while that async IO runs.
 */
export function markdownImageFiles(
  store: StoreMarkdownImage,
  onError: (error: unknown) => void,
): Extension {
  return [
    assetMarkers,
    EditorView.domEventHandlers({
      paste(event, view) {
        const files = imageFiles(event.clipboardData);
        if (!files.length) return false;
        event.preventDefault();
        const range = view.state.selection.main;
        void insertImages(view, files, range.from, range.to, store, onError);
        return true;
      },
      drop(event, view) {
        const files = imageFiles(event.dataTransfer);
        if (!files.length) return false;
        const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (position === null) return false;
        event.preventDefault();
        void insertImages(view, files, position, position, store, onError);
        return true;
      },
    }),
  ];
}
