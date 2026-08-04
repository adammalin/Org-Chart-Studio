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
  assert.match(workspaceSource, /orgchart-studio-compact-layout-v1/);
  assert.match(workspaceSource, /Compact layout direction/);
  assert.match(workspaceSource, />\s*Vertical\s*</);
  assert.match(workspaceSource, />\s*Horizontal\s*</);
  assert.match(workspaceSource, /return "vertical"/);
});

test("AI imports require an in-app create or reject decision", () => {
  assert.match(workspaceSource, /aria-labelledby="ai-import-review-title"/);
  assert.match(workspaceSource, /data-ai-import-action="reject"/);
  assert.match(workspaceSource, /data-ai-import-action="accept"/);
  assert.match(workspaceSource, /Nothing has been added to the library/);
});

test("completed MCP work refreshes the visible library and opens review screens automatically", () => {
  assert.match(workspaceSource, /handledMcpCompletionRevisionRef/);
  assert.match(workspaceSource, /The chart library refreshed automatically/);
  assert.match(workspaceSource, /activity\.completionKind === "review_ready"/);
  assert.match(workspaceSource, /await loadMcpReview\(activity\)/);
  assert.match(workspaceSource, /setCharts\(data\.charts\)/);
});

test("source review queue explains and resolves cards and reporting lines", () => {
  assert.match(workspaceSource, /Source review queue/);
  assert.match(workspaceSource, /resolveCardSourceReview/);
  assert.match(workspaceSource, /resolveRelationshipSourceReview/);
  assert.match(workspaceSource, /Correct record/);
  assert.match(workspaceSource, /Reject &amp; remove/);
  assert.match(workspaceSource, /Reject \/ change line/);
  assert.match(workspaceSource, /there is no blanket Confirm all/);
  assert.match(workspaceSource, /Next chart with reviews/);
});

test("review decisions show autosave and close guidance", () => {
  assert.match(workspaceSource, /All current decisions are saved/);
  assert.match(workspaceSource, /Wait for Saved before closing the app/);
  assert.match(workspaceSource, /reportSaveState\(saveState\)/);
  assert.match(workspaceSource, /A save issue needs attention before quitting/);
  assert.match(workspaceSource, /Wait for Saved before opening another chart/);
  assert.match(workspaceSource, /retryCurrentSave/);
  assert.match(workspaceSource, /Retry save/);
});

test("chart lifecycle exposes guarded Current and safe archived workflows", () => {
  assert.match(workspaceSource, /Draft[\s\S]*In review[\s\S]*Current[\s\S]*Archived/);
  assert.match(workspaceSource, /Create checkpoint and mark Current/);
  assert.match(workspaceSource, /Review queue is clear/);
  assert.match(workspaceSource, /Archived chart · read-only/);
  assert.match(workspaceSource, /Restore as draft/);
  assert.match(workspaceSource, /Type the complete chart name to confirm/);
  assert.match(workspaceSource, /Archive a chart before permanently deleting it/);
  assert.match(workspaceSource, /Chart lifecycle is authoritative/);
  assert.match(workspaceSource, /Internal current record/);
});
