import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceSource = readFileSync(
  path.join(projectRoot, "app", "orgchart-studio.tsx"),
  "utf8",
);

test("create, add-child, and metadata forms use an accessible in-app dialog", () => {
  assert.doesNotMatch(workspaceSource, /window\.prompt\s*\(/);
  assert.match(workspaceSource, /type EditorDialogState/);
  assert.match(workspaceSource, /aria-modal="true"/);
  assert.match(workspaceSource, /aria-labelledby="editor-dialog-title"/);
  assert.match(workspaceSource, /autoFocus/);
});
