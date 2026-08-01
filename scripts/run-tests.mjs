// Bundles the frontend *.test.ts files with esbuild and runs them under
// node:test. Bundling avoids needing a test-runner dependency or a TypeScript
// loader just to resolve extensionless imports.
//
// Uses esbuild's JS API rather than its CLI: the binary in node_modules/.bin
// is a shell script on POSIX and a .cmd on Windows, so spawning it by path is
// not portable.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build } from "esbuild";

const SRC = "src";

function findTests(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return findTests(path);
    return entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

const tests = findTests(SRC);
if (tests.length === 0) {
  console.log("No test files found.");
  process.exit(0);
}

const outdir = mkdtempSync(join(tmpdir(), "text-editor-tests-"));

await build({
  entryPoints: tests,
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["node:*"],
  outdir,
  logLevel: "error",
});

// Pass the bundled files explicitly; `node --test <dir>` does not pick them
// up reliably from a directory outside the project.
const bundled = readdirSync(outdir)
  .filter((name) => name.endsWith(".js"))
  .map((name) => join(outdir, name));

execFileSync(process.execPath, ["--test", ...bundled], { stdio: "inherit" });
