// Prevents a console window opening alongside the app on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod assets;
mod commands;
mod menu;

use std::borrow::Cow;
use std::sync::Mutex;

use muda::MenuEvent;
use serde_json::{json, Value};
use tao::{
    dpi::LogicalSize,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder},
    window::WindowBuilder,
};
use wry::{
    http::{Request, Response},
    WebViewBuilder,
};

/// Everything that has to reach the main thread becomes one of these.
enum UserEvent {
    /// A JSON envelope from the frontend: `{ id, cmd, args }`.
    Ipc(String),
    /// A menu item id, forwarded to the frontend to act on.
    Menu(String),
}

/// A file the OS asked us to open, parked until the webview is ready.
///
/// When the app is launched *by* opening a file, the path arrives before the
/// frontend has finished loading, so an event emitted then would land on
/// nobody. The frontend collects it via `take_pending_file` instead.
static PENDING_OPEN: Mutex<Option<String>> = Mutex::new(None);

fn main() -> wry::Result<()> {
    // On Windows and Linux a file opened from the shell arrives as argv.
    if let Some(path) = std::env::args().nth(1) {
        if !path.starts_with('-') {
            *PENDING_OPEN.lock().unwrap() = Some(path);
        }
    }

    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();

    let menu = menu::build().expect("failed to build menu");
    #[cfg(target_os = "macos")]
    menu.init_for_nsapp();

    let window = WindowBuilder::new()
        .with_title("Untitled")
        .with_inner_size(LogicalSize::new(1000.0, 760.0))
        .with_min_inner_size(LogicalSize::new(560.0, 400.0))
        .build(&event_loop)
        .expect("failed to create window");

    #[cfg(target_os = "windows")]
    {
        use tao::platform::windows::WindowExtWindows;
        unsafe { menu.init_for_hwnd(window.hwnd()) }.expect("failed to attach menu");
    }
    #[cfg(target_os = "linux")]
    {
        use tao::platform::unix::WindowExtUnix;
        menu.init_for_gtk_window(window.gtk_window(), window.default_vbox())
            .expect("failed to attach menu");
    }

    // Menu clicks and IPC messages both arrive off the event loop, so route
    // them back onto it through the proxy.
    let menu_proxy = event_loop.create_proxy();
    MenuEvent::set_event_handler(Some(move |event: MenuEvent| {
        let _ = menu_proxy.send_event(UserEvent::Menu(event.id().0.clone()));
    }));

    let ipc_proxy = event_loop.create_proxy();

    let mut builder = WebViewBuilder::new()
        .with_ipc_handler(move |req: Request<String>| {
            let _ = ipc_proxy.send_event(UserEvent::Ipc(req.into_body()));
        })
        .with_custom_protocol("app".into(), move |_id, request| serve(&request));

    // Pointing at the Vite dev server keeps hot reload available while
    // developing; the release build always serves the embedded assets.
    builder = match std::env::var("TEXT_EDITOR_DEV_URL") {
        Ok(url) if !url.is_empty() => builder.with_url(url),
        _ => builder.with_url(index_url()),
    };

    #[cfg(not(target_os = "linux"))]
    let webview = builder.build(&window)?;
    #[cfg(target_os = "linux")]
    let webview = {
        use tao::platform::unix::WindowExtUnix;
        use wry::WebViewBuilderExtUnix;
        builder.build_gtk(window.gtk_window())?
    };

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;

        match event {
            Event::UserEvent(UserEvent::Ipc(body)) => {
                if handle_ipc(&webview, &window, &body) {
                    *control_flow = ControlFlow::Exit;
                }
            }

            Event::UserEvent(UserEvent::Menu(id)) => {
                emit(&webview, "menu", &json!(id));
            }

            // Finder's "Open With", `open -a`, and dropping a file on the
            // dock icon all arrive here.
            #[cfg(target_os = "macos")]
            Event::Opened { urls } => {
                if let Some(path) = urls
                    .iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .map(|path| path.to_string_lossy().into_owned())
                    .next()
                {
                    *PENDING_OPEN.lock().unwrap() = Some(path);
                    // Empty payload on purpose: the frontend collects the path
                    // via take_pending_file, so a cold start and a running
                    // instance follow exactly the same route.
                    emit(&webview, "open-pending", &Value::Null);
                }
            }

            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => {
                // Don't exit yet. The frontend flushes unsaved work and then
                // calls close_window, which is what actually ends the loop.
                emit(&webview, "close-requested", &Value::Null);
            }

            _ => {}
        }
    });
}

fn index_url() -> String {
    // wry maps custom protocols onto an http origin on Windows and Android.
    if cfg!(target_os = "windows") {
        "http://app.localhost/".into()
    } else {
        "app://localhost/".into()
    }
}

