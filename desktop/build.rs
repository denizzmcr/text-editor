use std::path::Path;

/// The binary embeds the built frontend with `include_bytes!`, so the files
/// have to exist before rustc runs. Failing here with a clear message beats a
/// confusing "couldn't read file" from the macro.
fn main() {
    let dist = Path::new("../dist");

    for file in ["index.html", "app.js", "app.css"] {
        let path = dist.join(file);
        if !path.exists() {
            panic!(
                "Missing {}.\n\
                 The desktop binary embeds the built frontend, so run `npm run build` first \
                 (or use `npm run desktop:build`, which does both).",
                path.display()
            );
        }
        println!("cargo:rerun-if-changed={}", path.display());
    }
}
