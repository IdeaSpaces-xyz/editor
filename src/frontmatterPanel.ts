// Renders a note's leading YAML frontmatter as a structured "Properties" panel
// (Obsidian-style), with a warning that the fields organize the note in the
// platform. The raw YAML stays in the document — the panel is a CodeMirror
// block-replace decoration over it, so saves round-trip the block untouched.
//
// Default view: the panel. Activate "Edit" to reveal the raw YAML inline and
// edit it as text; moving the cursor back into the body re-collapses to the
// panel. Editing structured fields in place is a later slice — for now editing
// the platform's navigation metadata is a deliberate, raw-YAML action.

import { EditorView, WidgetType, type DecorationSet, Decoration } from "@codemirror/view";
import { Facet, StateEffect, StateField, Prec, type Extension, type EditorState } from "@codemirror/state";
import { parseFrontmatter, type FrontmatterField } from "./frontmatter";

// Whether the panel offers an "Edit" affordance. False for the read-only
// README preview, where revealing raw YAML to edit makes no sense.
const editableFacet = Facet.define<boolean, boolean>({
  combine: (values) => (values.length ? values[0] : true),
});

// Toggle between the rendered panel and the raw, editable YAML.
const setReveal = StateEffect.define<boolean>();

const revealField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setReveal)) value = e.value;
    return value;
  },
});

const INFO_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';

// Identity for widget reuse. Field values are arbitrary text, so the key/value
// and field separators are control chars that can't occur in frontmatter — a
// plain-space join would let different field arrangements hash equal and leave
// a stale panel after an edit (CodeMirror reuses the DOM when `eq` is true).
const KV_SEP = String.fromCharCode(0);
const FIELD_SEP = String.fromCharCode(1);
const serialize = (fields: FrontmatterField[]): string =>
  fields.map((f) => f.key + KV_SEP + f.value).join(FIELD_SEP);

// Reveal the raw YAML for editing, with the cursor on the first field line
// (the line after the opening fence), not the `---` delimiter itself.
function revealRaw(view: EditorView): void {
  const fm = frontmatterRange(view.state);
  const target = fm ? Math.min(fm.startLine + 1, fm.endLine - 1) : 2;
  const line = Math.min(Math.max(target, 1), view.state.doc.lines);
  view.dispatch({
    effects: setReveal.of(true),
    selection: { anchor: view.state.doc.line(line).from },
  });
  view.focus();
}

class FrontmatterWidget extends WidgetType {
  constructor(
    readonly fields: FrontmatterField[],
    readonly editable: boolean,
  ) {
    super();
  }

  // Reuse the DOM while the frontmatter is unchanged (the common case — the
  // user is editing the body), so the panel doesn't flicker on every keystroke.
  eq(other: FrontmatterWidget): boolean {
    return this.editable === other.editable && serialize(this.fields) === serialize(other.fields);
  }

  toDOM(view: EditorView): HTMLElement {
    // Outer wrapper carries the vertical rhythm as *padding*, not margin. CM6's
    // heightmap measures a block widget via getBoundingClientRect, which includes
    // padding but EXCLUDES margin — so a margin here would under-allocate the
    // widget's height and every line below it would click ~that much too low.
    const wrap = document.createElement("div");
    wrap.className = "cm-fm-wrap";
    wrap.setAttribute("contenteditable", "false");

    const root = document.createElement("div");
    root.className = "cm-fm-panel";

    const head = document.createElement("div");
    head.className = "cm-fm-head";
    const icon = document.createElement("span");
    icon.className = "cm-fm-icon";
    icon.innerHTML = INFO_SVG;
    const note = document.createElement("span");
    note.className = "cm-fm-note";
    note.textContent = "Properties — used to organize this note in IdeaSpaces";
    head.append(icon, note);
    if (this.editable) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "cm-fm-edit";
      edit.textContent = "Edit";
      // mousedown (not click) so we win before the editor moves the selection on
      // pointer interaction; keydown covers native button activation
      // (Enter/Space) for keyboard users, which fires `click`, not `mousedown`.
      edit.addEventListener("mousedown", (e) => {
        e.preventDefault();
        revealRaw(view);
      });
      edit.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        revealRaw(view);
      });
      head.append(edit);
    }
    root.append(head);

    if (this.fields.length > 0) {
      const rows = document.createElement("dl");
      rows.className = "cm-fm-rows";
      for (const f of this.fields) {
        const key = document.createElement("dt");
        key.className = "cm-fm-key";
        key.textContent = f.key;
        const val = document.createElement("dd");
        val.className = f.value ? "cm-fm-val" : "cm-fm-val cm-fm-empty";
        val.textContent = f.value || "—";
        if (f.value) val.title = f.value;
        rows.append(key, val);
      }
      root.append(rows);
    }
    wrap.append(root);
    return wrap;
  }

  // The panel handles its own button events; let CodeMirror skip the region.
  ignoreEvent(): boolean {
    return true;
  }
}

