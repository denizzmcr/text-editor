//! File I/O, unchanged in behaviour from the Tauri build. These are plain
//! `std::fs` functions; only the command plumbing around them differs.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use base64::Engine;

pub fn read_file(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| format!("Could not open {path}: {e}"))
}

/// Writes atomically: the contents go to a temp file in the same directory,
/// get flushed to disk, and only then replace the target via rename.
///
/// This matters because auto-save fires while the user is typing. A plain
/// truncate-and-write that is interrupted mid-flight would leave the user's
/// document truncated on disk; a rename is atomic, so the file on disk is
/// always either the previous version or the complete new one.
pub fn write_file(path: &str, contents: &str) -> Result<(), String> {
    let target = Path::new(path);
    let dir = target
        .parent()
        .ok_or_else(|| format!("Invalid path: {path}"))?;
    let name = target
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("document");
    let tmp = dir.join(format!(".{name}.saving"));

    {
        let mut file =
            fs::File::create(&tmp).map_err(|e| format!("Could not write to {path}: {e}"))?;
        file.write_all(contents.as_bytes())
            .map_err(|e| format!("Could not write to {path}: {e}"))?;
        file.sync_all()
            .map_err(|e| format!("Could not flush {path}: {e}"))?;
    }

    fs::rename(&tmp, target).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("Could not save {path}: {e}")
    })
}

/// Reads an image off disk and returns it as a `data:` URI so it can be
/// embedded directly in the document, keeping saved files self-contained
/// with no sidecar assets.
pub fn read_image_data_uri(path: &str) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| format!("Could not read image {path}: {e}"))?;
    let mime = mime_for(path);
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
}

fn mime_for(path: &str) -> &'static str {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase());

    match ext.as_deref() {
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        Some("heic") => "image/heic",
        _ => "application/octet-stream",
    }
}

// --- Draft recovery -------------------------------------------------------
//
// A document that has never been saved has nowhere to auto-save to. Rather
// than leave that work unprotected, it is mirrored to a draft file in the
// per-user data dir and restored on next launch.

/// Per-user data directory, resolved without a framework.
fn app_data_dir() -> Result<PathBuf, String> {
    let base = if cfg!(target_os = "windows") {
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .ok_or_else(|| "APPDATA is not set".to_string())?
    } else if cfg!(target_os = "macos") {
        home_dir()?.join("Library").join("Application Support")
    } else {
        match std::env::var_os("XDG_DATA_HOME") {
            Some(dir) => PathBuf::from(dir),
            None => home_dir()?.join(".local").join("share"),
        }
    };

    Ok(base.join("com.deniz.texteditor"))
}

fn home_dir() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "HOME is not set".to_string())
}

fn draft_file() -> Result<PathBuf, String> {
    let dir = app_data_dir()?;
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    Ok(dir.join("draft.html"))
}

pub fn read_draft() -> Result<Option<String>, String> {
    let path = draft_file()?;
    match fs::read_to_string(&path) {
        Ok(contents) => Ok(Some(contents)),
        // A missing draft is the normal case, not an error.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Could not read draft: {e}")),
    }
}

pub fn write_draft(contents: &str) -> Result<(), String> {
    let path = draft_file()?;
    write_file(&path.to_string_lossy(), contents)
}

pub fn clear_draft() -> Result<(), String> {
    let path = draft_file()?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Could not clear draft: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("text-editor-test-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn path_string(path: &Path) -> String {
        path.to_string_lossy().into_owned()
    }

    #[test]
    fn round_trips_contents() {
        let file = temp_dir("round-trip").join("doc.html");
        let body = "<h1>Title</h1><p>Body with <strong>bold</strong>.</p>";

        write_file(&path_string(&file), body).unwrap();

        assert_eq!(read_file(&path_string(&file)).unwrap(), body);
    }

    #[test]
    fn overwrites_without_leaving_temp_files() {
        let dir = temp_dir("overwrite");
        let file = dir.join("doc.html");

        write_file(&path_string(&file), "first").unwrap();
        write_file(&path_string(&file), "second").unwrap();

        assert_eq!(read_file(&path_string(&file)).unwrap(), "second");

        // The rename must consume the temp file; a leftover would show up in
        // the user's folder next to their document.
        let stragglers: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|name| name != "doc.html")
            .collect();
        assert!(stragglers.is_empty(), "left behind: {stragglers:?}");
    }

    #[test]
    fn shrinking_a_file_does_not_leave_a_tail() {
        // Guards the truncation bug that a naive open-and-write would have:
        // writing shorter content over longer content must not leave the
        // remainder of the old document behind.
        let file = temp_dir("shrink").join("doc.html");

        write_file(&path_string(&file), &"a".repeat(5000)).unwrap();
        write_file(&path_string(&file), "short").unwrap();

        assert_eq!(read_file(&path_string(&file)).unwrap(), "short");
    }

    #[test]
    fn reports_an_error_for_an_unwritable_directory() {
        let missing = std::env::temp_dir().join("text-editor-does-not-exist/doc.html");
        assert!(write_file(&path_string(&missing), "x").is_err());
    }

    #[test]
    fn detects_image_types_case_insensitively() {
        assert_eq!(mime_for("/tmp/a.png"), "image/png");
        assert_eq!(mime_for("/tmp/a.JPG"), "image/jpeg");
        assert_eq!(mime_for("/tmp/a.jpeg"), "image/jpeg");
        assert_eq!(mime_for("/tmp/a.svg"), "image/svg+xml");
        assert_eq!(mime_for("/tmp/a.unknown"), "application/octet-stream");
    }

    #[test]
    fn app_data_dir_is_absolute_and_namespaced() {
        // Guards the hand-rolled replacement for Tauri's path resolver.
        let dir = app_data_dir().unwrap();
        assert!(dir.is_absolute(), "{dir:?}");
        assert!(dir.ends_with("com.deniz.texteditor"), "{dir:?}");
    }
}
