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

test("AI proposal review keeps actionable buttons and failures inside its modal", () => {
  assert.match(workspaceSource, /data-ai-proposal-action="reject"/);
  assert.match(workspaceSource, /data-ai-proposal-action="accept"/);
  assert.match(workspaceSource, /aria-busy=\{aiProposalBusy === "reject"\}/);
  assert.match(workspaceSource, /aria-busy=\{aiProposalBusy === "accept"\}/);
  assert.match(workspaceSource, /className="ai-review-panel__error" role="alert"/);
  assert.match(workspaceSource, /controller\.abort\(\), 15_000/);
});

test("AI imports require an in-app create or reject decision", () => {
  assert.match(workspaceSource, /aria-labelledby="ai-import-review-title"/);
  assert.match(workspaceSource, /data-ai-import-action="reject"/);
  assert.match(workspaceSource, /data-ai-import-action="accept"/);
  assert.match(workspaceSource, /Nothing has been added to the library/);
});