// Frontmatter is always at the top, so scan a bounded document head rather than
// materializing the whole document (doc.toString()) on every keystroke — for a
// large note that would allocate and GC the full string per character typed.
const SCAN_LIMIT = 4096; // generous; real frontmatter is well under 1 KB

interface FrontmatterRange {
  from: number;
  to: number;
  startLine: number;
  endLine: number;
  fields: FrontmatterField[];
}

function frontmatterRange(state: EditorState): FrontmatterRange | null {
  const head = state.doc.sliceString(0, Math.min(state.doc.length, SCAN_LIMIT));
  const fm = parseFrontmatter(head);
  if (!fm) return null;
  const from = state.doc.line(fm.startLine).from;
  // Resolve offsets via doc.line() (CRLF-safe). Extend to the start of the line
  // after the closing fence so its trailing newline is consumed — otherwise an
  // orphan blank line shows between the panel and the first body line.
  const to =
    fm.endLine < state.doc.lines
      ? state.doc.line(fm.endLine + 1).from
      : state.doc.line(fm.endLine).to;
  return { from, to, startLine: fm.startLine, endLine: fm.endLine, fields: fm.fields };
}

function buildDecorations(state: EditorState): DecorationSet {
  if (state.field(revealField)) return Decoration.none; // editing raw YAML
  const fm = frontmatterRange(state);
  if (!fm) return Decoration.none;
  const editable = state.facet(editableFacet);
  // `name` is surfaced as the editable title above the body, not in the panel.
  const fields = fm.fields.filter((f) => f.key.toLowerCase() !== "name");
  // Block-replace the whole frontmatter line range with the panel widget.
  return Decoration.set(
    Decoration.replace({ widget: new FrontmatterWidget(fields, editable), block: true }).range(
      fm.from,
      fm.to,
    ),
  );
}

const decorationField = StateField.define<DecorationSet>({
  create: buildDecorations,
  update(deco, tr) {
    if (tr.docChanged || tr.effects.some((e) => e.is(setReveal))) {
      return buildDecorations(tr.state);
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

// Keep the cursor out of the collapsed (hidden) block, and re-collapse to the
// panel once the selection leaves the frontmatter while editing raw.
const cursorGuard = EditorView.updateListener.of((u) => {
  if (!u.view.state.field(revealField)) return;
  if (!u.selectionSet && !u.docChanged) return;
  const fm = frontmatterRange(u.state);
  const head = u.state.selection.main.head;
  // `fm.to` is the start of the first body line, so `>=` collapses as soon as
  // the cursor reaches the body (e.g. ↓ from the closing fence).
  if (!fm || head < fm.from || head >= fm.to) {
    u.view.dispatch({ effects: setReveal.of(false) });
  }
});

/**
 * Render leading YAML frontmatter as a Properties panel over the raw block.
 * `editable` (default true) controls the inline "Edit" affordance — pass false
 * for read-only renders (the README preview).
 */
export function frontmatterPanel(opts: { editable?: boolean } = {}): Extension {
  return [
    editableFacet.of(opts.editable ?? true),
    revealField,
    // High precedence so the block-replace wins over the live-preview layer's
    // rendering of the `---` delimiters as thematic-break rules.
    Prec.high(decorationField),
    // Make the collapsed block atomic so arrow keys / clicks skip over it.
    EditorView.atomicRanges.of((view) => view.state.field(decorationField)),
    cursorGuard,
  ];
}
