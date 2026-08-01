// Bundles the frontend *.test.ts files with esbuild (already present via Vite)
// and runs them under node:test. Bundling avoids needing a test runner
// dependency or a TypeScript loader just to resolve extensionless imports.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

execFileSync(
  "./node_modules/.bin/esbuild",
  [...tests, "--bundle", "--platform=node", "--format=esm", "--external:node:*", `--outdir=${outdir}`],
  { stdio: "inherit" },
);

// Pass the bundled files explicitly; `node --test <dir>` does not pick them
// up reliably from a directory outside the project.
const bundled = readdirSync(outdir)
  .filter((name) => name.endsWith(".js"))
  .map((name) => join(outdir, name));

execFileSync("node", ["--test", ...bundled], { stdio: "inherit" });
