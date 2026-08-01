mod commands;

use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager};

/// Builds the macOS menu bar.
///
/// Editing actions are custom items rather than the predefined ones because
/// the document model lives in ProseMirror, not the webview. The predefined
/// Undo/Redo would drive WebKit's own undo stack and desync from the editor's
/// history, so every editing accelerator is forwarded to the frontend instead.
/// Cut/Copy/Paste stay predefined -- those act on the selection and behave
/// correctly natively.
fn build_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let sep = || PredefinedMenuItem::separator(app);

    let app_menu = Submenu::with_items(
        app,
        "Text Editor",
        true,
        &[
            &PredefinedMenuItem::about(app, None, Some(AboutMetadata::default()))?,
            &sep()?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &sep()?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &MenuItem::with_id(app, "new", "New", true, Some("CmdOrCtrl+N"))?,
            &MenuItem::with_id(app, "open", "Open…", true, Some("CmdOrCtrl+O"))?,
            &sep()?,
            &MenuItem::with_id(app, "save", "Save", true, Some("CmdOrCtrl+S"))?,
            &MenuItem::with_id(app, "save_as", "Save As…", true, Some("CmdOrCtrl+Shift+S"))?,
            &sep()?,
            &MenuItem::with_id(app, "export_md", "Export as Markdown…", true, None::<&str>)?,
            &MenuItem::with_id(app, "export_txt", "Export as Plain Text…", true, None::<&str>)?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &MenuItem::with_id(app, "undo", "Undo", true, Some("CmdOrCtrl+Z"))?,
            &MenuItem::with_id(app, "redo", "Redo", true, Some("CmdOrCtrl+Shift+Z"))?,
            &sep()?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let format_menu = Submenu::with_items(
        app,
        "Format",
        true,
        &[
            &MenuItem::with_id(app, "bold", "Bold", true, Some("CmdOrCtrl+B"))?,
            &MenuItem::with_id(app, "italic", "Italic", true, Some("CmdOrCtrl+I"))?,
            &sep()?,
            &MenuItem::with_id(app, "h1", "Title", true, Some("CmdOrCtrl+Alt+1"))?,
            &MenuItem::with_id(app, "h2", "Heading", true, Some("CmdOrCtrl+Alt+2"))?,
            &MenuItem::with_id(app, "h3", "Subheading", true, Some("CmdOrCtrl+Alt+3"))?,
            &MenuItem::with_id(app, "body", "Body", true, Some("CmdOrCtrl+Alt+0"))?,
            &sep()?,
            &MenuItem::with_id(app, "indent", "Indent", true, None::<&str>)?,
            &MenuItem::with_id(app, "outdent", "Outdent", true, None::<&str>)?,
        ],
    )?;

    let insert_menu = Submenu::with_items(
        app,
        "Insert",
        true,
        &[&MenuItem::with_id(
            app,
            "image",
            "Image…",
            true,
            Some("CmdOrCtrl+Shift+I"),
        )?],
    )?;

    Menu::with_items(
        app,
        &[
            &app_menu,
            &file_menu,
            &edit_menu,
            &format_menu,
            &insert_menu,
        ],
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::PendingOpen::default())
        .setup(|app| {
            let handle = app.handle();
            app.set_menu(build_menu(handle)?)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            // The frontend owns all editor state, so the menu just forwards
            // the item id and lets main.ts decide what to do.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.emit("menu", event.id().0.clone());
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::write_file,
            commands::read_image_data_uri,
            commands::read_draft,
            commands::write_draft,
            commands::clear_draft,
            commands::take_pending_file,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        // Finder's "Open With", `open -a`, and dropping a file on the dock
        // icon all arrive here.
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let tauri::RunEvent::Opened { urls } = event {
            let Some(path) = urls
                .iter()
                .filter_map(|url| url.to_file_path().ok())
                .map(|path| path.to_string_lossy().into_owned())
                .next()
            else {
                return;
            };

            handle.state::<commands::PendingOpen>().set(path);

            // The payload is deliberately empty: the frontend collects the
            // path via take_pending_file so that a cold start and a running
            // instance follow exactly the same path.
            if let Some(window) = handle.get_webview_window("main") {
                let _ = window.emit("open-pending", ());
            }
        }

        // Keeps the closure's parameters used on non-Apple targets.
        #[cfg(not(any(target_os = "macos", target_os = "ios")))]
        {
            let _ = (handle, event);
        }
    });
}
