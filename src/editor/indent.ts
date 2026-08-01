import { Extension } from "@tiptap/core";

/** Visual width of one indent level, in pixels. */
export const INDENT_STEP_PX = 32;

/** Upper bound so a held-down Tab key cannot push text off-screen. */
const MAX_INDENT = 8;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    indent: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
  }
}

/**
 * Block-level indentation driven by Tab / Shift-Tab.
 *
 * This deliberately does NOT insert a tab character. It stores an integer
 * level on the block node and renders it as a left margin, so indentation
 * survives a save/reload round trip and applies to the whole line rather
 * than wherever the caret happened to be.
 */
export const Indent = Extension.create({
  name: "indent",

  addOptions() {
    return {
      types: ["paragraph", "heading"],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => {
              const level = Number.parseInt(
                element.getAttribute("data-indent") ?? "0",
                10,
              );
              return Number.isFinite(level)
                ? Math.min(MAX_INDENT, Math.max(0, level))
                : 0;
            },
            renderHTML: (attributes) => {
              const level = attributes.indent ?? 0;
              if (!level) return {};
              return {
                "data-indent": String(level),
                style: `margin-left: ${level * INDENT_STEP_PX}px`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    // Shifts every block touched by the selection by `delta` levels. All the
    // edits go into one transaction, so a single undo reverts the whole thing
    // even when many lines were indented at once.
    const shiftBy =
      (delta: number) =>
      () =>
      ({ state, tr, dispatch }: any) => {
        const { from, to } = state.selection;
        let changed = false;

        state.doc.nodesBetween(from, to, (node: any, pos: number) => {
          if (!this.options.types.includes(node.type.name)) return;

          const current = node.attrs.indent ?? 0;
          const next = Math.min(MAX_INDENT, Math.max(0, current + delta));
          if (next === current) return;

          // setNodeMarkup preserves node size, so positions captured from
          // state.doc stay valid for the rest of this walk.
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
          changed = true;
        });

        if (changed && dispatch) dispatch(tr);
        return changed;
      };

    return { indent: shiftBy(1), outdent: shiftBy(-1) };
  },

  addKeyboardShortcuts() {
    // Always return true, even when the indent was a no-op (already at 0 or
    // at MAX_INDENT). Returning false would let the webview fall back to its
    // default behaviour and move focus out of the editor.
    return {
      Tab: () => {
        this.editor.commands.indent();
        return true;
      },
      "Shift-Tab": () => {
        this.editor.commands.outdent();
        return true;
      },
    };
  },
});
