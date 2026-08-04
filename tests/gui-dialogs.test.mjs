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
  assert.match(workspaceSource, /data-ai-proposal-action="defer"/);
  assert.match(workspaceSource, /data-ai-proposal-action="reject"/);
  assert.match(workspaceSource, /data-ai-proposal-action="accept"/);
  assert.match(workspaceSource, /Nothing has changed yet/);
  assert.match(workspaceSource, /Apply change to chart/);
  assert.match(workspaceSource, /awaiting review/);
  assert.match(workspaceSource, /aria-busy=\{aiProposalBusy === "reject"\}/);
  assert.match(workspaceSource, /aria-busy=\{aiProposalBusy === "accept"\}/);
  assert.match(workspaceSource, /className="ai-review-panel__error" role="alert"/);
  assert.match(workspaceSource, /controller\.abort\(\), 15_000/);
});

test("first-run onboarding is interactive, dismissible, and replayable", () => {
  assert.match(workspaceSource, /orgchart-studio-onboarding-v1/);
  assert.match(workspaceSource, /Tips &amp; tour/);
  assert.match(workspaceSource, /aria-labelledby="onboarding-tour-title"/);
  assert.match(
    workspaceSource,
    /onboardingStep === null \|\| reviewNeedsAttention[\s\S]*ONBOARDING_TOUR_STEPS\[onboardingStep\]/,
  );
  assert.match(workspaceSource, /Skip tour/);
  assert.match(workspaceSource, /Finish tour/);
  assert.match(workspaceSource, /data-tour-target="ai-control"/);
  assert.match(workspaceSource, /data-tour-target="presentation"/);
});

test("compact groups are the default presentation and individual cards remain available", () => {
  assert.match(workspaceSource, /orgchart-studio-presentation-v1/);
  assert.match(workspaceSource, /Compact groups/);
  assert.match(workspaceSource, /Individual cards/);
  assert.match(workspaceSource, /presentationMode === "compact"/);
  assert.match(workspaceSource, /targetSide: "top" \| "left"/);
  assert.match(workspaceSource, /List inside parent group/);
  assert.match(workspaceSource, /Leadership sidecar card/);
});

test("AI imports require an in-app create or reject decision", () => {
  assert.match(workspaceSource, /aria-labelledby="ai-import-review-title"/);
  assert.match(workspaceSource, /data-ai-import-action="reject"/);
  assert.match(workspaceSource, /data-ai-import-action="accept"/);
  assert.match(workspaceSource, /Nothing has been added to the library/);
});
