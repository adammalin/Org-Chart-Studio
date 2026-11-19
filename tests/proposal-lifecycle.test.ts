import assert from "node:assert/strict";
import test from "node:test";
import { createBlankChart } from "../lib/chart-library";
import { appliedProposalStatus, archiveProposalError, proposalTargetStatus } from "../lib/proposal-lifecycle";
import { diffChartDocuments } from "../lib/ai-change-review";

test("archiving remains a reviewable lifecycle-only change without deleting source data", () => {
  const current = createBlankChart("Synthetic historical chart", "synthetic-history");
  const proposed = structuredClone(current); proposed.status = "archived";
  assert.equal(archiveProposalError(current, proposed), null);
  assert.equal(proposalTargetStatus(current.status, proposed.status), "archived");
  assert.equal(appliedProposalStatus(current.status, proposed.status), "archived");
  const { changes } = diffChartDocuments(current, proposed);
  assert.deepEqual(changes.map(x => x.field), ["status"]);
  assert.deepEqual(current.nodes, proposed.nodes);
  proposed.nodes[0].data.unit.assignmentLabel = "Synthetic changed assignment";
  assert.match(archiveProposalError(current, proposed)!, /preserve/);
});

test("AI proposals cannot promote drafts to Current or bypass returning approved edits to Draft", () => {
  assert.equal(proposalTargetStatus("draft", "current"), "draft");
  assert.equal(appliedProposalStatus("current", "current"), "draft");
  assert.equal(appliedProposalStatus("current", "archived"), "archived");
});
