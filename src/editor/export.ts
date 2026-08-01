import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

/**
 * Serializers for the export actions. These walk the ProseMirror document
 * directly instead of converting the rendered HTML with a library like
 * turndown -- the document tree is already structured, and a dependency
 * would cost more than the ~60 lines it replaces.
 */

export function toPlainText(editor: Editor): string {
  const blocks: string[] = [];

  editor.state.doc.forEach((node) => {
    const indent = "    ".repeat(node.attrs?.indent ?? 0);
    const text = node.textContent;
    blocks.push(text ? indent + text : "");
  });

  return `${blocks.join("\n").trimEnd()}\n`;
}

export function toMarkdown(editor: Editor): string {
  const blocks: string[] = [];

  editor.state.doc.forEach((node) => {
    const rendered = blockToMarkdown(node);
    if (rendered.trim()) blocks.push(rendered);
  });

  return `${blocks.join("\n\n")}\n`;
}

function blockToMarkdown(node: PMNode): string {
  if (node.type.name === "image") {
    return imageToMarkdown(node);
  }

  const indent = indentPrefix(node.attrs?.indent ?? 0);
  const inline = inlineToMarkdown(node);
  if (!inline.trim()) return "";

  if (node.type.name === "heading") {
    const level = Math.min(6, Math.max(1, node.attrs?.level ?? 1));
    return `${indent}${"#".repeat(level)} ${inline}`;
  }

  return indent + inline;
}

/**
 * Markdown has no notion of an indented paragraph -- four leading spaces
 * would turn the line into a code block, which is worse than losing the
 * indent. Non-breaking spaces are inline HTML, valid in Markdown, and
 * render as actual indentation.
 */
function indentPrefix(level: number): string {
  return level > 0 ? "&nbsp;".repeat(level * 4) : "";
}

function inlineToMarkdown(node: PMNode): string {
  let out = "";

  node.forEach((child) => {
    if (child.type.name === "hardBreak") {
      // Two trailing spaces is Markdown's hard line break.
      out += "  \n";
      return;
    }

    if (child.type.name === "image") {
      out += imageToMarkdown(child);
      return;
    }

    const text = child.text ?? "";
    if (!text) return;

    // Emphasis markers must hug the text: `** bold **` is not emphasis in
    // most parsers, so surrounding whitespace is moved outside the markers.
    const leading = /^\s*/.exec(text)![0];
    const trailing = /\s*$/.exec(text)![0];
    let core = text.slice(leading.length, text.length - trailing.length);

    if (core) {
      core = escapeMarkdown(core);
      const marks = child.marks.map((mark) => mark.type.name);
      if (marks.includes("bold")) core = `**${core}**`;
      if (marks.includes("italic")) core = `*${core}*`;
    }

    out += leading + core + trailing;
  });

  return out;
}

function imageToMarkdown(node: PMNode): string {
  const alt = (node.attrs?.alt as string) ?? "";
  const src = (node.attrs?.src as string) ?? "";
  return `![${alt}](${src})`;
}

/** Escapes only the characters that would otherwise become formatting. */
function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_[\]])/g, "\\$1");
}
