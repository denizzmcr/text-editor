import assert from "node:assert/strict";
import test from "node:test";

import {
  formatForPath,
  markdownToHtml,
  textToHtml,
} from "./formats";

test("chooses format from the extension, defaulting to plain text", () => {
  assert.equal(formatForPath("/a/b/notes.html"), "html");
  assert.equal(formatForPath("/a/b/notes.HTM"), "html");
  assert.equal(formatForPath("/a/b/notes.md"), "markdown");
  assert.equal(formatForPath("/a/b/main.rs"), "text");
  assert.equal(formatForPath("/a/b/script.py"), "text");
  assert.equal(formatForPath("/a/b/notes.txt"), "text");
  assert.equal(formatForPath("/a/b/Makefile"), "text");
  assert.equal(formatForPath("/a/b/.gitignore"), "text");
});

test("source code survives being loaded as plain text", () => {
  // The bug this guards: parsing a Rust file as HTML swallowed <String>.
  const rust = "fn main() {\n    let v: Vec<String> = vec![];\n}";
  const html = textToHtml(rust);

  assert.ok(html.includes("Vec&lt;String&gt;"), html);
  assert.ok(html.includes("&amp;") === false);
  // One paragraph per line, indentation preserved verbatim.
  assert.equal(html.split("<p>").length - 1, 3);
  assert.ok(html.includes("<p>    let v: Vec&lt;String&gt; = vec![];</p>"), html);
});

test("escapes ampersands and angle brackets in plain text", () => {
  assert.equal(textToHtml("a & b < c"), "<p>a &amp; b &lt; c</p>");
});

test("normalises CRLF without producing blank paragraphs", () => {
  assert.equal(textToHtml("one\r\ntwo"), "<p>one</p><p>two</p>");
});

test("reads the markdown subset the exporter writes", () => {
  assert.equal(markdownToHtml("# Title"), "<h1>Title</h1>");
  assert.equal(markdownToHtml("### Sub"), "<h3>Sub</h3>");
  assert.equal(markdownToHtml("**bold**"), "<p><strong>bold</strong></p>");
  assert.equal(markdownToHtml("*italic*"), "<p><em>italic</em></p>");
  assert.equal(
    markdownToHtml("![alt](data:image/png;base64,AAA)"),
    '<p><img src="data:image/png;base64,AAA" alt="alt"></p>',
  );
});

test("restores indent levels written as nbsp runs", () => {
  const html = markdownToHtml("&nbsp;&nbsp;&nbsp;&nbsp;indented");
  assert.ok(html.includes('data-indent="1"'), html);
  assert.ok(html.includes("margin-left: 32px"), html);
});

test("separates markdown blocks on blank lines", () => {
  assert.equal(markdownToHtml("one\n\ntwo"), "<p>one</p><p>two</p>");
});

test("treats literal markup in a markdown file as text", () => {
  assert.ok(markdownToHtml("a <script> tag").includes("&lt;script&gt;"));
});

test("undoes the exporter's backslash escaping", () => {
  assert.equal(markdownToHtml("2 \\* 3"), "<p>2 * 3</p>");
});
