//! The built frontend, compiled into the binary.
//!
//! Embedding rather than shipping a resources folder means Windows and Linux
//! distribute a single executable, and it keeps the asset bytes counted
//! honestly against the size budget.

pub struct Asset {
    pub body: &'static [u8],
    pub mime: &'static str,
}

const INDEX_HTML: &[u8] = include_bytes!("../../dist/index.html");
const APP_JS: &[u8] = include_bytes!("../../dist/app.js");
const APP_CSS: &[u8] = include_bytes!("../../dist/app.css");

pub fn get(path: &str) -> Option<Asset> {
    match path.trim_start_matches('/') {
        "" | "index.html" => Some(Asset {
            body: INDEX_HTML,
            mime: "text/html",
        }),
        "app.js" => Some(Asset {
            body: APP_JS,
            mime: "text/javascript",
        }),
        "app.css" => Some(Asset {
            body: APP_CSS,
            mime: "text/css",
        }),
        _ => None,
    }
}
