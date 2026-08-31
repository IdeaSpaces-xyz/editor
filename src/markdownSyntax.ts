import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * The IdeaSpaces Markdown syntax palette.
 *
 * Block typography belongs exclusively to `editor.css`, where the semantic
 * `cm-atomic-h*` line classes define heading family, size, weight, and rhythm.
 * This highlighter therefore has no heading rules: applying another weight to
 * CodeMirror's nested heading spans makes one heading appear synthetically
 * bold on top of the shared line typography.
 */
export const ideaSpacesMarkdownHighlight = HighlightStyle.define([
  {
    tag: t.strong,
    fontWeight: "600",
    color: "var(--atomic-editor-fg, #dcddde)",
  },
  {
    tag: t.emphasis,
    fontStyle: "italic",
    color: "var(--atomic-editor-fg, #dcddde)",
  },
  {
    tag: t.strikethrough,
    textDecoration: "line-through",
    color: "var(--atomic-editor-fg-muted, #888)",
  },
  {
    tag: t.monospace,
    fontFamily: "var(--atomic-editor-font-mono, ui-monospace, monospace)",
    color: "var(--atomic-editor-link, #818cf8)",
  },
  { tag: t.link, color: "var(--atomic-editor-link, #818cf8)" },
  { tag: t.url, color: "var(--atomic-editor-link, #818cf8)" },
  { tag: t.processingInstruction, color: "var(--atomic-editor-fg-faint, #666)" },
  { tag: t.contentSeparator, color: "var(--atomic-editor-fg-faint, #666)" },
  { tag: t.quote, color: "var(--atomic-editor-fg-muted, #888)" },
  { tag: t.list, color: "var(--atomic-editor-fg, #dcddde)" },
  { tag: t.meta, color: "var(--atomic-editor-fg-faint, #666)" },
  {
    tag: [
      t.keyword,
      t.modifier,
      t.operatorKeyword,
      t.controlKeyword,
      t.definitionKeyword,
      t.moduleKeyword,
      t.self,
    ],
    color: "var(--atomic-editor-hl-keyword, #c792ea)",
  },
  {
    tag: [t.string, t.special(t.string), t.character, t.attributeValue],
    color: "var(--atomic-editor-hl-string, #c3e88d)",
  },
  {
    tag: [t.number, t.integer, t.float, t.bool, t.null, t.atom],
    color: "var(--atomic-editor-hl-number, #f78c6c)",
  },
  {
    tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
    color: "var(--atomic-editor-hl-comment, #6a7a82)",
    fontStyle: "italic",
  },
  {
    tag: [t.typeName, t.className, t.namespace, t.standard(t.variableName)],
    color: "var(--atomic-editor-hl-type, #ffcb6b)",
  },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName],
    color: "var(--atomic-editor-hl-function, #82aaff)",
  },
  {
    tag: [t.propertyName, t.attributeName, t.definition(t.propertyName)],
    color: "var(--atomic-editor-hl-property, #82aaff)",
  },
  { tag: t.regexp, color: "var(--atomic-editor-hl-regexp, #f07178)" },
  { tag: t.escape, color: "var(--atomic-editor-hl-escape, #89ddff)" },
  {
    tag: [t.tagName, t.angleBracket],
    color: "var(--atomic-editor-hl-tag, #f07178)",
  },
  {
    tag: [
      t.variableName,
      t.labelName,
      t.definition(t.variableName),
      t.local(t.variableName),
    ],
    color: "var(--atomic-editor-hl-variable, #eeffff)",
  },
  { tag: t.operator, color: "var(--atomic-editor-hl-operator, #89ddff)" },
  { tag: t.invalid, color: "var(--atomic-editor-hl-invalid, #ff5370)" },
  {
    tag: [t.punctuation, t.bracket, t.squareBracket, t.paren, t.brace],
    color: "var(--atomic-editor-fg-muted, #888)",
  },
]);

export const ideaSpacesMarkdownSyntax = syntaxHighlighting(ideaSpacesMarkdownHighlight);
