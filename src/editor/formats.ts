import type { Editor } from "@tiptap/core";

import { toMarkdown, toPlainText } from "./export";

/**
 * How a file's bytes map to the document model.
 *
 * The editor must not assume every file is HTML. Writing HTML into a `.rs` or
 * `.py` file corrupts it, and parsing source code as HTML silently eats
 * anything that looks like a tag (`Vec<String>` loses `<String>`). Format is
 * therefore chosen from the extension, and plain text is the safe default.
 */
export type DocumentFormat = "html" | "markdown" | "text";

const HTML_EXTENSIONS = new Set(["html", "htm", "xhtml"]);
const MARKDOWN_EXTENSIONS = new Set(["md", "markdown", "mdown", "mkd", "mdx"]);

export function formatForPath(path: string): DocumentFormat {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "text";

  const ext = name.slice(dot + 1).toLowerCase();
  if (HTML_EXTENSIONS.has(ext)) return "html";
  if (MARKDOWN_EXTENSIONS.has(ext)) return "markdown";
  return "text";
}

/** True when saving in this format discards formatting the document holds. */
export function isLossy(format: DocumentFormat): boolean {
  return format === "text";
}

export function serialize(editor: Editor, format: DocumentFormat): string {
  switch (format) {
    case "html":
      return editor.getHTML();
    case "markdown":
      return toMarkdown(editor);
    case "text":
      return toPlainText(editor);
  }
}

/** Converts file contents into HTML for the editor to parse. */
export function toEditorHtml(contents: string, format: DocumentFormat): string {
  switch (format) {
    case "html":
      return contents;
    case "markdown":
      return markdownToHtml(contents);
    case "text":
      return textToHtml(contents);
  }
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Escapes a value for an attribute. Input is already HTML-escaped. */
const escapeAttr = (text: string) => text.replace(/"/g, "&quot;");

/**
 * Each line becomes its own paragraph. ProseMirror renders with
 * `white-space: pre-wrap`, so leading indentation in source files survives
 * the round trip byte for byte.
 */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

/**
 * A deliberately small Markdown reader covering exactly what the exporter in
 * `export.ts` emits -- headings, bold, italic, images, hard breaks and the
 * `&nbsp;` indent prefix -- plus the common spellings of those. It exists so
 * `.md` files round-trip; it is not a CommonMark implementation.
 */
export function markdownToHtml(markdown: string): string {
  return markdown
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map(blockToHtml)
    .filter(Boolean)
    .join("");
}

function blockToHtml(block: string): string {
  let body = block.trim();
  if (!body) return "";

  // Indent levels are written by our exporter as runs of &nbsp;, four per level.
  let indent = 0;
  const prefix = /^(?:&nbsp;)+/.exec(body);
  if (prefix) {
    indent = Math.min(8, Math.round(prefix[0].length / "&nbsp;".length / 4));
    body = body.slice(prefix[0].length);
  }

  const heading = /^(#{1,6})\s+([\s\S]*)$/.exec(body);
  if (heading) {
    const level = Math.min(3, heading[1].length);
    return `<h${level}${indentAttr(indent)}>${inlineToHtml(heading[2])}</h${level}>`;
  }

  return `<p${indentAttr(indent)}>${inlineToHtml(body)}</p>`;
}

const indentAttr = (level: number) =>
  level > 0
    ? ` data-indent="${level}" style="margin-left: ${level * 32}px"`
    : "";

function inlineToHtml(text: string): string {
  // Escape first so that any literal markup in the file is shown as text
  // rather than interpreted; the tags added below are ours alone.
  let out = escapeHtml(text);

  // Images before emphasis, so an underscore inside a URL is left alone.
  out = out.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_match, alt: string, src: string) =>
      `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">`,
  );

  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");

  // Two trailing spaces is Markdown's hard break; any other newline inside a
  // paragraph is just soft wrapping.
  out = out.replace(/ {2}\n/g, "<br>");
  out = out.replace(/\n/g, " ");

  // Undo the exporter's backslash escaping.
  return out.replace(/\\([\\`*_[\]])/g, "$1");
}
