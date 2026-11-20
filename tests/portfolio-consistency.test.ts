import assert from "node:assert/strict";
import test from "node:test";
import { createBlankChart } from "../lib/chart-library";
import {
  auditPortfolio,
  prioritizedReview,
} from "../lib/portfolio-consistency";
function chart(id: string, person: string) {
  const c = createBlankChart("Synthetic Physics Division", id);
  c.nodes[0].data.unit.name = "Synthetic Physics Division";
  c.nodes[0].data.unit.assignmentLabel = person;
  c.nodes[0].data.unit.positionTitle = "Director";
  c.nodes[0].data.unit.sourceCertainty = "needs_review";
  c.nodes[0].data.unit.effectiveDate = "Not specified by site source";
  return c;
}
test("matching source-backed organization names reveal disagreements without choosing a winner", () => {
  const a = chart("a", "Synthetic Alice"),
    b = chart("b", "Synthetic Bob");
  const issues = auditPortfolio([a, b]);
  assert.equal(issues[0].category, "assignment");
  assert.equal(issues[0].appearances.length, 2);
  assert.equal(prioritizedReview([a, b])[0].priority, 0);
  assert.equal(a.nodes[0].data.unit.assignmentLabel, "Synthetic Alice");
  b.status = "archived";
  assert.equal(auditPortfolio([a, b]).length, 0);
});
test("planned records and deliberately repeated team leads are not treated as current leadership conflicts", () => {
  const a = chart("a", "Synthetic Alice"),
    b = chart("b", "Synthetic Bob");
  b.nodes[0].data.unit.planningState = "planned";
  assert.equal(auditPortfolio([a, b]).length, 0);
  b.nodes[0].data.unit.planningState = "current";
  for (const c of [a, b]) c.nodes[0].data.unit.name = "Group Team Leads";
  assert.equal(auditPortfolio([a, b]).length, 0);
});

test("reusable position titles compare within parent organizations, not across unrelated directorates", () => {
  function withPosition(id:string, parent:string, person:string) {
    const c=chart(id,"Synthetic director");
    c.nodes[0].data.unit.name=parent;
    const position=structuredClone(c.nodes[0]);
    position.id=id+"-admin";position.data.unit.id=position.id;
    position.data.unit.name="Administrative Services Manager";
    position.data.unit.positionTitle="Administrative Services Manager";
    position.data.unit.assignmentLabel=person;
    c.nodes.push(position);c.edges.push({id:id+"-edge",source:c.nodes[0].id,target:position.id});
    return c;
  }
  const a=withPosition("a","Synthetic Physics Directorate","Synthetic Alice");
  const b=withPosition("b","Synthetic Chemistry Directorate","Synthetic Bob");
  assert.equal(auditPortfolio([a,b]).length,0);
  b.nodes[0].data.unit.name="Synthetic Physics Directorate";
  const disagreements=auditPortfolio([a,b]);
  assert.equal(disagreements.length,1);
  assert.equal(disagreements[0].organization,"Administrative Services Manager");
  assert.equal(disagreements[0].category,"assignment");
});
