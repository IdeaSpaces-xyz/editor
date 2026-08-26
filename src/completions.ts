import {
  CompletionContext,
  autocompletion,
  pickedCompletion,
  type Completion,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export interface MarkdownLinkSuggestion {
  /** Human-readable Note name shown in the picker and used as link text. */
  label: string;
  /** Repository-relative context used to disambiguate duplicate names. */
  detail?: string;
  /** Link target relative to the Note being edited. */
  target: string;
}

export type SuggestMarkdownLinks = (
  query: string,
) => readonly MarkdownLinkSuggestion[] | Promise<readonly MarkdownLinkSuggestion[]>;

interface LinkQuery {
  /** Position immediately after the `[[` trigger. */
  from: number;
  to: number;
  query: string;
}

export function markdownLinkQuery(state: EditorState, position: number): LinkQuery | null {
  const line = state.doc.lineAt(position);
  const before = state.sliceDoc(line.from, position);
  const match = /\[\[([^\]\n]*)$/u.exec(before);
  if (!match) return null;

  return {
    from: position - (match[1]?.length ?? 0),
    to: position,
    query: match[1] ?? "",
  };
}

function escapeLabel(label: string): string {
  return label.replace(/([\\[\]])/gu, "\\$1");
}

function encodeTarget(target: string): string {
  return target
    .split("/")
    .map((segment) => encodeURIComponent(segment)
      .replace(/\(/gu, "%28")
      .replace(/\)/gu, "%29"))
    .join("/");
}

export function markdownLinkText(suggestion: MarkdownLinkSuggestion): string {
  return `[${escapeLabel(suggestion.label)}](${encodeTarget(suggestion.target)})`;
}

function trailingWikiCloseLength(state: EditorState, position: number): number {
  const after = state.sliceDoc(position, Math.min(state.doc.length, position + 2));
  if (after.startsWith("]]")) return 2;
  if (after.startsWith("]")) return 1;
  return 0;
}

export function markdownLinkReplacement(
  state: EditorState,
  queryFrom: number,
  queryTo: number,
  suggestion: MarkdownLinkSuggestion,
): { from: number; to: number; insert: string } {
  return {
    from: Math.max(0, queryFrom - 2),
    to: queryTo + trailingWikiCloseLength(state, queryTo),
    insert: markdownLinkText(suggestion),
  };
}

export function markdownLinkCompletionSource(
  suggest: SuggestMarkdownLinks,
): CompletionSource {
  return async (context: CompletionContext) => {
    const query = markdownLinkQuery(context.state, context.pos);
    if (!query) return null;

    let suggestions: readonly MarkdownLinkSuggestion[];
    try {
      suggestions = await suggest(query.query);
    } catch {
      return null;
    }
    if (context.aborted) return null;

    return {
      from: query.from,
      to: query.to,
      options: suggestions.map((suggestion): Completion => ({
        label: suggestion.label,
        detail: suggestion.detail,
        type: "text",
        apply(view, completion, from, to) {
          const replacement = markdownLinkReplacement(view.state, from, to, suggestion);
          view.dispatch({
            changes: replacement,
            selection: { anchor: replacement.from + replacement.insert.length },
            annotations: pickedCompletion.of(completion),
            userEvent: "input.complete",
          });
        },
      })),
    };
  };
}

export function markdownLinkCompletion(
  suggest: SuggestMarkdownLinks,
): Extension {
  return autocompletion({
    activateOnTyping: true,
    maxRenderedOptions: 40,
    override: [markdownLinkCompletionSource(suggest)],
  });
}

export interface TaskMarkerInsertion {
  from: number;
  to: number;
  insert: string;
  anchor: number;
}

export function taskMarkerInsertion(
  state: EditorState,
  from: number,
  to: number,
  text: string,
): TaskMarkerInsertion | null {
  if (text !== "[" || from !== to) return null;

  const line = state.doc.lineAt(from);
  const before = state.sliceDoc(line.from, from);
  if (!/^\s*[-+*]\s$/u.test(before)) return null;

  const insert = "[ ] ";
  return { from, to, insert, anchor: from + insert.length };
}

export function taskMarkerCompletion(): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    const insertion = taskMarkerInsertion(view.state, from, to, text);
    if (!insertion) return false;

    view.dispatch({
      changes: {
        from: insertion.from,
        to: insertion.to,
        insert: insertion.insert,
      },
      selection: { anchor: insertion.anchor },
      userEvent: "input.type",
    });
    return true;
  });
}