fn serve(request: &Request<Vec<u8>>) -> Response<Cow<'static, [u8]>> {
    match assets::get(request.uri().path()) {
        Some(asset) => Response::builder()
            .status(200)
            .header("Content-Type", asset.mime)
            // Everything is local and embedded; images are inlined as data
            // URIs by the editor, hence `data:` on img-src.
            .header(
                "Content-Security-Policy",
                "default-src 'self' app: http://app.localhost; \
                 img-src 'self' data: app: http://app.localhost; \
                 style-src 'self' 'unsafe-inline' app: http://app.localhost",
            )
            .body(Cow::Borrowed(asset.body))
            .unwrap(),
        None => Response::builder()
            .status(404)
            .body(Cow::Owned(b"Not found".to_vec()))
            .unwrap(),
    }
}

/// Handles one frontend call. Returns true when the app should exit.
fn handle_ipc(webview: &wry::WebView, window: &tao::window::Window, body: &str) -> bool {
    let Ok(envelope) = serde_json::from_str::<Value>(body) else {
        return false;
    };

    let id = envelope.get("id").and_then(Value::as_i64).unwrap_or(-1);
    let cmd = envelope.get("cmd").and_then(Value::as_str).unwrap_or("");
    let args = envelope.get("args").cloned().unwrap_or(Value::Null);

    if cmd == "close_window" {
        return true;
    }

    let result = dispatch(cmd, &args, window);
    reply(webview, id, result);
    false
}

fn arg<'a>(args: &'a Value, key: &str) -> &'a str {
    args.get(key).and_then(Value::as_str).unwrap_or_default()
}

fn dispatch(cmd: &str, args: &Value, window: &tao::window::Window) -> Result<Value, String> {
    match cmd {
        "read_file" => commands::read_file(arg(args, "path")).map(Value::from),

        "write_file" => {
            commands::write_file(arg(args, "path"), arg(args, "contents")).map(|()| Value::Null)
        }

        "read_image_data_uri" => commands::read_image_data_uri(arg(args, "path")).map(Value::from),

        "read_draft" => commands::read_draft().map(|draft| draft.map_or(Value::Null, Value::from)),

        "write_draft" => commands::write_draft(arg(args, "contents")).map(|()| Value::Null),

        "clear_draft" => commands::clear_draft().map(|()| Value::Null),

        "take_pending_file" => Ok(PENDING_OPEN
            .lock()
            .unwrap()
            .take()
            .map_or(Value::Null, Value::from)),

        "set_title" => {
            window.set_title(arg(args, "title"));
            Ok(Value::Null)
        }

        "dialog_open" => Ok(open_dialog(args)),
        "dialog_save" => Ok(save_dialog(args)),
        "dialog_message" => {
            message_dialog(args, rfd::MessageButtons::Ok);
            Ok(Value::Null)
        }
        "dialog_confirm" => Ok(Value::from(message_dialog(
            args,
            rfd::MessageButtons::OkCancel,
        ))),

        other => Err(format!("Unknown command: {other}")),
    }
}

fn open_dialog(args: &Value) -> Value {
    let mut dialog = rfd::FileDialog::new().set_title(arg(args, "title"));

    // Used by "Insert Image" to narrow the picker; absent elsewhere, because
    // the editor deliberately opens any file type.
    if let Some(extensions) = args.get("extensions").and_then(Value::as_array) {
        let list: Vec<&str> = extensions.iter().filter_map(Value::as_str).collect();
        if !list.is_empty() {
            dialog = dialog.add_filter("Images", &list);
        }
    }

    dialog
        .pick_file()
        .map_or(Value::Null, |path| Value::from(path.to_string_lossy()))
}

fn save_dialog(args: &Value) -> Value {
    let mut dialog = rfd::FileDialog::new().set_title(arg(args, "title"));

    let default = arg(args, "defaultPath");
    if !default.is_empty() {
        let path = std::path::Path::new(default);
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            dialog = dialog.set_file_name(name);
        }
        if let Some(dir) = path.parent().filter(|dir| dir.is_dir()) {
            dialog = dialog.set_directory(dir);
        }
    }

    dialog
        .save_file()
        .map_or(Value::Null, |path| Value::from(path.to_string_lossy()))
}

fn message_dialog(args: &Value, buttons: rfd::MessageButtons) -> bool {
    let level = match arg(args, "kind") {
        "error" => rfd::MessageLevel::Error,
        "warning" => rfd::MessageLevel::Warning,
        _ => rfd::MessageLevel::Info,
    };

    rfd::MessageDialog::new()
        .set_level(level)
        .set_title(arg(args, "title"))
        .set_description(arg(args, "message"))
        .set_buttons(buttons)
        .show()
        == rfd::MessageDialogResult::Ok
}

fn reply(webview: &wry::WebView, id: i64, result: Result<Value, String>) {
    let (ok, payload) = match result {
        Ok(value) => (true, value),
        Err(message) => (false, Value::from(message)),
    };

    let payload = serde_json::to_string(&payload).unwrap_or_else(|_| "null".into());
    let _ = webview.evaluate_script(&format!("window.__bridge.resolve({id},{ok},{payload})"));
}

fn emit(webview: &wry::WebView, event: &str, payload: &Value) {
    let event = serde_json::to_string(event).unwrap_or_else(|_| "\"\"".into());
    let payload = serde_json::to_string(payload).unwrap_or_else(|_| "null".into());
    let _ = webview.evaluate_script(&format!("window.__bridge.emit({event},{payload})"));
}
