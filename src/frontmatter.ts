// Pure parsing of a note's leading YAML frontmatter — the `---` block that
// sw_space reads into a Node's typed metadata (name, summary, tags, …). The
// editor renders it as a structured "Properties" panel instead of letting the
// raw YAML show as a wall of paragraph text (the live-preview layer has no
// frontmatter awareness).
//
// Display-only extraction, deliberately not a full YAML parse: the SDK itself
// treats Layer-1 frontmatter with lightweight regex extraction (see
// `@ideaspaces/sdk` `extractSummary`) and reserves a real parser for the
// validation path. We only need to *show* the fields here — editing happens by
// revealing the raw YAML — so the same lightweight approach fits and keeps the
// webview bundle dependency-free. The raw block always stays in the document,
// so saving round-trips it untouched.

export interface FrontmatterField {
  key: string;
  /** Display value: continuations collapsed to one line, outer quotes stripped. */
  value: string;
}

export interface ParsedFrontmatter {
  /** 1-based line of the opening `---` (always 1 — frontmatter must be first). */
  startLine: number;
  /** 1-based line of the closing `---`. */
  endLine: number;
  fields: FrontmatterField[];
}

// A top-level `key:` line — a bare identifier, a colon, then an optional value.
// Indented lines are continuations (handled separately), so this only matches
// at column 0. `key: value:with:colons` keeps everything after the first colon
// as the value.
const KEY_LINE = /^([A-Za-z0-9_][A-Za-z0-9_-]*):(?:[ \t](.*))?$/;
// A block-scalar header value (`|`, `>`, with optional chomping/indent), e.g.
// `summary: |` — the real text is on the following indented lines.
const BLOCK_SCALAR = /^[|>][+-]?\d*$/;

function dequote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) {
    return v.slice(1, -1);
  }
  return v;
}

/**
 * Parse a leading YAML frontmatter block, or return null when there isn't one.
 *
 * Recognized only when `---` is the very first line and a later line is exactly
 * `---` (a closing fence) — matching the SDK's `stripFrontmatter` contract. A
 * mid-document `---` is a thematic break and is left alone; an unterminated
 * opener is treated as no frontmatter so we never hijack the whole document.
 *
 * Returns 1-based line numbers (not byte offsets) so the caller resolves
 * document positions via CodeMirror's `doc.line()` — CRLF-safe and free of
 * manual offset arithmetic. Callers may pass a bounded document head (the
 * block is always at the top); line numbers in the head match the full doc.
 */
export function parseFrontmatter(doc: string): ParsedFrontmatter | null {
  if (!doc.startsWith("---\n") && !doc.startsWith("---\r\n")) return null;

  const lines = doc.split("\n");
  // Find the closing fence (a line that is exactly `---`, ignoring a trailing CR).
  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].replace(/\r$/, "") === "---") {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) return null;

  const fields: FrontmatterField[] = [];
  let current: { key: string; parts: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    const value = dequote(current.parts.join(" ").replace(/\s+/g, " ").trim());
    fields.push({ key: current.key, value });
    current = null;
  };

  for (let i = 1; i < closeIdx; i++) {
    const line = lines[i].replace(/\r$/, "");
    if (!line.trim() || line.trimStart().startsWith("#")) continue; // blank / comment

    const m = KEY_LINE.exec(line);
    if (m) {
      flush();
      const rest = (m[2] ?? "").trim();
      // A block-scalar header (`|`/`>`) has its text on the following lines.
      current = { key: m[1], parts: BLOCK_SCALAR.test(rest) ? [] : [rest] };
    } else if (current && /^\s/.test(lines[i])) {
      current.parts.push(line.trim()); // indented continuation
    }
    // A non-indented, non-key line is ignored (we don't guess at malformed YAML).
  }
  flush();

  // 1-based line numbers (CodeMirror convention): line 1 is the opening fence,
  // line closeIdx+1 is the closing fence.
  return { startLine: 1, endLine: closeIdx + 1, fields };
}

// Quote a YAML scalar only when it needs it: empty, leading/trailing space, a
// `:`/`#` anywhere, or a leading YAML indicator char (including flow markers
// `[`/`{`). Single-quote style, doubling embedded single quotes.
// YAML 1.1 booleans/nulls a strict parser would coerce ("Yes" → true).
const YAML_RESERVED = /^(y|n|yes|no|true|false|on|off|null|~)$/i;

function yamlScalar(value: string): string {
  if (
    value === "" ||
    /^\s|\s$/.test(value) ||
    /[:#]/.test(value) ||
    /^[-?:,[\]{}#&*!|>'"%@`]/.test(value) ||
    YAML_RESERVED.test(value)
  ) {
    return `'${value.replace(/'/g, "''")}'`;
  }
  return value;
}

/**
 * Set the frontmatter `name` field to `name`, preserving the rest of the block
 * (and the body). Creates a frontmatter block if there isn't one. Pure string
 * transform — the caller writes the result to disk.
 */
export function setFrontmatterName(content: string, name: string): string {
  const line = `name: ${yamlScalar(name)}`;
  const fm = parseFrontmatter(content);
  if (!fm) {
    const sep = content === "" || content.startsWith("\n") ? "" : "\n";
    return `---\n${line}\n---\n${sep}${content}`;
  }
  const lines = content.split("\n");
  // Inner lines are 0-based indices [startLine, endLine-2] (after the opening
  // fence, before the closing one). Replace an existing top-level `name:`, else
  // insert right after the opening fence.
  let nameIdx = -1;
  for (let i = fm.startLine; i <= fm.endLine - 2; i++) {
    if (/^name\s*:/.test(lines[i] ?? "")) {
      nameIdx = i;
      break;
    }
  }
  if (nameIdx !== -1) lines[nameIdx] = line;
  else lines.splice(fm.startLine, 0, line);
  return lines.join("\n");
}

/**
 * Offset of the first caret position after any leading frontmatter block, so a
 * focus never lands at offset 0 — inside the block, where an Enter inserts a
 * newline before the opening `---` and breaks the fence (the YAML stops parsing
 * and spills raw into the body). Returns 0 when there's no frontmatter; the doc
 * length when it's frontmatter-only (no body line yet).
 */
export function bodyStartOffset(content: string): number {
  const fm = parseFrontmatter(content);
  if (!fm) return 0;
  const lines = content.split("\n");
  if (fm.endLine >= lines.length) return content.length;
  let offset = 0;
  for (let i = 0; i < fm.endLine; i++) offset += lines[i].length + 1;
  return Math.min(offset, content.length);
}
