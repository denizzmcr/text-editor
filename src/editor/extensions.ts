import Bold from "@tiptap/extension-bold";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Heading from "@tiptap/extension-heading";
import Image from "@tiptap/extension-image";
import Italic from "@tiptap/extension-italic";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Dropcursor, Gapcursor, UndoRedo } from "@tiptap/extensions";

import { Indent } from "./indent";

/**
 * Extensions are registered individually rather than via StarterKit. The kit
 * pulls in lists, blockquotes, code blocks and horizontal rules that this
 * editor does not offer, and every one of them lands in the bundle.
 */
export const extensions = [
  Document,
  Paragraph,
  Text,
  Bold,
  Italic,
  Heading.configure({ levels: [1, 2, 3] }),
  HardBreak,
  // allowBase64 is required because images are embedded as data URIs so a
  // saved document stays a single self-contained file.
  Image.configure({ inline: false, allowBase64: true }),
  // ProseMirror's history plugin -- undo/redo grouping, coalescing of
  // consecutive typing into one step, and redo stack invalidation are all
  // subtle enough that hand-rolling them would be a mistake.
  UndoRedo,
  Dropcursor,
  Gapcursor,
  Indent,
];
