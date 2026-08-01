//! The application menu, built directly with muda.
//!
//! Editing actions are custom items rather than predefined ones because the
//! document model lives in ProseMirror, not the webview. A predefined
//! Undo/Redo would drive the webview's own undo stack and desync from the
//! editor's history, so every editing accelerator is forwarded to the
//! frontend. Cut/Copy/Paste stay predefined -- those act on the selection and
//! behave correctly natively.

use muda::{accelerator::Accelerator, Menu, MenuItem, PredefinedMenuItem, Submenu};

fn key(shortcut: &str) -> Option<Accelerator> {
    shortcut.parse().ok()
}

pub fn build() -> Result<Menu, muda::Error> {
    let menu = Menu::new();

    #[cfg(target_os = "macos")]
    {
        let app = Submenu::new("Text Editor", true);
        app.append_items(&[
            &PredefinedMenuItem::about(None, None),
            &PredefinedMenuItem::separator(),
            &PredefinedMenuItem::hide(None),
            &PredefinedMenuItem::hide_others(None),
            &PredefinedMenuItem::show_all(None),
            &PredefinedMenuItem::separator(),
            &PredefinedMenuItem::quit(None),
        ])?;
        menu.append(&app)?;
    }

    let file = Submenu::new("File", true);
    file.append_items(&[
        &MenuItem::with_id("new", "New", true, key("CmdOrCtrl+N")),
        &MenuItem::with_id("open", "Open…", true, key("CmdOrCtrl+O")),
        &PredefinedMenuItem::separator(),
        &MenuItem::with_id("save", "Save", true, key("CmdOrCtrl+S")),
        &MenuItem::with_id("save_as", "Save As…", true, key("CmdOrCtrl+Shift+S")),
        &PredefinedMenuItem::separator(),
        &MenuItem::with_id("export_md", "Export as Markdown…", true, None),
        &MenuItem::with_id("export_txt", "Export as Plain Text…", true, None),
    ])?;

    let edit = Submenu::new("Edit", true);
    edit.append_items(&[
        &MenuItem::with_id("undo", "Undo", true, key("CmdOrCtrl+Z")),
        &MenuItem::with_id("redo", "Redo", true, key("CmdOrCtrl+Shift+Z")),
        &PredefinedMenuItem::separator(),
        &PredefinedMenuItem::cut(None),
        &PredefinedMenuItem::copy(None),
        &PredefinedMenuItem::paste(None),
        &PredefinedMenuItem::select_all(None),
    ])?;

    let format = Submenu::new("Format", true);
    format.append_items(&[
        &MenuItem::with_id("bold", "Bold", true, key("CmdOrCtrl+B")),
        &MenuItem::with_id("italic", "Italic", true, key("CmdOrCtrl+I")),
        &PredefinedMenuItem::separator(),
        &MenuItem::with_id("h1", "Title", true, key("CmdOrCtrl+Alt+1")),
        &MenuItem::with_id("h2", "Heading", true, key("CmdOrCtrl+Alt+2")),
        &MenuItem::with_id("h3", "Subheading", true, key("CmdOrCtrl+Alt+3")),
        &MenuItem::with_id("body", "Body", true, key("CmdOrCtrl+Alt+0")),
        &PredefinedMenuItem::separator(),
        &MenuItem::with_id("indent", "Indent", true, None),
        &MenuItem::with_id("outdent", "Outdent", true, None),
    ])?;

    let insert = Submenu::new("Insert", true);
    insert.append_items(&[&MenuItem::with_id(
        "image",
        "Image…",
        true,
        key("CmdOrCtrl+Shift+I"),
    )])?;

    menu.append_items(&[&file, &edit, &format, &insert])?;
    Ok(menu)
}
